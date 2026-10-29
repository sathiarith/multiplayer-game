import { Link } from "react-router";

export default function Play() {
  return (
    <>
      <h1 className="h3">Game</h1>
      <p className="text-body-secondary">
        The game canvas arrives in Story 4.3.
      </p>
      <Link to="/characters">Back to characters</Link>
    </>
  );
}
