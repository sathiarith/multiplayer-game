export default function CharacterList({ characters, onPlay }) {
  return (
    <ul className="list-group mb-4">
      {characters.map((c) => (
        // key tells React which item is which, so it can update the right one
        <li
          key={c.id}
          className="list-group-item d-flex justify-content-between align-items-center"
        >
          <div>
            <div className="fw-semibold">{c.name}</div>
            <small className="text-body-secondary">
              Level {c.level} {c.class} · {c.hp} HP
            </small>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => onPlay(c)}>
            Play
          </button>
        </li>
      ))}
    </ul>
  );
}
