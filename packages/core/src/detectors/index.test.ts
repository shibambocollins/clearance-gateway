import { describe, expect, it } from "vitest";
import { BASE32_UPPER, cardNumber, fakeChars, saId, spans } from "../fixtures.js";
import type { Finding } from "../types.js";
import { detect, resolveOverlaps } from "./index.js";

function finding(partial: Partial<Finding>): Finding {
  return { detectorId: "x", dataClass: "EMAIL", start: 0, end: 1, confidence: "high", masked: "•", ...partial };
}

describe("resolveOverlaps", () => {
  it("keeps the higher-confidence finding", () => {
    const high = finding({ detectorId: "phone_za", start: 5, end: 15, confidence: "high" });
    const medium = finding({ detectorId: "bank_account", start: 5, end: 15, confidence: "medium" });
    expect(resolveOverlaps([medium, high])).toEqual([high]);
  });

  it("on equal confidence keeps the longer span", () => {
    const short = finding({ start: 0, end: 11 });
    const long = finding({ start: 0, end: 18 });
    expect(resolveOverlaps([short, long])).toEqual([long]);
  });

  it("keeps non-overlapping findings, sorted by start", () => {
    const a = finding({ start: 10, end: 12 });
    const b = finding({ start: 0, end: 5 });
    expect(resolveOverlaps([a, b])).toEqual([b, a]);
  });
});

describe("detect", () => {
  it("finds several classes in one prompt, in text order, with masked previews only", () => {
    const id = saId("850615", "5123", "0");
    const card = cardNumber("53", 16);
    const text = `Customer ${id} paid with ${card}; reach her at thandi@example.com or 082 555 0123.`;
    const findings = detect(text);
    expect(findings.map((f) => f.dataClass)).toEqual(["SA_ID", "CARD_NUMBER", "EMAIL", "PHONE"]);
    expect(spans(text, findings)).toEqual([id, card, "thandi@example.com", "082 555 0123"]);
    for (const f of findings) expect(f.masked).not.toBe(text.slice(f.start, f.end));
  });

  it("prefers SA_ID over a 13-digit Visa reading of the same digits", () => {
    // An ID born in the 1940s starts with 4 and can also pass as a 13-digit Visa number.
    let id = "";
    for (let seq = 0; seq < 10000 && !id; seq++) {
      const candidate = saId("450312", String(seq).padStart(4, "0"));
      if (candidate.startsWith("4")) id = candidate;
    }
    expect(detect(`ID ${id}`).map((f) => f.dataClass)).toEqual(["SA_ID"]);
  });

  it("reports a known key once when it is also an assignment value", () => {
    const key = "AKIA" + fakeChars(BASE32_UPPER, 16);
    const findings = detect(`aws_api_key=${key}`);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ detectorId: "cred_known", dataClass: "CREDENTIAL" });
  });

  it("a phone number next to the word account stays a PHONE (high beats medium)", () => {
    const findings = detect("account holder's cell: 0825550123");
    expect(findings.map((f) => f.dataClass)).toEqual(["PHONE"]);
  });

  it("uses policy terms from the context", () => {
    const text = "Summarise the Project Fynbos plan";
    const findings = detect(text, { terms: [{ term: "Project Fynbos", dataClass: "PROJECT_CODENAME" }] });
    expect(spans(text, findings)).toEqual(["Project Fynbos"]);
  });

  it("returns nothing for a clean work prompt", () => {
    expect(
      detect("Draft a friendly email inviting the team to Friday's retro at 15:00 in room 4B. Agenda: wins, blockers."),
    ).toEqual([]);
  });
});
