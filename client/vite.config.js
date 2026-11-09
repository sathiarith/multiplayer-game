import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The end-to-end tests run a second copy of the stack on other ports.
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3001";
const port = Number(process.env.CLIENT_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1", // open http://127.0.0.1:5173, not localhost
    port,
    strictPort: true, // fail instead of silently picking another port
    proxy: {
      "/api": apiUrl,
      "/socket.io": { target: apiUrl, ws: true },
    },
    fs: { allow: [".."] }, // the game imports its rules from ../shared
  },
});
