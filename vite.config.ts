import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { nitro } from "nitro/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

import tailwindcss from "@tailwindcss/vite";

const config = defineConfig({
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"] },
  optimizeDeps: { include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/react-router"] },
  plugins: [
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    nitro({ preset: "bun" }),
    tanstackStart(),
    viteReact(),
  ],
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      external: ["bun"],
    },
  },
  server: {
    fs: { strict: false },
    allowedHosts: true,
  },
});

export default config;
