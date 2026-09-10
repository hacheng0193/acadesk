import { buildCalendar } from "@/lib/ics";
import { listAssignments } from "@/lib/queries/assignments";

export const dynamic = "force-dynamic";

/**
 * Subscribable calendar feed for Calendar.app (or anything that speaks
 * iCalendar). Read-only and one-way: this app is the source of truth.
 */
export async function GET() {
  const body = buildCalendar(listAssignments());
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="acadesk.ics"',
      "cache-control": "no-store",
    },
  });
}
