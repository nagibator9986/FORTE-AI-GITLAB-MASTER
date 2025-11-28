export interface Issue {
  id: number;
  file_path: string;
  line_number: number | null;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  message: string;
  suggested_fix: string;
  rule: string;
}

export interface Review {
  id: number;
  recommendation: "merge" | "needs_fixes" | "reject" | "pending" | "failed";
  confidence: number;
  summary_text: string;
  processing_time_ms: number;
  created_at: string;
  issues_found_count: number;
  issues: Issue[];
}

export interface Project {
  id: number;
  gitlab_id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  avatar_url?: string | null;
  description: string;
  mrs_count: number;
  open_mrs_count: number;
  reviewed_mrs_count: number;
}

export interface MergeRequest {
  id: number;
  mr_iid: number;
  title: string;
  description: string;
  author: string;
  state: string;
  web_url: string;
  updated_at: string;
  created_at: string;
  project: Project;
  latest_review: Review | null;
}
export interface Project {
  id: number;
  gitlab_id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  avatar_url?: string | null;
  description?: string | null;
}
