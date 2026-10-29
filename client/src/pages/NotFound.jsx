import { Link } from "react-router";

export default function NotFound() {
  return (
    <>
      <h1 className="h3">Page not found</h1>
      <Link to="/">Back to start</Link>
    </>
  );
}
