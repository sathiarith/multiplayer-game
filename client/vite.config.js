import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1", // open http://127.0.0.1:5173, not localhost
    port: 5173,
    strictPort: true, // fail instead of silently picking another port
    proxy: {
      "/api": "http://127.0.0.1:3001",
      "/socket.io": { target: "http://127.0.0.1:3001", ws: true },
    },
    fs: { allow: [".."] }, // the game imports its rules from ../shared
  },
});
