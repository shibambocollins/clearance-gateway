// Synthetic value generators. Never real personal data: fictional names, example.com/.org emails,
// and numbers generated to pass (or deliberately fail) validation. Secret-shaped values are
// assembled from parts so the repo itself contains no secret-shaped literals (D-021).
import { luhnCheckDigit } from "@clearance-gateway/core";
import type { Rng } from "./rng.js";

export const FIRST_NAMES = ["Thandi", "Sipho", "Lerato", "Johan", "Aisha", "Pieter", "Nomsa", "Kagiso", "Ayesha", "Ruan", "Zanele", "Liam"];
export const LAST_NAMES = ["Mokoena", "Naidoo", "van der Merwe", "Dlamini", "Botha", "Pillay", "Nkosi", "Smith", "Khumalo", "Jacobs"];
export const CLIENTS = ["Harbourview Clinic", "Meridian Mining"];
export const PROJECTS = ["Project Fynbos", "Project Baobab"];
export const BANKS = ["FNB", "Absa", "Standard Bank", "Nedbank", "Capitec"];

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE32 = UPPER + "234567";
const ALNUM = UPPER + "abcdefghijklmnopqrstuvwxyz0123456789";
const B64URL = ALNUM + "_-";
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const name = (rng: Rng) => `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;

export function saId(rng: Rng): string {
  const yy = rng.pick([rng.int(50, 99), rng.int(0, 5)]);
  const mm = rng.int(1, 12);
  const dd = rng.int(1, DAYS[mm - 1]!);
  const payload = [yy, mm, dd].map((n) => String(n).padStart(2, "0")).join("") + rng.digits(4) + rng.pick(["0", "1"]) + "8";
  return payload + luhnCheckDigit(payload);
}

/** 13 digits that look like an ID but fail the checksum (an order number). */
export function saIdBadChecksum(rng: Rng): string {
  const id = saId(rng);
  return id.slice(0, 12) + String((Number(id[12]) + rng.int(1, 9)) % 10);
}

/** 13 Luhn-valid digits with an impossible month (13–19); never starts with 4 (13-digit Visa). */
export function saIdBadDate(rng: Rng): string {
  const payload = String(rng.int(50, 99)) + String(rng.int(13, 19)) + String(rng.int(10, 28)) + rng.digits(4) + "08";
  return payload + luhnCheckDigit(payload);
}

export function card(rng: Rng): string {
  const brand = rng.pick([
    { prefix: "4", length: 16 },
    { prefix: String(rng.int(51, 55)), length: 16 },
    { prefix: String(rng.int(2221, 2720)), length: 16 },
    { prefix: rng.pick(["34", "37"]), length: 15 },
  ]);
  const payload = brand.prefix + rng.digits(brand.length - brand.prefix.length - 1);
  return payload + luhnCheckDigit(payload);
}

export function cardBadLuhn(rng: Rng): string {
  const c = cardNumberOfLength(rng, "4", 16);
  return c.slice(0, 15) + String((Number(c[15]) + rng.int(1, 9)) % 10);
}

/** Luhn-valid 16 digits with a prefix no supported brand uses (e.g. a shipment reference). */
export function luhnValidUnknownPrefix(rng: Rng): string {
  return cardNumberOfLength(rng, rng.pick(["9", "8", "1"]), 16);
}

function cardNumberOfLength(rng: Rng, prefix: string, length: number): string {
  const payload = prefix + rng.digits(length - prefix.length - 1);
  return payload + luhnCheckDigit(payload);
}

/** Groups digits in fours, as people usually write card numbers. */
export const groupsOf4 = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, "$1 ");

export function email(rng: Rng): string {
  const local = `${rng.pick(FIRST_NAMES)}.${rng.pick(LAST_NAMES)}`.toLowerCase().replace(/\s+/g, "");
  return `${local}@${rng.pick(["example.com", "example.org", "mail.example.com"])}`;
}

export function phone(rng: Rng): string {
  const mobile = `${rng.pick(["6", "7", "8"])}${rng.int(0, 9)}`;
  const rest = rng.digits(7);
  return rng.pick([
    `0${mobile}${rest}`,
    `0${mobile} ${rest.slice(0, 3)} ${rest.slice(3)}`,
    `+27 ${mobile} ${rest.slice(0, 3)} ${rest.slice(3)}`,
    `0${rng.pick(["11", "21", "31"])} ${rest.slice(0, 3)} ${rest.slice(3)}`,
  ]);
}

export const phoneDigits = (rng: Rng) => `0${rng.pick(["6", "7", "8"])}${rng.int(0, 9)}${rng.digits(7)}`;

/** 10 or 11 digits, first digit 1–9 so it can't read as a phone number. */
export const bankAccount = (rng: Rng) => String(rng.int(1, 9)) + rng.digits(rng.pick([9, 10]));

export const awsKeyId = (rng: Rng) => ["AK", "IA"].join("") + rng.chars(BASE32, 16);
export const githubToken = (rng: Rng) => ["gh", "p_"].join("") + rng.chars(ALNUM, 36);
export const stripeKey = (rng: Rng) => ["sk", "_live_"].join("") + rng.chars(ALNUM, 24);
export const googleKey = (rng: Rng) => ["AI", "za"].join("") + rng.chars(B64URL, 35);
export const slackToken = (rng: Rng) => ["xo", "xb-"].join("") + rng.digits(12) + "-" + rng.digits(12) + "-" + rng.chars(ALNUM, 24);
export const jwt = (rng: Rng) =>
  ["ey", "J"].join("") + rng.chars(ALNUM, 20) + ".eyJ" + rng.chars(B64URL, 30) + "." + rng.chars(B64URL, 43);
/** A password-like value: letters, a symbol and digits. */
export const password = (rng: Rng) => rng.chars(ALNUM, 10) + rng.pick(["!", "#", "@", "%"]) + rng.digits(2);

const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** Evasion variants (SPEC §14.1), plus two the Engine is known NOT to handle. */
export const EVASIONS = {
  spaced: (v: string) => v.split("").join(" "),
  dashed: (v: string) => v.replace(/(\d{4})(?=\d)/g, "$1-"),
  "zero-width": (v: string) => v.replace(/(.{3})(?=.)/g, "$1​"),
  fullwidth: (v: string) => v.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)),
  "line-break": (v: string) => (v.includes(" ") ? v.replace(" ", "\n") : `${v.slice(0, Math.ceil(v.length / 2))}\n${v.slice(Math.ceil(v.length / 2))}`),
  "digits-as-words": (v: string) => v.replace(/\d/g, (d) => `${DIGIT_WORDS[Number(d)]} `).trim(),
  "at-dot": (v: string) => v.replace("@", " [at] ").replace(/\.(?=[^.]+$)/, " [dot] "),
} as const;

export type EvasionType = keyof typeof EVASIONS;
/** Evasion types the Engine does not claim to handle; reported separately, never hidden. */
export const UNHANDLED_EVASIONS: EvasionType[] = ["digits-as-words", "at-dot"];
