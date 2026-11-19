import { apiError, json, readJson, requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { updateCategory } from "@/lib/product-store";

export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
    const input = await readJson(request);
    return json({ category: await updateCategory((await context.params).id, input) });
  } catch (error) { return apiError(error); }
}
export const PATCH = PUT;
