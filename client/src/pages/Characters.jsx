import { Link } from "react-router";
import { useAuth } from "../auth.jsx";

export default function Characters() {
  const { user } = useAuth();
  return (
    <>
      <h1 className="h3">Your characters</h1>
      <p className="text-body-secondary">
        Signed in as {user.username}. The character list arrives in Story 4.2.
      </p>
      <Link className="btn btn-primary" to="/play">
        Go to the game
      </Link>
    </>
  );
}
