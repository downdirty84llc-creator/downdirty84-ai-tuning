import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./app/pages/Login";
import AuthCallback from "./app/pages/AuthCallback";
import Dashboard from "./app/pages/Dashboard";
import Admin from "./app/pages/Admin";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
