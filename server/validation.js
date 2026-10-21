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
