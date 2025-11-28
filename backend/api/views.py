import threading
import time

from django.conf import settings
from django.utils import timezone
from django.db.models import Count, Q

from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.conf import settings
from .models import Project, MergeRequest, Review, Issue
from .serializers import ProjectSerializer, MergeRequestSerializer
from .services.gitlab_service import GitLabService
from .services.llm_service import LLMService


# ====== Вспомогательная функция для анализа MR ======


def run_ai_analysis_for_mr(
    gitlab_project_id: int,
    mr: MergeRequest,
    is_rerun: bool = False,
) -> None:
    """
    Общая логика анализа MR:
    - запрашиваем diff у GitLab
    - гоняем через LLM
    - пересоздаём Review и Issue
    - постим комментарий в GitLab
    - обновляем лейблы в GitLab
    """
    start_time = time.time()

    # Анализируем только открытые MR
    if mr.state != "opened":
        return

    mr_iid = mr.mr_iid

    gitlab = GitLabService()
    changes = gitlab.get_mr_changes(gitlab_project_id, mr_iid)
    if not changes:
        # Можно залогировать, но не падаем
        Review.objects.update_or_create(
            merge_request=mr,
            defaults={
                "recommendation": "failed",
                "confidence": 0.0,
                "summary_text": "AI analysis failed: no diff information received from GitLab.",
                "processing_time_ms": int((time.time() - start_time) * 1000),
            },
        )
        return

    llm = LLMService()
    analysis = llm.analyze_code(mr.title, mr.description, changes)

    if not analysis:
        Review.objects.update_or_create(
            merge_request=mr,
            defaults={
                "recommendation": "failed",
                "confidence": 0.0,
                "summary_text": "AI analysis failed. Please review manually.",
                "processing_time_ms": int((time.time() - start_time) * 1000),
            },
        )
        return

    summary = analysis.get("summary", {}) or {}

    # Пересоздаём ревью (для простоты – всегда одно актуальное)
    Review.objects.filter(merge_request=mr).delete()
    review = Review.objects.create(
        merge_request=mr,
        recommendation=summary.get("recommendation", "pending"),
        confidence=summary.get("confidence", 0.0),
        summary_text=summary.get("short_text", ""),
        processing_time_ms=int((time.time() - start_time) * 1000),
    )

    # Создаём issues
    issues_payload = analysis.get("issues", []) or []
    for issue in issues_payload:
        Issue.objects.create(
            review=review,
            file_path=issue.get("file_path") or "",
            line_number=issue.get("line_number"),
            severity=issue.get("severity") or "INFO",
            message=issue.get("message") or "",
            suggested_fix=issue.get("suggested_fix") or "",
            rule=issue.get("rule") or "",
        )

    frontend_url = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
    dashboard_link = ""
    if frontend_url:
        dashboard_link = (
            f"\n\n---\n"
            f"[Open in AI Code Review Dashboard]({frontend_url}/projects/{mr.project_id})"
        )

    header = "## AI Code Review (re-run)\n\n" if is_rerun else "## AI Code Review\n\n"
    comment_body = (
        f"{header}"
        f"**Recommendation:** `{review.recommendation}` "
        f"(confidence: {(review.confidence * 100):.0f}%)\n\n"
        f"{review.summary_text}"
        f"{dashboard_link}"
    )
    gitlab.post_comment(gitlab_project_id, mr_iid, comment_body)

    # Лейблы в GitLab
    label_map = {
        "merge": "ready-for-merge",
        "needs_fixes": "changes-requested",
        "reject": "rejected-by-ai",
    }
    label = label_map.get(review.recommendation)
    if label:
        gitlab.update_mr_labels(gitlab_project_id, mr_iid, [label])
    else:
        gitlab.update_mr_labels(gitlab_project_id, mr_iid, ["needs-review"])


# ====== Webhook из GitLab ======


