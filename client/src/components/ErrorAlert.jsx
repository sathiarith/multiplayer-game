import { describeError } from "../messages.js";

export default function ErrorAlert({ error }) {
  if (!error) return null;
  return (
    <div className="alert alert-danger" role="alert">
      {describeError(error)}
    </div>
  );
}
