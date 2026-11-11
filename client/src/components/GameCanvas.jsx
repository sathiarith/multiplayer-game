import { useEffect, useRef, useState } from "react";
import { createNetworkGame } from "../game/netGame.js";
import { loadSheets, loadItemImages } from "../game/assets.js";
import { level } from "../game/level.js";
import Hud from "./Hud.jsx";
import "./GameCanvas.css";

export default function GameCanvas({ character, connection }) {
  const canvasRef = useRef(null);
  const [sheets, setSheets] = useState(null); // null while the art loads
  const [hud, setHud] = useState(null);

  // Load the art once. A missing sheet becomes null and a placeholder is drawn.
  useEffect(() => {
    let current = true;
    Promise.all([loadSheets(), loadItemImages()])
      .then(([loaded, items]) => current && setSheets({ ...loaded, items }))
      .catch(() => current && setSheets({}));
    return () => {
      current = false;
    };
  }, []);

  // Run the game while we have both the art and a live connection. The
  // cleanup removes every listener, timer and subscription it set up.
  useEffect(() => {
    if (!sheets || !connection) return undefined;
    const game = createNetworkGame({
      canvas: canvasRef.current,
      level,
      sheets,
      connection,
      you: character.id,
      onHud: setHud,
    });
    game.start();
    // Development builds only: a read-only view for the end-to-end tests, because
    // a canvas cannot be read like the rest of the page. `vite build` removes it.
    if (import.meta.env.DEV)
      window.__game = { players: game.latestPlayers, items: game.latestItems };
    return () => {
      game.stop();
      if (import.meta.env.DEV) delete window.__game;
    };
  }, [sheets, connection, character.id]);

  const width = level.tiles[0].length * level.tileSize;
  const height = level.tiles.length * level.tileSize;

  return (
    <>
      {!sheets && (
        <div className="text-center py-5">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading the game…</span>
          </div>
        </div>
      )}
      <div
        className={`game${sheets ? "" : " d-none"}${connection ? "" : " game--inactive"}`}
      >
        <canvas ref={canvasRef} width={width} height={height} />
        <Hud hud={hud} />
      </div>
    </>
  );
}
