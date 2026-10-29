import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { useAuth } from "../auth.jsx";
import Field from "../components/Field.jsx";
import ErrorAlert from "../components/ErrorAlert.jsx";

export default function Login() {
  const { status, login } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Already logged in (or just logged in): leave this page.
  if (status === "authenticated") {
    return (
      <Navigate to={location.state?.from?.pathname ?? "/characters"} replace />
    );
  }

  const problems = {
    username: form.username === "" ? "Enter your username" : "",
    password: form.password === "" ? "Enter your password" : "",
  };
  const shown = (name) => (attempted ? problems[name] : "");

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return; // ignore a second click while the request is running
    setAttempted(true);
    if (problems.username || problems.password) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(form);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="card-body">
        <h1 className="h4 mb-3">Log in</h1>
        <ErrorAlert error={error} />
        <form onSubmit={handleSubmit} noValidate>
          <Field
            id="username"
            label="Username"
            value={form.username}
            onChange={update}
            error={shown("username")}
            autoComplete="username"
          />
          <Field
            id="password"
            label="Password"
            type="password"
            value={form.password}
            onChange={update}
            error={shown("password")}
            autoComplete="current-password"
          />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>
        <p className="mt-3 mb-0">
          No account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
