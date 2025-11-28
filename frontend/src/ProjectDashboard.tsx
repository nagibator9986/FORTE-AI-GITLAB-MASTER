import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { MergeRequest, Project } from "./types";
import {
  GitPullRequest,
  Activity,
  Clock,
  AlertTriangle,
  CheckCircle,
  Filter,
  ArrowUpDown,
} from "lucide-react";
import ProjectStats from "./components/ProjectStats";

const API_URL = "http://localhost:8000/api";

type RecFilter = "all" | "merge" | "needs_fixes" | "reject" | "no_review";
type SortBy = "updated_desc" | "issues_desc" | "issues_asc";

const ProjectDashboard: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [mrs, setMrs] = useState<MergeRequest[]>([]);
  const [selectedMr, setSelectedMr] = useState<MergeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isSendingRecs, setIsSendingRecs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI-фильтры/сортировка
  const [recFilter, setRecFilter] = useState<RecFilter>("all");
  const [onlyWithIssues, setOnlyWithIssues] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("updated_desc");

  const fetchData = async () => {
    if (!projectId) return;
    try {
      setError(null);
      const [projectRes, mrsRes] = await Promise.all([
        axios.get(`${API_URL}/projects/${projectId}/`),
        axios.get(`${API_URL}/projects/${projectId}/mrs/`),
      ]);

      setProject(projectRes.data);
      setMrs(mrsRes.data);

      setSelectedMr((prev) => {
        if (!prev) return mrsRes.data[0] ?? null;
        const stillExists = mrsRes.data.find((m: MergeRequest) => m.id === prev.id);
        return stillExists ?? mrsRes.data[0] ?? null;
      });
    } catch (e) {
      console.error("Failed to load project dashboard", e);
      setError("Failed to load project data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const getStatusColor = (rec?: string) => {
    switch (rec) {
      case "merge":
        return "text-green-600 bg-green-100";
      case "needs_fixes":
        return "text-orange-600 bg-orange-100";
      case "reject":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const getIssueSeverityClasses = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-red-100 text-red-800";
      case "ERROR":
        return "bg-red-100 text-red-700";
      case "WARNING":
        return "bg-orange-100 text-orange-700";
      case "INFO":
      default:
        return "bg-blue-100 text-blue-700";
    }
  };

  const handleRerun = async () => {
    if (!selectedMr) return;
    try {
      setIsReanalyzing(true);
      await axios.post(`${API_URL}/mrs/${selectedMr.id}/rerun/`);
      // новые данные подтянутся через периодический fetchData
    } catch (e) {
      console.error("Failed to rerun analysis", e);
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleSendRecommendations = async () => {
    if (!selectedMr) return;
    try {
      setIsSendingRecs(true);
      await axios.post(`${API_URL}/mrs/${selectedMr.id}/recommendations/`);
    } catch (e) {
      console.error("Failed to send recommendations", e);
    } finally {
      setIsSendingRecs(false);
    }
  };

  // === фильтрация + сортировка списка MR ===

  const filteredAndSortedMrs = useMemo(() => {
    let result = [...mrs];

    // фильтр по рекомендации
    result = result.filter((mr) => {
      const rec = mr.latest_review?.recommendation;
      switch (recFilter) {
        case "merge":
        case "needs_fixes":
        case "reject":
          return rec === recFilter;
        case "no_review":
          return !rec;
        case "all":
        default:
          return true;
      }
    });

    // фильтр "только с issues"
    if (onlyWithIssues) {
      result = result.filter(
        (mr) => (mr.latest_review?.issues?.length || 0) > 0
      );
    }

    // сортировка
    result.sort((a, b) => {
      const aIssues = a.latest_review?.issues?.length || 0;
      const bIssues = b.latest_review?.issues?.length || 0;
      const aDate = new Date(a.updated_at).getTime();
      const bDate = new Date(b.updated_at).getTime();

      switch (sortBy) {
        case "issues_desc":
          return bIssues - aIssues || bDate - aDate;
        case "issues_asc":
          return aIssues - bIssues || bDate - aDate;
        case "updated_desc":
        default:
          return bDate - aDate;
      }
    });

    return result;
  }, [mrs, recFilter, onlyWithIssues, sortBy]);

  // === агрегированные метрики по проекту ===

  const projectSummary = useMemo(() => {
    const total = mrs.length;
    const withReview = mrs.filter((m) => m.latest_review).length;
    const recMerge = mrs.filter((m) => m.latest_review?.recommendation === "merge").length;
    const recNeedsFixes = mrs.filter(
      (m) => m.latest_review?.recommendation === "needs_fixes"
    ).length;
    const recReject = mrs.filter(
      (m) => m.latest_review?.recommendation === "reject"
    ).length;

    const allTimes = mrs
      .map((m) => m.latest_review?.processing_time_ms)
      .filter((v): v is number => typeof v === "number" && v > 0);

    const avgMs =
      allTimes.length > 0
        ? Math.round(allTimes.reduce((acc, v) => acc + v, 0) / allTimes.length)
        : 0;

    const avgSec = avgMs / 1000;

    return {
      total,
      withReview,
      recMerge,
      recNeedsFixes,
      recReject,
      avgMs,
      avgSec,
    };
  }, [mrs]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <p className="text-gray-500 mb-4">Project not found.</p>
        <Link
          to="/projects"
          className="text-blue-600 text-sm hover:underline font-medium"
        >
          ← Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <GitPullRequest className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {project.name}
              </h1>
              <div className="text-xs text-gray-500">
                {project.path_with_namespace}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a
              href={project.web_url}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              View on GitLab
            </a>
            <Link
              to="/projects"
              className="text-gray-500 hover:text-gray-700 text-xs"
            >
              ← All projects
            </Link>
          </div>
        </div>
      </header>

      {/* Ошибка загрузки */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
            {error}
          </div>
        </div>
      )}

      {/* Верхний блок с короткими метриками по проекту */}
      <div className="max-w-7xl mx-auto px-4 mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Total MR</div>
          <div className="text-xl font-semibold">{projectSummary.total}</div>
          <div className="text-xs text-gray-400">
            {projectSummary.withReview} analyzed
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Recommendations</div>
          <div className="text-sm text-gray-700">
            ✅ {projectSummary.recMerge} merge
          </div>
          <div className="text-sm text-gray-700">
            ✏️ {projectSummary.recNeedsFixes} needs fixes
          </div>
          <div className="text-sm text-gray-700">
            ❌ {projectSummary.recReject} reject
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Avg AI analysis time</div>
          <div className="text-xl font-semibold">
            {projectSummary.avgSec > 0
              ? `${projectSummary.avgSec.toFixed(1)} s`
              : "—"}
          </div>
          {projectSummary.avgMs > 0 && (
            <div className="text-xs text-gray-400">
              ({projectSummary.avgMs} ms)
            </div>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">Current selection</div>
          <div className="text-sm text-gray-700">
            {selectedMr ? `!${selectedMr.mr_iid}` : "No MR selected"}
          </div>
          {selectedMr?.latest_review && (
            <div className="text-xs text-gray-400">
              {formatRecommendation(selectedMr.latest_review.recommendation)}
            </div>
          )}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col: MR List + Stats */}
        <div className="lg:col-span-1 space-y-6">
          {/* Фильтры */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Filter className="w-4 h-4" />
                Filters
              </div>
              <button
                className="text-xs text-gray-400 hover:text-gray-600"
                onClick={() => {
                  setRecFilter("all");
                  setOnlyWithIssues(false);
                  setSortBy("updated_desc");
                }}
              >
                Reset
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {(["all", "merge", "needs_fixes", "reject", "no_review"] as RecFilter[]).map(
                (value) => (
                  <button
                    key={value}
                    onClick={() => setRecFilter(value)}
                    className={`px-2 py-1 text-xs rounded-full border ${
                      recFilter === value
                        ? "bg-blue-50 border-blue-400 text-blue-700"
                        : "border-gray-200 text-gray-600"
                    }`}
                  >
                    {value === "all"
                      ? "All"
                      : value === "no_review"
                      ? "No review"
                      : value.replace("_", " ")}
                  </button>
                )
              )}
            </div>
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-gray-600">
                <input
                  type="checkbox"
                  checked={onlyWithIssues}
                  onChange={(e) => setOnlyWithIssues(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Only with issues
              </label>
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-3 h-3 text-gray-400" />
                <select
                  className="text-xs border border-gray-200 rounded-md px-1.5 py-0.5 bg-white"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                >
                  <option value="updated_desc">Newest updated</option>
                  <option value="issues_desc">Most issues</option>
                  <option value="issues_asc">Least issues</option>
                </select>
              </div>
            </div>
          </div>

          {/* Список MR */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              Merge Requests
            </h2>

            {filteredAndSortedMrs.length === 0 ? (
              <p className="text-center py-4 text-gray-400">
                No MRs match selected filters.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredAndSortedMrs.map((mr) => (
                  <div
                    key={mr.id}
                    onClick={() => setSelectedMr(mr)}
                    className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                      selectedMr?.id === mr.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-mono text-sm text-gray-500">
                        !{mr.mr_iid}
                      </span>
                      {mr.latest_review && (
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${getStatusColor(
                            mr.latest_review.recommendation
                          )}`}
                        >
                          {mr.latest_review.recommendation.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium text-gray-900 line-clamp-1">
                      {mr.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      by {mr.author} •{" "}
                      {new Date(mr.updated_at).toLocaleDateString()}
                    </p>
                    {mr.latest_review && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        Issues: {mr.latest_review.issues.length} • AI time:{" "}
                        {mr.latest_review.processing_time_ms
                          ? `${(
                              mr.latest_review.processing_time_ms / 1000
                            ).toFixed(1)}s`
                          : "n/a"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Графики/статы по проекту */}
          <ProjectStats mrs={mrs} />
        </div>

        {/* Right Col: Details */}
        <div className="lg:col-span-2">
          {selectedMr ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      {selectedMr.title}
                    </h2>
                    <a
                      href={selectedMr.web_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline text-sm mt-1 inline-flex items-center gap-1"
                    >
                      View MR on GitLab{" "}
                      <GitPullRequest className="w-3 h-3" />
                    </a>
                    <p className="text-xs text-gray-500 mt-2">
                      !{selectedMr.mr_iid} • {selectedMr.state} •{" "}
                      {selectedMr.author}
                    </p>
                  </div>

                  {selectedMr.latest_review && (
                    <div className="text-right space-y-3">
                      <div>
                        <div className="text-sm text-gray-500">Confidence</div>
                        <div className="font-mono font-bold text-lg">
                          {(
                            selectedMr.latest_review.confidence * 100
                          ).toFixed(0)}
                          %
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {formatRecommendation(
                            selectedMr.latest_review.recommendation
                          )}
                        </div>
                        {selectedMr.latest_review.processing_time_ms > 0 && (
                          <div className="text-[11px] text-gray-400 mt-1">
                            AI time:{" "}
                            {(
                              selectedMr.latest_review.processing_time_ms /
                              1000
                            ).toFixed(1)}
                            s
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <button
                          onClick={handleRerun}
                          disabled={isReanalyzing}
                          className="inline-flex items-center justify-center px-3 py-1 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isReanalyzing
                            ? "Re-analyzing..."
                            : "Re-run analysis"}
                        </button>

                        <button
                          onClick={handleSendRecommendations}
                          disabled={
                            isSendingRecs ||
                            !selectedMr.latest_review.issues.length
                          }
                          className="inline-flex items-center justify-center px-3 py-1 text-xs border border-blue-500 rounded-md text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSendingRecs
                            ? "Sending..."
                            : "Send recommendations to GitLab"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {selectedMr.latest_review ? (
                <div className="p-6 space-y-8">
                  {/* Summary */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-2">
                      AI Summary
                    </h3>
                    <p className="text-gray-700 leading-relaxed">
                      {selectedMr.latest_review.summary_text}
                    </p>
                  </div>

                  {/* Issues */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-500" />
                      Detected Issues (
                      {selectedMr.latest_review.issues.length})
                    </h3>

                    {selectedMr.latest_review.issues.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                        <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                        No critical issues found.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {selectedMr.latest_review.issues.map((issue, idx) => (
                          <div
                            key={idx}
                            className="border border-gray-200 rounded-lg p-4 bg-white hover:border-gray-300 transition-colors"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-bold ${getIssueSeverityClasses(
                                  issue.severity
                                )}`}
                              >
                                {issue.severity}
                              </span>
                              <span className="text-sm font-mono text-gray-600">
                                {issue.file_path}:{issue.line_number}
                              </span>
                            </div>
                            <p className="text-gray-900 mb-3">
                              {issue.message}
                            </p>
                            {issue.suggested_fix && (
                              <div className="bg-gray-900 rounded-md p-3 overflow-x-auto">
                                <code className="text-sm text-gray-300 font-mono whitespace-pre-wrap">
                                  {issue.suggested_fix}
                                </code>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>Analysis pending or no review data available.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center h-full flex flex-col justify-center items-center">
              <GitPullRequest className="w-16 h-16 text-gray-200 mb-4" />
              <h3 className="text-xl font-medium text-gray-900">
                Select a Merge Request
              </h3>
              <p className="text-gray-500 mt-2">
                Choose an MR from the list to view the AI analysis report.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

function formatRecommendation(rec: string): string {
  switch (rec) {
    case "merge":
      return "Ready for merge";
    case "needs_fixes":
      return "Changes requested";
    case "reject":
      return "Rejected by AI";
    default:
      return rec;
  }
}

export default ProjectDashboard;
