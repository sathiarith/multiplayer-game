import { useState } from "react";
import { Link, Outlet } from "react-router";
import { useAuth } from "../auth.jsx";
import { describeError } from "../messages.js";

export default function Layout() {
  const { user, logout } = useAuth();
  const [logoutError, setLogoutError] = useState(null);

  async function handleLogout() {
    setLogoutError(null);
    try {
      await logout();
    } catch (err) {
      setLogoutError(err);
    }
  }

  return (
    <>
      <nav className="navbar navbar-dark bg-dark">
        <div className="container">
          <Link className="navbar-brand" to="/">
            Multiplayer Game
          </Link>
          {user && (
            <div className="d-flex align-items-center gap-3">
              <span className="text-light">{user.username}</span>
              <button
                className="btn btn-outline-light btn-sm"
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </nav>
      <main className="container py-4" style={{ maxWidth: 720 }}>
        {logoutError && (
          <div className="alert alert-danger" role="alert">
            {describeError(logoutError)}
          </div>
        )}
        <Outlet />
      </main>
    </>
  );
}
