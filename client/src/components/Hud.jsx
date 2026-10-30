import "./Hud.css";

export default function Hud({ hud }) {
  if (!hud) return null;
  return (
    <div className="hud">
      <span className="hud__name">{hud.name}</span>
      <div
        className="hud__bar"
        role="progressbar"
        aria-label="Health"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hud.hpPercent}
      >
        <div className="hud__fill" style={{ width: `${hud.hpPercent}%` }} />
      </div>
      <span className="hud__hp">
        {hud.hp} / {hud.maxHp}
      </span>
      <span className="hud__pos">
        Tile {hud.col}, {hud.row}
      </span>
    </div>
  );
}
