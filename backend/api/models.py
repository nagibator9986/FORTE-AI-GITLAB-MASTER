from django.db import models


class Project(models.Model):
    """
    GitLab-проект, к которому относятся Merge Requests.
    """
    gitlab_id = models.IntegerField(unique=True)  # ID проекта в GitLab
    name = models.CharField(max_length=255)
    path_with_namespace = models.CharField(max_length=255)
    web_url = models.URLField()
    avatar_url = models.URLField(blank=True, null=True)
    description = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    last_synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["path_with_namespace"]

    def __str__(self):
        return self.path_with_namespace


class MergeRequest(models.Model):
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="merge_requests",
    )
    mr_iid = models.IntegerField()  # internal ID MR внутри проекта
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    author = models.CharField(max_length=100)
    state = models.CharField(max_length=50)
    web_url = models.URLField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        unique_together = ("project", "mr_iid")
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.project.path_with_namespace} !{self.mr_iid} - {self.title}"


class Review(models.Model):
    RECOMMENDATION_CHOICES = [
        ("merge", "Merge"),
        ("needs_fixes", "Needs Fixes"),
        ("reject", "Reject"),
        ("pending", "Pending"),
        ("failed", "Failed"),
    ]

    merge_request = models.OneToOneField(
        MergeRequest,
        on_delete=models.CASCADE,
        related_name="latest_review",
    )
    recommendation = models.CharField(
        max_length=20, choices=RECOMMENDATION_CHOICES, default="pending"
    )
    confidence = models.FloatField(default=0.0)
    summary_text = models.TextField(blank=True)
    processing_time_ms = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Review for MR !{self.merge_request.mr_iid} ({self.recommendation})"


class Issue(models.Model):
    SEVERITY_CHOICES = [
        ("INFO", "Info"),
        ("WARNING", "Warning"),
        ("ERROR", "Error"),
        ("CRITICAL", "Critical"),
    ]

    review = models.ForeignKey(
        Review,
        on_delete=models.CASCADE,
        related_name="issues",
    )
    file_path = models.CharField(max_length=500)
    line_number = models.IntegerField(null=True, blank=True)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES)
    message = models.TextField()
    suggested_fix = models.TextField(blank=True)
    rule = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["-severity", "file_path", "line_number"]

    def __str__(self):
        return f"{self.severity} in {self.file_path}:{self.line_number or 0}"
