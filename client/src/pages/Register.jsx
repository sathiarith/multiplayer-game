import { useState } from "react";
import { Link, Navigate } from "react-router";
import { useAuth } from "../auth.jsx";
import Field from "../components/Field.jsx";
import ErrorAlert from "../components/ErrorAlert.jsx";
import { validateUsername, validatePassword } from "../validation.js";

export default function Register() {
  const { status, register } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (status === "authenticated") return <Navigate to="/characters" replace />;

  const problems = {
    username: validateUsername(form.username),
    password: validatePassword(form.password),
  };
  const serverFields = error?.fields ?? {};
  // A field's message appears once the user has left it (or tried to submit).
  const shown = (name) =>
    (touched[name] ? problems[name] : "") || serverFields[name] || "";

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError(null); // an old server message no longer applies to new input
  }
  const touch = (e) => setTouched({ ...touched, [e.target.name]: true });

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setTouched({ username: true, password: true });
    if (problems.username || problems.password) return;
    setSubmitting(true);
    setError(null);
    try {
      await register(form);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="card-body">
        <h1 className="h4 mb-3">Create an account</h1>
        <ErrorAlert error={error} />
        <form onSubmit={handleSubmit} noValidate>
          <Field
            id="username"
            label="Username"
            value={form.username}
            onChange={update}
            onBlur={touch}
            error={shown("username")}
            help="3 to 20 letters, numbers or underscores"
            autoComplete="username"
          />
          <Field
            id="password"
            label="Password"
            type="password"
            value={form.password}
            onChange={update}
            onBlur={touch}
            error={shown("password")}
            help="At least 10 characters"
            autoComplete="new-password"
          />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Creating account…" : "Register"}
          </button>
        </form>
        <p className="mt-3 mb-0">
          Already registered? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
