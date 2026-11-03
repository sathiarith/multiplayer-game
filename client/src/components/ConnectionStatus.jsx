import { describeConnection } from "../messages.js";

export default function ConnectionStatus({ state, onReconnect }) {
  const info = describeConnection(state);
  if (!info) return null;
  return (
    <div
      className={`alert alert-${info.tone} d-flex justify-content-between align-items-center py-2`}
      role={info.tone === "danger" ? "alert" : "status"}
    >
      <span>{info.text}</span>
      {info.retryLabel && (
        <button className="btn btn-sm btn-outline-dark" onClick={onReconnect}>
          {info.retryLabel}
        </button>
      )}
    </div>
  );
}
