import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./Login";
import AuthCallback from "./AuthCallback";
import Dashboard from "./Dashboard";
import Admin from "./Admin";
import ReviewQueue from "./ReviewQueue";
import DiffSetView from "./DiffSetView";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/admin" element={<Admin />} />
      {/* The two pages the automated emails link to. Both are opened straight
          from an inbox, so their paths are part of the contract — renaming one
          silently breaks every email already sent. */}
      <Route path="/admin/queue" element={<ReviewQueue />} />
      <Route path="/diffsets/:diffSetId" element={<DiffSetView />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
