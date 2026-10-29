import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // "/" on Vercel; "/clearance-gateway/" on GitHub Pages (set by the Pages workflow).
  base: process.env.VITE_BASE ?? "/",
  // One .env at the repo root; only VITE_-prefixed variables reach the browser.
  envDir: "../..",
  server: { port: 5173, strictPort: true },
});
