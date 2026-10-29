import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../auth.jsx";
import { describeError } from "../messages.js";

export default function RequireAuth() {
  const { status, error, retry } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="alert alert-warning" role="alert">
        <p className="mb-2">{describeError(error)}</p>
        <button className="btn btn-sm btn-outline-dark" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }

  if (status === "anonymous") {
    // Remember where they were going, so login can send them back.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
