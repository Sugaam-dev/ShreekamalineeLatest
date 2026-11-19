import { apiError, imageBucket } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await context.params;
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.(jpg|png|webp)$/.test(key)) return new Response("Photo not found", { status: 404 });
    const photo = await imageBucket().get(key);
    if (!photo) return new Response("Photo not found", { status: 404 });
    const headers = new Headers();
    photo.writeHttpMetadata(headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("ETag", photo.httpEtag);
    headers.set("X-Content-Type-Options", "nosniff");
    if (request.headers.get("if-none-match")?.split(",").some(value => value.trim() === "*" || value.trim().replace(/^W\//, "") === photo.httpEtag)) {
      await photo.body.cancel();
      return new Response(null, { status: 304, headers });
    }
    if (request.method === "HEAD") {
      await photo.body.cancel();
      return new Response(null, { headers });
    }
    return new Response(photo.body, { headers });
  } catch (error) { return apiError(error); }
}

export const HEAD = GET;
