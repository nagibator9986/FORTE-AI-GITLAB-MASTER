from django.urls import path
from .views import (
    WebhookView,
    ProjectListView,
    ProjectDetailView,
    ProjectMergeRequestListView,
    MergeRequestListView,
    MergeRequestDetailView,
    ProjectSyncView,
    RerunAnalysisView,
    SendRecommendationsView,
)

urlpatterns = [
    path("webhook/gitlab", WebhookView.as_view(), name="gitlab-webhook"),

    # Projects
    path("projects/", ProjectListView.as_view(), name="project-list"),
    path("projects/<int:pk>/", ProjectDetailView.as_view(), name="project-detail"),
    path(
        "projects/<int:pk>/mrs/",
        ProjectMergeRequestListView.as_view(),
        name="project-mr-list",
    ),
    path("projects/sync/", ProjectSyncView.as_view(), name="project-sync"),

    # Merge Requests
    path("mrs/", MergeRequestListView.as_view(), name="mr-list"),
    path("mrs/<int:pk>/", MergeRequestDetailView.as_view(), name="mr-detail"),
    path("mrs/<int:pk>/rerun/", RerunAnalysisView.as_view(), name="mr-rerun"),
    path("mrs/<int:pk>/rerun/", RerunAnalysisView.as_view(), name="mr-rerun"),
    path(
        "mrs/<int:pk>/recommendations/",
        SendRecommendationsView.as_view(),
        name="mr-recommendations",
    ),
]
