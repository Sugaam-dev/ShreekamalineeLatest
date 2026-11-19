import { apiError, json, readJson, requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { saveProduct } from "@/lib/product-store";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
    return json({ product: await saveProduct(await readJson(request)) }, 201);
  } catch (error) { return apiError(error); }
}
