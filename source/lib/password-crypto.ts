import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const parameters = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function safeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function privateRateKey(ip: string, pepper: string): string {
  return createHmac("sha256", pepper).update("shreekamalinee-admin-rate-v1\0").update(ip).digest("hex");
}

function derive(password: string, salt: Buffer, pepper: string): Promise<Buffer> {
  const input = createHmac("sha256", pepper).update("shreekamalinee-admin-password-v1\0").update(password).digest();
  return new Promise((resolve, reject) => {
    scrypt(input, salt, 32, parameters, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string, pepper: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, pepper);
  return JSON.stringify({ algorithm: "scrypt", version: 1, N: parameters.N, r: parameters.r, p: parameters.p, salt: salt.toString("hex"), hash: hash.toString("hex") });
}

export async function verifyPassword(password: string, encoded: string, pepper: string): Promise<boolean> {
  const stored = JSON.parse(encoded) as { algorithm?: string; version?: number; N?: number; r?: number; p?: number; salt?: string; hash?: string };
  if (stored.algorithm !== "scrypt" || stored.version !== 1 || stored.N !== parameters.N || stored.r !== parameters.r || stored.p !== parameters.p || typeof stored.salt !== "string" || !/^[a-f0-9]{32}$/.test(stored.salt) || typeof stored.hash !== "string" || !/^[a-f0-9]{64}$/.test(stored.hash)) {
    throw new Error("Unsupported password hash");
  }
  const actual = await derive(password, Buffer.from(stored.salt, "hex"), pepper);
  return timingSafeEqual(actual, Buffer.from(stored.hash, "hex"));
}

export async function passwordCryptoReady(pepper: string): Promise<void> {
  const test = "Shreekamalinee native password readiness";
  const encoded = await hashPassword(test, pepper);
  if (!(await verifyPassword(test, encoded, pepper))) throw new Error("Password hashing unavailable");
}
