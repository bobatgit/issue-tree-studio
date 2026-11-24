import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * `VITE_BASE_PATH` is only needed for GitHub Pages project sites, which serve
 * from https://<user>.github.io/<repo>/. The deploy workflow sets it from the
 * repository name; local dev and custom domains fall back to "/".
 */
const base = process.env.VITE_BASE_PATH ?? "/";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

/** Short commit for the build stamp: CI provides GITHUB_SHA, local builds ask git. */
function buildSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(buildSha()),
  },
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { target: "es2022", sourcemap: true },
  test: {
    environment: "node",
    include: ["src/test/**/*.test.{ts,tsx}"],
  },
});
