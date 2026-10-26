import { NavLink } from "react-router-dom";

export default function BrandHeader() {
  return <>
    <a className="skip-link" href="#app-content">Skip to content</a>
    <header className="platform-header">
      <NavLink className="brand-lockup" to="/buy" aria-label="Down Dirty 84 home">
        <img src="/brand/dd84-logo.png" alt="Down Dirty 84 LLC" width="120" height="80" />
        <span><strong>Down Dirty 84</strong><small>PERFORMANCE. WITH EVIDENCE.</small></span>
      </NavLink>
      <nav aria-label="Main navigation">
        <NavLink to="/buy">Services</NavLink>
        <NavLink to="/dashboard">My jobs</NavLink>
        <NavLink to="/troubleshoot">Troubleshoot</NavLink>
        <NavLink to="/dd84-link">DD84 LINK</NavLink>
        <NavLink to="/help">Help</NavLink>
      </nav>
    </header>
  </>;
}
