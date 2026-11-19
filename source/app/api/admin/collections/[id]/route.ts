import { apiError, json, readJson, requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { saveCollection } from "@/lib/catalog-structure";

export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
    return json({ collection: await saveCollection(await readJson(request), (await context.params).id) });
  } catch (error) { return apiError(error); }
}
