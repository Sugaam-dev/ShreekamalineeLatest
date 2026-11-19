import { apiError, json, readJson, requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { saveCollection } from "@/lib/catalog-structure";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
    return json({ collection: await saveCollection(await readJson(request)) }, 201);
  } catch (error) { return apiError(error); }
}
