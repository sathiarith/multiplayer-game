import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../auth.jsx";
import { useCharacters } from "../useCharacters.js";
import { useSelectedCharacter } from "../selection.jsx";
import { describeError } from "../messages.js";
import { MAX_CHARACTERS } from "../validation.js";
import CharacterList from "../components/CharacterList.jsx";
import CreateCharacterForm from "../components/CreateCharacterForm.jsx";

export default function Characters() {
  const { status, characters, error, reload, create } = useCharacters();
  const { retry: recheckLogin } = useAuth();
  const { select } = useSelectedCharacter();
  const navigate = useNavigate();

  // A 401 means the session ended. Ask the auth state to look again, and
  // RequireAuth then sends the user to the login page.
  const sessionEnded = error?.status === 401;
  useEffect(() => {
    if (sessionEnded) recheckLogin();
  }, [sessionEnded, recheckLogin]);

  async function handleCreate(input) {
    try {
      return await create(input);
    } catch (err) {
      if (err.status === 401) recheckLogin();
      throw err; // the form shows the message
    }
  }

  function handlePlay(character) {
    select(character);
    navigate("/play");
  }

  const atLimit = characters.length >= MAX_CHARACTERS;

  return (
    <>
      <h1 className="h3 mb-3">Your characters</h1>

      {status === "loading" && (
        <div className="text-center py-4">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading characters…</span>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="alert alert-warning" role="alert">
          <p className="mb-2">{describeError(error)}</p>
          <button className="btn btn-sm btn-outline-dark" onClick={reload}>
            Try again
          </button>
        </div>
      )}

      {status === "ready" && (
        <>
          {characters.length === 0 ? (
            <p className="text-body-secondary">
              You have no characters yet. Create your first one below.
            </p>
          ) : (
            <CharacterList characters={characters} onPlay={handlePlay} />
          )}

          <h2 className="h5">New character</h2>
          {atLimit ? (
            <p className="text-body-secondary">
              You have {MAX_CHARACTERS} of {MAX_CHARACTERS} characters, which is
              the limit.
            </p>
          ) : (
            <CreateCharacterForm onCreate={handleCreate} />
          )}
        </>
      )}
    </>
  );
}
