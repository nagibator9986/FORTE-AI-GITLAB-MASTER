import React from "react";
import { MergeRequest } from "../types";
import { Clock, AlertTriangle, CheckCircle2, FileCode2 } from "lucide-react";

interface Props {
  mrs: MergeRequest[];
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = Math.round(seconds % 60);
  return `${minutes} min ${restSeconds}s`;
}

const ProjectStats: React.FC<Props> = ({ mrs }) => {
  if (!mrs || mrs.length === 0) return null;

  const totalMrs = mrs.length;
  const withReview = mrs.filter((m) => m.latest_review);

  const avgProcessingTimeMs =
    withReview.length > 0
      ? Math.round(
          withReview.reduce(
            (sum, m) => sum + (m.latest_review?.processing_time_ms ?? 0),
            0
          ) / withReview.length
        )
      : 0;

  const totalIssues = withReview.reduce(
    (sum, m) => sum + (m.latest_review?.issues?.length ?? 0),
    0
  );

  const lastAnalyzedAtTs = withReview
    .map((m) => new Date(m.latest_review!.created_at).getTime())
    .sort((a, b) => b - a)[0];

  const lastAnalyzedAt = lastAnalyzedAtTs
    ? new Date(lastAnalyzedAtTs).toLocaleString()
    : null;

  const recCounts = {
    merge: withReview.filter(
      (m) => m.latest_review!.recommendation === "merge"
    ).length,
    needs_fixes: withReview.filter(
      (m) => m.latest_review!.recommendation === "needs_fixes"
    ).length,
    reject: withReview.filter(
      (m) => m.latest_review!.recommendation === "reject"
    ).length,
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Project Analytics
        </h3>
        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
          <Clock className="w-3 h-3" />
          {lastAnalyzedAt
            ? `Last analyzed: ${lastAnalyzedAt}`
            : "No analyses yet"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        {/* Total MRs */}
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 flex items-start gap-2">
          <div className="mt-0.5">
            <FileCode2 className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <div className="text-xs text-gray-500">Merge Requests</div>
            <div className="text-lg font-semibold text-gray-900">
              {totalMrs}
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
          <div className="text-xs text-gray-500 mb-1">AI Recommendations</div>
          <div className="flex flex-wrap gap-1 text-[11px]">
            <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
              Merge: {recCounts.merge}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
              Fixes: {recCounts.needs_fixes}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
              Reject: {recCounts.reject}
            </span>
          </div>
        </div>

        {/* Avg time */}
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 flex items-start gap-2">
          <div className="mt-0.5">
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
          <div>
            <div className="text-xs text-gray-500">Avg analysis time</div>
            <div className="text-sm font-semibold text-gray-900">
              {withReview.length > 0 ? formatDuration(avgProcessingTimeMs) : "—"}
            </div>
          </div>
        </div>

        {/* Total issues */}
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 flex items-start gap-2">
          <div className="mt-0.5">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <div className="text-xs text-gray-500">Issues found</div>
            <div className="text-lg font-semibold text-gray-900">
              {totalIssues}
            </div>
            <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              {withReview.length} reviewed MR
              {withReview.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectStats;
