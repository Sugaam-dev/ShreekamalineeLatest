import { apiError, requireSameOrigin } from "@/lib/admin-auth";
import { logout, readAuthJson } from "@/lib/password-auth";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await readAuthJson(request);
    return await logout(request);
  } catch (error) { return apiError(error); }
}
