import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProjectsPage from "./ProjectsPage";
import ProjectDashboard from "./ProjectDashboard";
import ProjectStats from "./components/ProjectStats";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDashboard />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
