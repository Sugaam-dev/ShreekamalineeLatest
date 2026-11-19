import { apiError, requireSameOrigin } from "@/lib/admin-auth";
import { changePassword, readAuthJson } from "@/lib/password-auth";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    return await changePassword(request, await readAuthJson(request));
  } catch (error) { return apiError(error); }
}
