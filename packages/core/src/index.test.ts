import { describe, expect, it } from "vitest";
import { CORE_VERSION, coreInfo } from "./index.js";

describe("coreInfo", () => {
  it("reports the Engine name and version", () => {
    expect(coreInfo()).toEqual({ name: "Clearance Gateway Engine", version: CORE_VERSION });
  });
});
