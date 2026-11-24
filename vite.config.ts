import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * `VITE_BASE_PATH` is only needed for GitHub Pages project sites, which serve
 * from https://<user>.github.io/<repo>/. The deploy workflow sets it from the
 * repository name; local dev and custom domains fall back to "/".
 */
const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { target: "es2022", sourcemap: true },
  test: {
    environment: "node",
    include: ["src/test/**/*.test.{ts,tsx}"],
  },
});
