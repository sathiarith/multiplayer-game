import { useEffect, useRef, useState } from "react";
import { createGame } from "../game/engine.js";
import { loadLevel, loadSheets } from "../game/assets.js";
import { createStartingPlayer } from "../game/startingPlayer.js";
import Hud from "./Hud.jsx";
import "./GameCanvas.css";

export default function GameCanvas({ character }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [hud, setHud] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let game = null;

    async function start() {
      try {
        const [level, sheets] = await Promise.all([
          loadLevel("/maps/level1.json", controller.signal),
          loadSheets(),
        ]);
        if (controller.signal.aborted) return; // left the page while loading

        game = createGame({
          canvas: canvasRef.current,
          level,
          sheets,
          player: createStartingPlayer(character, level),
          onHud: setHud, // only called when the HUD's values change
        });
        game.start();
        setStatus("ready");
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        setStatus("error");
      }
    }
    start();

    // Cleanup: runs when the page is left, and in development before the
    // effect runs a second time (StrictMode).
    return () => {
      controller.abort();
      game?.stop();
    };
  }, [character]);

  return (
    <>
      {status === "loading" && (
        <div className="text-center py-5">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading the game…</span>
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="alert alert-danger" role="alert">
          The game could not be loaded. Check the browser console for details.
        </div>
      )}
      <div className={`game${status === "ready" ? "" : " d-none"}`}>
        <canvas ref={canvasRef} />
        <Hud hud={hud} />
      </div>
    </>
  );
}
