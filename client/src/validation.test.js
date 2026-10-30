import { test, expect } from "vitest";
import {
  validateUsername,
  validatePassword,
  validateCharacterName,
  MAX_CHARACTERS,
} from "./validation.js";

test("usernames follow the server's rules", () => {
  expect(validateUsername("alice_01")).toBe("");
  for (const bad of ["", "ab", "a".repeat(21), "has space", "emoji😀"]) {
    expect(validateUsername(bad)).not.toBe("");
  }
});

test("passwords need 10 characters and at most 72 bytes", () => {
  expect(validatePassword("correct-horse-battery")).toBe("");
  expect(validatePassword("short")).not.toBe("");
  expect(validatePassword("x".repeat(72))).toBe("");
  expect(validatePassword("x".repeat(73))).not.toBe("");
  // 40 emoji are 40 characters but 160 bytes, which the server would refuse
  expect(validatePassword("😀".repeat(20))).not.toBe("");
});

test("character names follow the server's rules", () => {
  expect(validateCharacterName("Aria_1")).toBe("");
  for (const bad of ["", "ab", "x".repeat(17), "bad name", "emoji😀"]) {
    expect(validateCharacterName(bad)).not.toBe("");
  }
});

test("the client knows the character limit", () => {
  expect(MAX_CHARACTERS).toBe(3);
});
