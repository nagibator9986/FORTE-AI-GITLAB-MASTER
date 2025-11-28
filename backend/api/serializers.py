from rest_framework import serializers
from .models import Project, MergeRequest, Review, Issue


class IssueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Issue
        fields = "__all__"


class ReviewSerializer(serializers.ModelSerializer):
    issues = IssueSerializer(many=True, read_only=True)
    issues_found_count = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = "__all__"

    def get_issues_found_count(self, obj):
        return obj.issues.count()


class ProjectSerializer(serializers.ModelSerializer):
    mrs_count = serializers.IntegerField(read_only=True)
    open_mrs_count = serializers.IntegerField(read_only=True)
    reviewed_mrs_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "gitlab_id",
            "name",
            "path_with_namespace",
            "web_url",
            "avatar_url",
            "description",
            "created_at",
            "last_synced_at",
            "mrs_count",
            "open_mrs_count",
            "reviewed_mrs_count",
        ]


class MergeRequestSerializer(serializers.ModelSerializer):
    latest_review = ReviewSerializer(read_only=True)
    project = ProjectSerializer(read_only=True)

    class Meta:
        model = MergeRequest
        fields = "__all__"
