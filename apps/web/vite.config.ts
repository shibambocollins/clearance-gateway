import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // One .env at the repo root; only VITE_-prefixed variables reach the browser.
  envDir: "../..",
  server: { port: 5173, strictPort: true },
});
