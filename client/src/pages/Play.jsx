import { Link, Navigate } from "react-router";
import { useSelectedCharacter } from "../selection.jsx";
import GameCanvas from "../components/GameCanvas.jsx";

export default function Play() {
  const { selected } = useSelectedCharacter();

  // Nothing chosen (for example after a page reload): go pick a character.
  if (!selected) return <Navigate to="/characters" replace />;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">Playing as {selected.name}</h1>
        <Link to="/characters">Back to characters</Link>
      </div>
      <GameCanvas character={selected} />
      <p className="text-body-secondary mt-2 mb-0">
        Move with the arrow keys or WASD.
      </p>
    </>
  );
}
