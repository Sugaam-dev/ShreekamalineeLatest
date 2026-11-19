import { apiError, json, requireAdmin } from "@/lib/admin-auth";
import { loadCatalog } from "@/lib/product-store";

export const dynamic = "force-dynamic";
export async function GET() {
  try { await requireAdmin(); return json(await loadCatalog(true)); }
  catch (error) { return apiError(error); }
}
