import { adminSession, apiError, json } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const session = await adminSession(request);
    return json(session, session.authorized ? 200 : session.authenticated ? 403 : 401);
  } catch (error) { return apiError(error); }
}
