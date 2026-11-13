import { useProgress } from "../useProgress.js";

export default function CombatPanel({ connection, character }) {
  const { level, xp, notice } = useProgress(connection, character);
  const levels = connection?.levels() ?? [];
  const current = levels.find((l) => l.level === level);
  const next = levels.find((l) => l.level === level + 1);
  const share =
    current && next
      ? (xp - current.xpRequired) / (next.xpRequired - current.xpRequired)
      : 1;
  const percent = Math.round(Math.max(0, Math.min(1, share)) * 100);

  return (
    <section className="mt-3 small" aria-label="Character">
      <h2 className="h6 mb-1">Level {level}</h2>
      <p className="mb-1">
        {next ? `${xp} / ${next.xpRequired} XP` : `${xp} XP · highest level`}
      </p>
      <div
        className="progress mb-2"
        role="progressbar"
        aria-label="Progress to the next level"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="progress-bar" style={{ width: `${percent}%` }} />
      </div>
      {notice && (
        <p className="mb-0" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
