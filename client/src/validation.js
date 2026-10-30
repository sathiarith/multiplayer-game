export function validateUsername(value) {
  return /^[A-Za-z0-9_]{3,20}$/.test(value)
    ? ""
    : "3 to 20 characters: letters, numbers, underscore";
}

export function validatePassword(value) {
  if (value.length < 10) return "At least 10 characters";
  if (new TextEncoder().encode(value).length > 72) return "At most 72 bytes";
  return "";
}

// The server enforces the real limit; this only lets the page hide the form.
export const MAX_CHARACTERS = 3;

export function validateCharacterName(value) {
  return /^[A-Za-z0-9_]{3,16}$/.test(value)
    ? ""
    : "3 to 16 characters: letters, numbers, underscore";
}
