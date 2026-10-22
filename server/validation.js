// Returns an object of field -> message. Empty means the input is valid.
export function validateCredentials({ username, password }) {
  const errors = {};

  if (typeof username !== "string" || !/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    errors.username = "3 to 20 characters: letters, numbers, underscore";
  }

  if (typeof password !== "string" || password.length < 10) {
    errors.password = "at least 10 characters";
  } else if (Buffer.byteLength(password) > 72) {
    errors.password = "at most 72 bytes"; // bcrypt ignores anything past 72
  }

  return errors;
}

export const CHARACTER_CLASSES = ["warrior"];

export function validateNewCharacter({
  name,
  class: characterClass = "warrior",
}) {
  const errors = {};
  if (typeof name !== "string" || !/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    errors.name = "3 to 16 characters: letters, numbers, underscore";
  }
  if (!CHARACTER_CLASSES.includes(characterClass)) {
    errors.class = `one of: ${CHARACTER_CLASSES.join(", ")}`;
  }
  return errors;
}

export function validatePosition({ x, y }, world) {
  const errors = {};
  // Number.isFinite rejects strings, null, NaN and Infinity without coercing.
  if (!Number.isFinite(x) || x < 0 || x > world.width) {
    errors.x = `a number from 0 to ${world.width}`;
  }
  if (!Number.isFinite(y) || y < 0 || y > world.height) {
    errors.y = `a number from 0 to ${world.height}`;
  }
  return errors;
}