class WebhookView(APIView):
    """
    GitLab webhook:
    - Merge Request Hook
    """

    permission_classes = [AllowAny]

    def post(self, request):
        token = request.headers.get("X-Gitlab-Token")
        if token != settings.GITLAB_WEBHOOK_SECRET:
            return Response(
                {"error": "Invalid token"},
                status=status.HTTP_403_FORBIDDEN,
            )

        event_type = request.headers.get("X-Gitlab-Event")
        data = request.data

        if event_type == "Merge Request Hook":
            project_meta = data.get("project", {}) or {}
            mr_meta = data.get("object_attributes", {}) or {}

            thread = threading.Thread(
                target=self.process_mr,
                args=(project_meta, mr_meta),
                daemon=True,
            )
            thread.start()

            return Response(
                {"status": "processing_started"},
                status=status.HTTP_200_OK,
            )

        return Response({"status": "ignored"}, status=status.HTTP_200_OK)

    def process_mr(self, project_meta, mr_meta):
        gitlab_project_id = project_meta.get("id")
        if not gitlab_project_id:
            return

        # 1. Project upsert
        project, _ = Project.objects.update_or_create(
            gitlab_id=gitlab_project_id,
            defaults={
                "name": project_meta.get("name") or "",
                "path_with_namespace": project_meta.get("path_with_namespace") or "",
                "web_url": project_meta.get("web_url") or "",
                "avatar_url": project_meta.get("avatar_url") or "",
                "description": project_meta.get("description") or "",
            },
        )

        mr_iid = mr_meta.get("iid")
        if not mr_iid:
            return

        # 2. Save/Update MR (время берём из GitLab payload, с fallback на now)
        mr, _ = MergeRequest.objects.update_or_create(
            project=project,
            mr_iid=mr_iid,
            defaults={
                "title": mr_meta.get("title") or "",
                "description": mr_meta.get("description") or "",
                "author": (mr_meta.get("last_commit") or {})
                .get("author", {})
                .get("name", "Unknown"),
                "state": mr_meta.get("state") or "",
                "web_url": mr_meta.get("url") or mr_meta.get("web_url") or "",
                "created_at": mr_meta.get("created_at") or timezone.now(),
                "updated_at": mr_meta.get("updated_at") or timezone.now(),
            },
        )

        # 3. Запускаем анализ
        run_ai_analysis_for_mr(gitlab_project_id, mr, is_rerun=False)


# ====== Projects ======


