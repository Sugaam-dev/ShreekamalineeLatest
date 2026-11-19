import { headers } from "next/headers";
import { ApiError, database, json, readLimitedBody } from "./admin-auth";
import { hashPassword, passwordCryptoReady, privateRateKey, randomToken, safeHexEqual, sha256, verifyPassword } from "./password-crypto";
import { trustedClientIp } from "./request-security";

const cookieName = "__Host-shreekamalinee-admin";
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const limitWindow = 15 * 60 * 1000;
type Credential = { username: string; password_hash: string; version: string };
export type PasswordSession = { authenticated: boolean; authorized: boolean; configured: boolean; username?: string };

function pepper(): string {
  if (!process.env.ADMIN_PASSWORD_PEPPER || process.env.ADMIN_PASSWORD_PEPPER.length < 32) throw new ApiError("Admin login is temporarily unavailable. Please try again.", 503);
  return process.env.ADMIN_PASSWORD_PEPPER;
}

async function credential(): Promise<Credential | null> {
  return database().prepare("SELECT username, password_hash, version FROM admin_credentials WHERE id = 'owner'").first<Credential>();
}

function tokenFromCookie(cookie: string | null): string | null {
  const value = cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

async function currentToken(request?: Request): Promise<string | null> {
  return tokenFromCookie((request ? request.headers : await headers()).get("cookie"));
}

function sessionCookie(token: string, expires: number): string {
  return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(sessionLifetime / 1000)}; Expires=${new Date(expires).toUTCString()}`;
}

function sessionResponse(username: string, token: string, expires: number, status = 200): Response {
  const response = json({ authorized: true, username }, status);
  response.headers.set("Set-Cookie", sessionCookie(token, expires));
  return response;
}

export async function getPasswordSession(request?: Request): Promise<PasswordSession> {
  const owner = await credential();
  if (!owner) return { authenticated: false, authorized: false, configured: false };
  const token = await currentToken(request);
  if (!token) return { authenticated: false, authorized: false, configured: true };
  const session = await database().prepare("SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND credential_version = ? AND expires_at > ?")
    .bind(sha256(token), owner.version, Date.now()).first();
  if (!session) return { authenticated: false, authorized: false, configured: true };
  return { authenticated: true, authorized: true, configured: true, username: owner.username };
}

export async function readAuthJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ApiError("Send login information as JSON.", 415);
  const body = new TextDecoder().decode(await readLimitedBody(request, 4096, "The login information is too large."));
  let value: unknown;
  try { value = JSON.parse(body); } catch { throw new ApiError("The login information could not be read."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("Invalid login information.");
  return value as Record<string, unknown>;
}

async function limitAttempts(request: Request): Promise<string> {
  const ip = trustedClientIp(request);
  const key = privateRateKey(ip, pepper());
  const now = Date.now();
  const window = Math.floor(now / limitWindow) * limitWindow;
  const db = database();
  const results = await db.batch([
    db.prepare("INSERT INTO admin_login_limits (key, attempts, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN admin_login_limits.window_start = excluded.window_start THEN admin_login_limits.attempts + 1 ELSE 1 END, window_start = excluded.window_start RETURNING attempts").bind(key, window),
    db.prepare("DELETE FROM admin_login_limits WHERE key IN (SELECT key FROM admin_login_limits WHERE window_start < ? LIMIT 50)").bind(now - 24 * 60 * 60 * 1000),
  ]);
  const attempt = (results[0].results as { attempts: number }[])[0];
  if (!attempt || attempt.attempts > 10) throw new ApiError("Too many login attempts. Please wait 15 minutes and try again.", 429);
  return key;
}

function validUsername(value: unknown): string {
  if (typeof value !== "string") throw new ApiError("Enter a username.");
  const name = value.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,40}$/.test(name)) throw new ApiError("Use 3–40 letters, numbers, dots, underscores or hyphens for the username.");
  return name;
}

function newPassword(value: unknown): string {
  if (typeof value !== "string" || [...value].length < 12 || [...value].length > 128) throw new ApiError("Choose a password of 12–128 characters. Spaces are allowed.");
  return value;
}

function loginPassword(value: unknown): string {
  if (typeof value !== "string" || !value.length || [...value].length > 128) throw new ApiError("The username or password is incorrect.", 401);
  return value;
}

async function verifySetupToken(value: unknown): Promise<void> {
  if (await credential()) throw new ApiError("Admin login has already been set up. Please sign in.", 409);
  const expires = Number(process.env.ADMIN_SETUP_EXPIRES_AT);
  if (typeof value !== "string" || value.length < 32 || value.length > 256 || !Number.isFinite(expires) || expires <= Date.now() || !process.env.ADMIN_SETUP_TOKEN_HASH || !safeHexEqual(sha256(value), process.env.ADMIN_SETUP_TOKEN_HASH)) {
    throw new ApiError("This setup link is invalid or has expired.", 403);
  }
}

export async function setupStatus(request: Request, input: Record<string, unknown>): Promise<Response> {
  await limitAttempts(request);
  await verifySetupToken(input.token);
  await passwordCryptoReady(pepper());
  return json({ valid: true, ready: true });
}

export async function setupPassword(request: Request, input: Record<string, unknown>): Promise<Response> {
  const rateKey = await limitAttempts(request);
  await verifySetupToken(input.token);
  const username = validUsername(input.username);
  const passwordHash = await hashPassword(newPassword(input.password), pepper());
  const now = Date.now();
  const version = crypto.randomUUID();
  const token = randomToken();
  const expires = now + sessionLifetime;
  const db = database();
  const results = await db.batch([
    db.prepare("INSERT INTO admin_credentials (id, username, password_hash, version, created_at, updated_at) VALUES ('owner', ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(username, passwordHash, version, now, now),
    db.prepare("INSERT INTO admin_sessions (token_hash, credential_version, created_at, expires_at) SELECT ?, ?, ?, ? FROM admin_credentials WHERE id = 'owner' AND version = ?").bind(sha256(token), version, now, expires, version),
    db.prepare("DELETE FROM admin_login_limits WHERE key = ? AND EXISTS (SELECT 1 FROM admin_sessions WHERE token_hash = ?)").bind(rateKey, sha256(token)),
  ]);
  if (results[0].meta.changes !== 1) throw new ApiError("Admin login has already been set up. Please sign in.", 409);
  return sessionResponse(username, token, expires, 201);
}

export async function login(request: Request, input: Record<string, unknown>): Promise<Response> {
  const rateKey = await limitAttempts(request);
  const owner = await credential();
  if (!owner) throw new ApiError("Admin login has not been set up yet. Open your private setup link first.", 403);
  const password = loginPassword(input.password);
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  const verified = await verifyPassword(password, owner.password_hash, pepper());
  if (!verified || username !== owner.username) throw new ApiError("The username or password is incorrect.", 401);
  const now = Date.now();
  const expires = now + sessionLifetime;
  const token = randomToken();
  const db = database();
  const results = await db.batch([
    db.prepare("DELETE FROM admin_sessions WHERE token_hash IN (SELECT token_hash FROM admin_sessions WHERE expires_at <= ? LIMIT 50)").bind(now),
    db.prepare("INSERT INTO admin_sessions (token_hash, credential_version, created_at, expires_at) SELECT ?, ?, ?, ? FROM admin_credentials WHERE id = 'owner' AND version = ?").bind(sha256(token), owner.version, now, expires, owner.version),
    db.prepare("DELETE FROM admin_login_limits WHERE key = ? AND EXISTS (SELECT 1 FROM admin_sessions WHERE token_hash = ?)").bind(rateKey, sha256(token)),
  ]);
  if (results[1].meta.changes !== 1) throw new ApiError("Login information changed. Please sign in again.", 409);
  return sessionResponse(owner.username, token, expires);
}

export async function logout(request: Request): Promise<Response> {
  const token = await currentToken(request);
  if (token) await database().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(sha256(token)).run();
  const response = json({ ok: true });
  response.headers.set("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  return response;
}

export async function changePassword(request: Request, input: Record<string, unknown>): Promise<Response> {
  const session = await getPasswordSession(request);
  if (!session.authorized) throw new ApiError("Please sign in to manage products.", 401);
  const rateKey = await limitAttempts(request);
  const owner = await credential();
  if (!owner || !(await verifyPassword(loginPassword(input.currentPassword), owner.password_hash, pepper()))) throw new ApiError("The current password is incorrect.", 401);
  const username = validUsername(input.username);
  const passwordHash = await hashPassword(newPassword(input.newPassword), pepper());
  const version = crypto.randomUUID();
  const token = randomToken();
  const now = Date.now();
  const expires = now + sessionLifetime;
  const db = database();
  const results = await db.batch([
    db.prepare("UPDATE admin_credentials SET username = ?, password_hash = ?, version = ?, updated_at = ? WHERE id = 'owner' AND version = ?").bind(username, passwordHash, version, now, owner.version),
    db.prepare("DELETE FROM admin_sessions WHERE EXISTS (SELECT 1 FROM admin_credentials WHERE id = 'owner' AND version = ?)").bind(version),
    db.prepare("INSERT INTO admin_sessions (token_hash, credential_version, created_at, expires_at) SELECT ?, ?, ?, ? FROM admin_credentials WHERE id = 'owner' AND version = ?").bind(sha256(token), version, now, expires, version),
    db.prepare("DELETE FROM admin_login_limits WHERE key = ? AND EXISTS (SELECT 1 FROM admin_sessions WHERE token_hash = ?)").bind(rateKey, sha256(token)),
  ]);
  if (results[0].meta.changes !== 1) throw new ApiError("Login information changed. Please sign in again.", 409);
  return sessionResponse(username, token, expires);
}
