import { Link, Navigate } from "react-router";
import { useSelectedCharacter } from "../selection.jsx";

export default function Play() {
  const { selected } = useSelectedCharacter();

  // Nothing chosen (for example after a page reload): go pick a character.
  if (!selected) return <Navigate to="/characters" replace />;

  return (
    <>
      <h1 className="h3">Playing as {selected.name}</h1>
      <p className="text-body-secondary">
        Level {selected.level} {selected.class} · {selected.hp} HP · at (
        {Math.round(selected.x)}, {Math.round(selected.y)}). The game canvas
        arrives in Story 4.3.
      </p>
      <Link to="/characters">Back to characters</Link>
    </>
  );
}
