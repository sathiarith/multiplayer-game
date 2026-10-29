export default function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  error,
  help,
  autoComplete,
}) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        className={`form-control${error ? " is-invalid" : ""}`}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        autoComplete={autoComplete}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <div id={`${id}-error`} className="invalid-feedback">
          {error}
        </div>
      ) : help ? (
        <div className="form-text">{help}</div>
      ) : null}
    </div>
  );
}
