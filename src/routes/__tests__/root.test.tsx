import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/auth", () => ({ getAuthState: vi.fn() }));
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    redirect: vi.fn((options: { to: string; replace?: boolean }) => {
      throw { isRedirect: true, ...options };
    }),
  };
});

import { redirect } from "@tanstack/react-router";
import { getAuthState } from "@/server/auth";
import { Route } from "@/routes/__root";

type AuthState = {
  allowed: boolean;
  authEnabled: boolean;
  hasToken: boolean;
};

const beforeLoad = Route.options.beforeLoad as (_args: {
  location: { pathname: string; searchStr: string; hash: string };
}) => Promise<void>;

const loc = (pathname: string) => ({
  location: { pathname, searchStr: "", hash: "" },
});

const mockAuth = (state: AuthState) =>
  vi
    .mocked(getAuthState)
    .mockResolvedValue(state as Awaited<ReturnType<typeof getAuthState>>);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("__root beforeLoad auth gate", () => {
  it("redirects /sign-in -> / in public-link mode (auth disabled)", async () => {
    mockAuth({ allowed: true, authEnabled: false, hasToken: false });

    await expect(beforeLoad(loc("/sign-in"))).rejects.toMatchObject({
      to: "/",
      replace: true,
    });
  });

  it("stays on /sign-in when auth is enabled", async () => {
    mockAuth({ allowed: false, authEnabled: true, hasToken: false });

    await expect(beforeLoad(loc("/sign-in"))).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects protected route -> /sign-in when not allowed", async () => {
    mockAuth({ allowed: false, authEnabled: true, hasToken: false });

    await expect(beforeLoad(loc("/dashboard"))).rejects.toMatchObject({
      to: "/sign-in",
      replace: true,
    });
  });

  it("allows protected route when allowed", async () => {
    mockAuth({ allowed: true, authEnabled: true, hasToken: true });

    await expect(beforeLoad(loc("/dashboard"))).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("skips the auth gate for /iframe-auth and /api routes", async () => {
    await expect(beforeLoad(loc("/iframe-auth"))).resolves.toBeUndefined();
    await expect(beforeLoad(loc("/api/anything"))).resolves.toBeUndefined();
    expect(getAuthState).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
