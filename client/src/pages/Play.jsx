import { useEffect } from "react";
import { Link, Navigate } from "react-router";
import { useAuth } from "../auth.jsx";
import { useSelectedCharacter } from "../selection.jsx";
import { useGameConnection } from "../useGameConnection.js";
import ConnectionStatus from "../components/ConnectionStatus.jsx";
import GameCanvas from "../components/GameCanvas.jsx";

export default function Play() {
  const { selected } = useSelectedCharacter();
  const { retry: recheckLogin } = useAuth();
  const game = useGameConnection(selected?.id);

  // The server says our session is gone: have the auth state look again, and
  // RequireAuth then sends the user to the login page.
  const sessionEnded =
    game.status === "refused" && game.code === "not_authenticated";
  useEffect(() => {
    if (sessionEnded) recheckLogin();
  }, [sessionEnded, recheckLogin]);

  // Nothing chosen (for example after a page reload): go pick a character.
  if (!selected) return <Navigate to="/characters" replace />;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">Playing as {selected.name}</h1>
        <Link to="/characters">Back to characters</Link>
      </div>
      <ConnectionStatus state={game} onReconnect={game.reconnect} />
      <GameCanvas
        character={selected}
        connection={game.status === "connected" ? game.connection : null}
      />
      <p className="text-body-secondary mt-2 mb-0">
        Move with the arrow keys or WASD.
      </p>
    </>
  );
}
