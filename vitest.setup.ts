// Set env vars for @t3-oss/env-core validation (required before env.ts is loaded)
process.env.VITE_AIS_AUTH ??= "true";
process.env.VITE_WORKSPACE_ID ??= "1";
process.env.VITE_API_BASE_URL ??= "https://api.squared.ai";

import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

/**
 * Mock @tanstack/react-start server utilities in the happy-dom test environment.
 * createServerFn returns a chainable stub; the returned function passes its
 * data argument straight to the handler so unit tests can call server
 * functions as regular async functions.
 */
vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    createServerFn: () => {
      const chain = {
        inputValidator: () => chain,
        handler: (fn: (...args: unknown[]) => unknown) => {
          const serverFn = (arg?: { data?: unknown }) =>
            fn({ data: arg?.data });
          serverFn._isServerFn = true;
          return serverFn;
        },
      };
      return chain;
    },
  };
});

vi.mock("@tanstack/react-start/server", () => ({
  getCookie: vi.fn(() => undefined),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));
