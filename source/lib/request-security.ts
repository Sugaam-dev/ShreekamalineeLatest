import { isIP } from "node:net";

type Settings = { APP_ORIGIN?: string; NODE_ENV?: string; TRUST_PROXY?: string };

export function applicationOrigin(request: Request, settings: Settings = process.env): string {
  const configured = settings.APP_ORIGIN?.trim();
  if (!configured) {
    const local = new URL(request.url);
    if (settings.NODE_ENV !== "production" && ["127.0.0.1", "localhost", "[::1]"].includes(local.hostname)) return local.origin;
    throw new Error("Configure APP_ORIGIN with the public HTTPS website origin.");
  }
  const origin = new URL(configured);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname);
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || (origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback))) {
    throw new Error("APP_ORIGIN must be an HTTPS origin without a path, query or credentials.");
  }
  return origin.origin;
}

export function trustedClientIp(request: Request, settings: Settings = process.env): string {
  if (settings.TRUST_PROXY !== "true") return "unavailable";
  const value = request.headers.get("x-real-ip")?.trim();
  return value && isIP(value) ? value : "unavailable";
}
