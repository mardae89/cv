import crypto from "node:crypto";

/** scrypt password hashing — no external dependency, constant-time comparison. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, digest] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !digest) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}
