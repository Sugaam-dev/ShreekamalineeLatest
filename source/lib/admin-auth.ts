import { getDatabase } from "./postgres";
import { getImageStore } from "./file-storage";
import { applicationOrigin } from "./request-security";

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function database() {
  if (!process.env.DATABASE_URL) throw new ApiError("Product storage is temporarily unavailable. Please try again.", 503);
  return getDatabase();
}

export function imageBucket() {
  if (!process.env.UPLOAD_DIR) throw new ApiError("Photo storage is temporarily unavailable. Please try again.", 503);
  return getImageStore();
}

export async function adminSession(request?: Request) {
  const { getPasswordSession } = await import("./password-auth");
  return getPasswordSession(request);
}

export async function requireAdmin() {
  const session = await adminSession();
  if (!session.authenticated) throw new ApiError("Please sign in to manage products.", 401);
  if (!session.authorized) throw new ApiError("This account does not have access to the product manager.", 403);
  return session;
}

export function requireSameOrigin(request: Request) {
  let origin: string;
  try { origin = applicationOrigin(request); }
  catch { throw new ApiError("The website origin has not been configured. Please contact the hosting administrator.", 503); }
  if (request.headers.get("origin") !== origin) {
    throw new ApiError("This request could not be verified. Reload the page and try again.", 403);
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError("Please send the product information as JSON.", 415);
  }
  const text = new TextDecoder().decode(await readLimitedBody(request, 65536, "The product information is too large."));
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new ApiError("The product information could not be read."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("Invalid product information.");
  return value as Record<string, unknown>;
}

export async function readLimitedBody(request: Request, limit: number, message: string): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length") || 0) > limit) throw new ApiError(message, 413);
  if (!request.body) throw new ApiError("The request is empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new ApiError(message, 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error("Product manager request failed", error instanceof Error ? error.name : "Unknown error");
  return json({ error: "The request could not be completed. Please try again." }, 500);
}
