import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

const NAV_ITEMS = [
  { to: "/vendors", label: "Vendors" },
  { to: "/mpn", label: "MPN Mapping" },
  { to: "/pricing", label: "Pricing" },
  { to: "/purchase-requests", label: "Purchase Requests" },
  { to: "/purchase-orders", label: "Purchase Orders" },
  { to: "/analytics", label: "Analytics" },
];

export function Layout() {
  const { me, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">VMS</div>
        <nav className="app-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="app-user">
          {me && (
            <>
              <span className="app-user-email">{me.email}</span>
              <span className={`badge role-${me.role}`}>{me.role}</span>
              <button className="btn btn-ghost" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          )}
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
