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
