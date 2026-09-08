import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";

// Stub the shared base layout + all app wiring so we test only that the wrapper
// renders SidebarLayout with the app's routes and passes children through.
const sidebarLayoutSpy = vi.fn();
vi.mock("@/components/layout/sidebar-layout", () => ({
  SidebarLayout: (props: { children?: ReactNode; routes?: unknown }) => {
    sidebarLayoutSpy(props);
    return <div data-testid="sidebar-layout">{props.children}</div>;
  },
}));
vi.mock("@/server/auth", () => ({ getAuthState: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({
  useGetUser: () => ({ data: undefined }),
  useSignOut: () => ({ mutate: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { authEnabled: true } }),
}));

import { AppLayout } from "@/components/layout/app-layout";

describe("AppLayout (wrapper)", () => {
  it("renders base SidebarLayout with routes and children", () => {
    render(
      <AppLayout>
        <p>Page content</p>
      </AppLayout>,
    );
    expect(screen.getByTestId("sidebar-layout")).toBeInTheDocument();
    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(sidebarLayoutSpy).toHaveBeenCalledWith(
      expect.objectContaining({ routes: expect.any(Array) }),
    );
  });
});
