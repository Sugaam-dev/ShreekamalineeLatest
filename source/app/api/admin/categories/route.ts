import { apiError, json, readJson, requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { saveCategory } from "@/lib/catalog-structure";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
    return json({ category: await saveCategory(await readJson(request)) }, 201);
  } catch (error) { return apiError(error); }
}
