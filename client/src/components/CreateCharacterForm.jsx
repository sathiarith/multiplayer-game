import { useState } from "react";
import Field from "./Field.jsx";
import ErrorAlert from "./ErrorAlert.jsx";
import { describeError } from "../messages.js";
import { validateCharacterName } from "../validation.js";

export default function CreateCharacterForm({ onCreate }) {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const problem = validateCharacterName(name);
  const nameTaken = error?.code === "name_taken";
  // Show our own message first, then whatever the server said about the field.
  const shown =
    (touched ? problem : "") ||
    error?.fields?.name ||
    (nameTaken ? describeError(error) : "");

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setTouched(true);
    if (problem) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ name });
      setName("");
      setTouched(false);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <ErrorAlert error={nameTaken ? null : error} />
      <Field
        id="character-name"
        label="Character name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null); // an old server message no longer applies
        }}
        onBlur={() => setTouched(true)}
        error={shown}
        help="3 to 16 letters, numbers or underscores. Names are unique."
        autoComplete="off"
      />
      <button className="btn btn-primary" type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create character"}
      </button>
    </form>
  );
}
