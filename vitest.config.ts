import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Resolve "@/*" the same way the build does (./tsconfig.json maps it to both
  // ./src/* and ../../base/src/*), so tests can import shared base modules.
  plugins: [tsconfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    environment: "happy-dom",
    globals: true,
    env: {
      VITE_AIS_AUTH: "true",
      VITE_WORKSPACE_ID: "1",
    },
    coverage: {
      provider: "v8",
      // all: report changed-but-untested files at 0% (so the PR patch-coverage
      // gate sees them) instead of omitting them; lcov feeds diff-cover in CI.
      all: true,
      reporter: ["text", "lcov"],
      exclude: [
        "node_modules",
        "dist",
        ".tanstack",
        "src/components/ui/**/*.tsx",
        // Generated / non-authored — never gate patch coverage on these.
        "**/*.gen.ts",
        "src/routeTree.gen.ts",
        // scaffolded from /base; drift-guarded by scaffold-sync.test.ts
        "src/server/db/migrate.ts",
        "src/server/db/status.ts",
      ],
      include: ["src/**/*.{ts,tsx}"],
    },
    setupFiles: ["./vitest.setup.ts"],
  },
});
