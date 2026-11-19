import { apiError, json, readJson, requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { saveProduct } from "@/lib/product-store";

export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
    return json({ product: await saveProduct(await readJson(request), (await context.params).id) });
  } catch (error) { return apiError(error); }
}
