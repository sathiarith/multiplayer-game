import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "bootstrap/dist/css/bootstrap.min.css";
import { AuthProvider } from "./auth.jsx";
import App from "./App.jsx";
import { SelectedCharacterProvider } from "./selection.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SelectedCharacterProvider>
          <App />
        </SelectedCharacterProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
