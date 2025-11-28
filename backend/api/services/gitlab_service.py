import requests
from django.conf import settings

AI_LABELS = ["ready-for-merge", "needs-review", "changes-requested", "rejected-by-ai"]


class GitLabService:
    def __init__(self):
        self.base_url = settings.GITLAB_URL.rstrip('/')
        self.headers = {'PRIVATE-TOKEN': settings.GITLAB_TOKEN}

    def get_mr_changes(self, project_id, mr_iid):
        """Fetches the changes (diffs) of a Merge Request."""
        url = f"{self.base_url}/api/v4/projects/{project_id}/merge_requests/{mr_iid}/changes"
        response = requests.get(url, headers=self.headers)
        if response.status_code == 200:
            return response.json()
        return None

    def post_comment(self, project_id, mr_iid, body):
        """Posts a comment to the Merge Request."""
        url = f"{self.base_url}/api/v4/projects/{project_id}/merge_requests/{mr_iid}/notes"
        data = {'body': body}
        requests.post(url, headers=self.headers, json=data)

    def get_mr(self, project_id, mr_iid):
        """Get MR info including current labels."""
        url = f"{self.base_url}/api/v4/projects/{project_id}/merge_requests/{mr_iid}"
        resp = requests.get(url, headers=self.headers)
        if resp.status_code == 200:
            return resp.json()
        return None

    def update_mr_labels(self, project_id, mr_iid, new_ai_labels):
        """
        Update MR labels, replacing only AI_LABELS with new_ai_labels.
        new_ai_labels: list of our AI labels, e.g. ["ready-for-merge"].
        """
        mr = self.get_mr(project_id, mr_iid)
        if not mr:
            return

        current_labels = mr.get("labels", []) or []
        # убираем старые AI-лейблы
        filtered = [l for l in current_labels if l not in AI_LABELS]
        # добавляем новые
        merged = list({*filtered, *new_ai_labels})

        url = f"{self.base_url}/api/v4/projects/{project_id}/merge_requests/{mr_iid}"
        data = {'labels': ",".join(merged)}
        requests.put(url, headers=self.headers, json=data)
