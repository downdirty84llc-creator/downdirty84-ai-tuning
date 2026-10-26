import DD84Link from "./DD84Link";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Login from "./Login";
import AuthCallback from "./AuthCallback";
import Dashboard from "./Dashboard";
import Admin from "./Admin";
import ReviewQueue from "./ReviewQueue";
import DiffSetView from "./DiffSetView";
import Buy from "./Buy";
import Paid from "./Paid";
import BusinessContact from "./BusinessContact";
import BrandHeader from "./BrandHeader";
import Help from "./Help";
import Troubleshoot from "./Troubleshoot";

export default function App() {
  const location = useLocation();
  useEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      window.scrollTo(0,0);
      const heading=[...document.querySelectorAll<HTMLElement>('#app-content h1, #app-content h2')].find(node=>node.getClientRects().length);
      if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});document.title=`${heading.textContent} · Down Dirty 84`;}
    });
    return()=>cancelAnimationFrame(frame);
  },[location.pathname]);
  return (
    <>
    <BrandHeader />
    <main id="app-content" tabIndex={-1}>
    <Troubleshoot />
    <Routes>
      <Route path="/troubleshoot" element={null} />
      {/* The front door of a business is its shop, not its login form. */}
      <Route path="/" element={<Navigate to="/buy" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/help" element={<Help />} />
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
    </main>
    <BusinessContact />
    </>
  );
}
