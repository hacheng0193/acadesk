import { heartbeat } from "@/lib/idle";

export const dynamic = "force-dynamic";

/**
 * Heartbeat from an open, visible tab. Also used by sendBeacon on unload, which
 * can only issue POSTs, so the body is ignored entirely.
 */
export async function POST() {
  heartbeat();
  return new Response(null, { status: 204 });
}
