import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./Login";
import AuthCallback from "./AuthCallback";
import Dashboard from "./Dashboard";
import JobDashboard from "./JobDashboard";
import Admin from "./Admin.tsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/dashboard/:jobId" element={<JobDashboard />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
