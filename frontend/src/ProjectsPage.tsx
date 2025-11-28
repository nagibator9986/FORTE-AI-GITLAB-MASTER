import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Project } from "./types";
import { GitPullRequest, FolderGit2, ArrowRight } from "lucide-react";

const API_URL = "http://localhost:8000/api";

const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchProjects = async () => {
    try {
      const res = await axios.get<Project[]>(`${API_URL}/projects/`);
      setProjects(res.data);
    } catch (e) {
      console.error("Failed to fetch projects", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

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
                AI Code Review Assistant
              </h1>
              <p className="text-xs text-gray-500">
                Select a GitLab project to explore Merge Requests
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FolderGit2 className="w-5 h-5 text-blue-500" />
          Projects
        </h2>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center text-gray-500">
            No projects found for this token.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-all flex flex-col justify-between"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="text-xs font-mono text-gray-400">
                      #{p.gitlab_id}
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 truncate">
                      {p.path_with_namespace}
                    </h3>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </div>

                <p className="text-xs text-gray-500 line-clamp-2 mb-3">
                  {p.description || "No description"}
                </p>

                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>MRs: {p.mrs_count}</span>
                  <span>Open: {p.open_mrs_count}</span>
                  <span>Reviewed: {p.reviewed_mrs_count}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ProjectsPage;
