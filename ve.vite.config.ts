// INJECTED AT SANDBOX LAUNCH BY THE PLATFORM — not part of the template repo.
import base from "./vite.config";
import { visualEditPlugin } from "./.ve/visualEditPlugin.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async (env: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolved: any = typeof base === "function" ? await base(env) : base;
  const cfg = resolved || {};
  cfg.plugins = [...(cfg.plugins || []), visualEditPlugin()];
  return cfg;
};
