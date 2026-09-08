// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = fileURLToPath(new URL(".", import.meta.url));
const baseDb = join(here, "../../../../../base/src/server/db");

describe("db runner scaffold", () => {
  for (const file of ["migrate.ts", "status.ts"]) {
    it(`${file} stays byte-identical to the canonical base copy`, () => {
      expect(readFileSync(join(here, file), "utf8")).toBe(
        readFileSync(join(baseDb, file), "utf8"),
      );
    });
  }
});
