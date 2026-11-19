import { apiError, json, requireAdmin, requireSameOrigin } from "@/lib/admin-auth";
import { uploadImage } from "@/lib/product-store";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdmin();
    return json({ url: await uploadImage(request) }, 201);
  } catch (error) { return apiError(error); }
}