class ProjectSyncView(APIView):
    """
    Ручной синк проектов из GitLab в локальную БД.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        gitlab = GitLabService()
        data = gitlab.list_projects()

        created = 0
        updated = 0

        for p in data:
            obj, is_created = Project.objects.update_or_create(
                gitlab_id=p.get("id"),
                defaults={
                    "name": p.get("name") or "",
                    "path_with_namespace": p.get("path_with_namespace") or "",
                    "web_url": p.get("web_url") or "",
                    "avatar_url": p.get("avatar_url") or "",
                    "description": p.get("description") or "",
                },
            )
            if is_created:
                created += 1
            else:
                updated += 1

        return Response(
            {
                "status": "ok",
                "created": created,
                "updated": updated,
                "total": len(data),
            },
            status=status.HTTP_200_OK,
        )


class ProjectListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = ProjectSerializer

    def get_queryset(self):
        return (
            Project.objects.all()
            .annotate(
                mrs_count=Count("merge_requests", distinct=True),
                open_mrs_count=Count(
                    "merge_requests",
                    filter=Q(merge_requests__state="opened"),
                    distinct=True,
                ),
                reviewed_mrs_count=Count(
                    "merge_requests__latest_review",
                    distinct=True,
                ),
            )
            .order_by("path_with_namespace")
        )


class ProjectDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer


class ProjectMergeRequestListView(generics.ListAPIView):
    """
    Список MR для конкретного проекта.
    """

    permission_classes = [AllowAny]
    serializer_class = MergeRequestSerializer

    def get_queryset(self):
        project_id = self.kwargs["pk"]
        return (
            MergeRequest.objects.filter(project_id=project_id)
            .select_related("project")
            .prefetch_related("latest_review__issues")
        )


# ====== Merge Requests ======


class MergeRequestListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = MergeRequestSerializer

    def get_queryset(self):
        queryset = (
            MergeRequest.objects.all()
            .select_related("project")
            .prefetch_related("latest_review__issues")
        )
        project_id = self.request.query_params.get("project_id")
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset


class MergeRequestDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    queryset = (
        MergeRequest.objects.all()
        .select_related("project")
        .prefetch_related("latest_review__issues")
    )
    serializer_class = MergeRequestSerializer


# ====== Ручной перезапуск анализа MR ======


class RerunAnalysisView(APIView):
    """
    Ручной перезапуск AI-анализа для конкретного MR по его PK (id в БД).
    """

    permission_classes = [AllowAny]

    def post(self, request, pk):
        try:
            mr = MergeRequest.objects.get(pk=pk)
        except MergeRequest.DoesNotExist:
            return Response(
                {"detail": "MergeRequest not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Определяем GitLab project_id
        project_id = None
        if hasattr(mr, "project") and getattr(mr.project, "gitlab_id", None) is not None:
            project_id = mr.project.gitlab_id

        if not project_id:
            return Response(
                {"detail": "GitLab project id is missing"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        def worker():
            run_ai_analysis_for_mr(project_id, mr, is_rerun=True)

        threading.Thread(target=worker, daemon=True).start()
        return Response({"status": "processing_started"}, status=status.HTTP_200_OK)


# ====== Отправка детальных рекомендаций в GitLab ======


class SendRecommendationsView(APIView):
    """
    Отправляет подробные рекомендации по issues в GitLab как отдельный комментарий.
    """

    permission_classes = [AllowAny]

    def post(self, request, pk):
        try:
            mr = MergeRequest.objects.get(pk=pk)
        except MergeRequest.DoesNotExist:
            return Response(
                {"detail": "MergeRequest not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        review = getattr(mr, "latest_review", None)
        if not review:
            return Response(
                {"detail": "No review found for this MR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issues = list(review.issues.all())
        if not issues:
            return Response(
                {"detail": "No issues to send"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Определяем GitLab project_id
        project_id = None
        if hasattr(mr, "project") and getattr(mr.project, "gitlab_id", None) is not None:
            project_id = mr.project.gitlab_id

        if not project_id:
            return Response(
                {"detail": "GitLab project id is missing"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        gitlab = GitLabService()

        # Формируем подробный markdown-комментарий
        body_lines = []
        body_lines.append("## AI Detailed Recommendations\n")
        body_lines.append(
            f"**Overall recommendation:** `{review.recommendation}` "
            f"(confidence: {(review.confidence * 100):.0f}%)\n"
        )
        if review.summary_text:
            body_lines.append(review.summary_text)
        body_lines.append("\n---\n")
        body_lines.append("### Issues by severity\n")

        severities_order = ["CRITICAL", "ERROR", "WARNING", "INFO"]
        issues_by_severity = {s: [] for s in severities_order}
        for issue in issues:
            issues_by_severity.get(issue.severity, []).append(issue)

        for sev in severities_order:
            sev_issues = issues_by_severity.get(sev) or []
            if not sev_issues:
                continue

            body_lines.append(f"\n#### {sev} ({len(sev_issues)})\n")

            for idx, issue in enumerate(sev_issues, start=1):
                header = f"{idx}. `{issue.file_path}:{issue.line_number or 0}`"
                body_lines.append(f"- **Location:** {header}")
                body_lines.append(f"  - **Problem:** {issue.message}")

                if issue.suggested_fix:
                    body_lines.append("  - **Suggestion:**")
                    body_lines.append("    ```")
                    body_lines.append(issue.suggested_fix)
                    body_lines.append("    ```")

                if issue.rule:
                    body_lines.append(f"  - **Rule:** `{issue.rule}`")

                body_lines.append("")

        frontend_url = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
        if frontend_url:
            body_lines.append("---")
            body_lines.append(
                f"[Open this MR in AI Code Review Dashboard]({frontend_url}/projects/{mr.project_id})"
            )
        
        comment_body = "\n".join(body_lines)
        gitlab.post_comment(project_id, mr.mr_iid, comment_body)


        return Response({"status": "comment_sent"}, status=status.HTTP_200_OK)
