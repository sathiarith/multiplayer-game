import { z } from "zod";

export const CHARACTER_CLASSES = ["warrior"];

// Runs a schema and turns zod's issues into our own { field: message } map.
// Returns { data } on success, or { fields } on failure (never both).
function check(schema, messages, input) {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data };

  const fields = {};
  for (const issue of result.error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) fields[key] = "not allowed";
    } else if (issue.path.length === 0) {
      fields.body = "must be a JSON object"; // missing body, an array, a string...
    } else {
      const key = String(issue.path[0]);
      fields[key] = messages[key] ?? "invalid";
    }
  }
  return { fields };
}

// .strict() makes unknown keys an error instead of silently dropping them.
const credentialsSchema = z
  .object({
    username: z.string().regex(/^[A-Za-z0-9_]{3,20}$/),
    // bcrypt ignores everything after 72 bytes, so refuse longer passwords.
    password: z
      .string()
      .min(10)
      .refine((p) => Buffer.byteLength(p) <= 72),
  })
  .strict();

// Login only checks the shape. Password rules apply when choosing a password,
// not when using one, so accounts made under older rules can still log in.
const loginSchema = z
  .object({
    username: z.string().min(1).max(50),
    password: z.string().min(1).max(200),
  })
  .strict();

const newCharacterSchema = z
  .object({
    name: z.string().regex(/^[A-Za-z0-9_]{3,16}$/),
    class: z.enum(CHARACTER_CLASSES).default("warrior"),
  })
  .strict();

export function parseCredentials(body) {
  return check(
    credentialsSchema,
    {
      username: "3 to 20 characters: letters, numbers, underscore",
      password: "at least 10 characters and at most 72 bytes",
    },
    body,
  );
}

export function parseLogin(body) {
  return check(
    loginSchema,
    {
      username: "required, at most 50 characters",
      password: "required, at most 200 characters",
    },
    body,
  );
}

export function parseNewCharacter(body) {
  return check(
    newCharacterSchema,
    {
      name: "3 to 16 characters: letters, numbers, underscore",
      class: `one of: ${CHARACTER_CLASSES.join(", ")}`,
    },
    body,
  );
}

// Plain digits only, no leading zero, at most 10 digits. Returns a number or null.
export function parseId(raw) {
  return typeof raw === "string" && /^[1-9]\d{0,9}$/.test(raw)
    ? Number(raw)
    : null;
}
