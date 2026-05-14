import { describe, it } from "node:test";
import { assertEnumsInSync } from "../src/services/enumSync.js";

describe("enum sync", () => {
  it("Prisma enums match @aura/shared string-literal unions", () => {
    assertEnumsInSync();
  });
});
