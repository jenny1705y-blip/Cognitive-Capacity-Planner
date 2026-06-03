const CALENDAR_PROVENANCE_PREFIX = "calendar-provenance:";

export type CalendarTaskProvenance = {
  calendarEventTitle: string;
  calendarEventAt: string | null;
  calendarEventId: string | null;
  reason: string;
};

export function encodeCalendarTaskProvenance(provenance: CalendarTaskProvenance) {
  return `${CALENDAR_PROVENANCE_PREFIX}${JSON.stringify(provenance)}`;
}

export function decodeCalendarTaskProvenance(description?: string | null) {
  if (!description?.startsWith(CALENDAR_PROVENANCE_PREFIX)) return null;

  try {
    return JSON.parse(description.slice(CALENDAR_PROVENANCE_PREFIX.length)) as CalendarTaskProvenance;
  } catch {
    return null;
  }
}
