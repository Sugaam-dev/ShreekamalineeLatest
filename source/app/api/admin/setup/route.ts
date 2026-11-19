import { apiError, requireSameOrigin } from "@/lib/admin-auth";
import { readAuthJson, setupPassword } from "@/lib/password-auth";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    return await setupPassword(request, await readAuthJson(request));
  } catch (error) { return apiError(error); }
}
