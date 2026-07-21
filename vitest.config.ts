import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: [],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` is a marker package: Next.js's bundler aliases it to
      // a no-op under the "react-server" condition so it only throws when
      // accidentally bundled into client code. Vitest runs in plain Node
      // with no such aliasing, so any module that imports `server-only`
      // (a correct and intentional safety guard in the real Next.js build)
      // would otherwise fail every unit test that imports it transitively.
      // Aliasing it to a no-op here matches Next's own "react-server"
      // resolution for test purposes only; the real guard still applies
      // in `next build`/`next dev`.
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
});
