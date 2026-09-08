import { describe, expect, it } from "vitest";
import { routes } from "@/components/layout";
import { flattenNavEntries } from "@/components/layout/nav";

describe("layout routes", () => {
  it("exposes the Dashboard route pointing at /", () => {
    const flatRoutes = flattenNavEntries(routes);
    expect(
      flatRoutes.some((r) => r.title === "Dashboard" && r.url === "/"),
    ).toBe(true);
  });
});
