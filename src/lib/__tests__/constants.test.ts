import { describe, expect, it } from "vitest";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";

describe("branding constants", () => {
  it("exposes a non-empty APP_NAME string", () => {
    expect(typeof APP_NAME).toBe("string");
    expect(APP_NAME.trim().length).toBeGreaterThan(0);
  });

  it("exposes a non-empty APP_DESCRIPTION string", () => {
    expect(typeof APP_DESCRIPTION).toBe("string");
    expect(APP_DESCRIPTION.trim().length).toBeGreaterThan(0);
  });
});
