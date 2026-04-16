/**
 * Google Calendar push — single task-as-event sync.
 *
 * MVP: one-way push from Metrum → user's primary calendar.
 * Requires OAuth flow (not implemented here — this is the delivery helper).
 * Once the user has connected via UserIntegration(provider="google_calendar"),
 * this function uses the stored accessToken to create/update events.
 *
 * For full bidirectional sync, add a webhook endpoint + watch channel.
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export async function upsertCalendarEvent(
  accessToken: string,
  eventId: string, // stable client-generated id so upsert works
  payload: {
    summary: string;
    description?: string;
    start: Date;
    end: Date;
    location?: string;
  },
): Promise<{ ok: boolean; eventId?: string; error?: string }> {
  try {
    const body = {
      id: eventId,
      summary: payload.summary,
      description: payload.description,
      start: { dateTime: payload.start.toISOString() },
      end: { dateTime: payload.end.toISOString() },
      location: payload.location,
    };

    // Try update first
    const updateRes = await fetch(`${CALENDAR_API}/${eventId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (updateRes.ok) {
      const j = (await updateRes.json()) as { id?: string };
      return { ok: true, eventId: j.id ?? eventId };
    }

    // Fallback: insert
    const insertRes = await fetch(CALENDAR_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (!insertRes.ok) {
      const text = await insertRes.text();
      return { ok: false, error: `${insertRes.status}: ${text.slice(0, 200)}` };
    }
    const j = (await insertRes.json()) as { id?: string };
    return { ok: true, eventId: j.id ?? eventId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
