import DD84Link from "./DD84Link";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./Login";
import AuthCallback from "./AuthCallback";
import Dashboard from "./Dashboard";
import Admin from "./Admin";
import ReviewQueue from "./ReviewQueue";
import DiffSetView from "./DiffSetView";
import Buy from "./Buy";
import Paid from "./Paid";

export default function App() {
  return (
    <Routes>
      {/* The front door of a business is its shop, not its login form. */}
      <Route path="/" element={<Navigate to="/buy" replace />} />
      <Route path="/login" element={<Login />} />
      {/* Public: a customer buys before they have an account. The webhook
          creates it from the email Stripe collected. */}
      <Route path="/buy" element={<Buy />} />
      {/* Stripe's success_url. Must work signed-out — see Paid.tsx. */}
      <Route path="/paid" element={<Paid />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/dd84-link" element={<DD84Link />} />
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
