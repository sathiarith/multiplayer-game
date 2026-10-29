import { Navigate, Route, Routes } from "react-router";
import Layout from "./components/Layout.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Characters from "./pages/Characters.jsx";
import Play from "./pages/Play.jsx";
import NotFound from "./pages/NotFound.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<RequireAuth />}>
          <Route path="/characters" element={<Characters />} />
          <Route path="/play" element={<Play />} />
        </Route>
        <Route path="/" element={<Navigate to="/characters" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
