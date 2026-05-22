// Helpers para construir URLs de calendarios externos (Google, Outlook).
// Apple Calendar abre automáticamente el .ics, así que ese caso usa el endpoint
// directo del servidor, no estos helpers.

export interface CalendarEventInput {
  title:       string;
  start:       Date;
  end:         Date;
  description?: string;
  location?:   string;
}

function fmtDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalendarUrl(ev: CalendarEventInput): string {
  const params = new URLSearchParams({
    action:   "TEMPLATE",
    text:     ev.title,
    dates:    `${fmtDate(ev.start)}/${fmtDate(ev.end)}`,
    details:  ev.description ?? "",
    location: ev.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(ev: CalendarEventInput): string {
  const params = new URLSearchParams({
    rru:      "addevent",
    subject:  ev.title,
    startdt:  ev.start.toISOString(),
    enddt:    ev.end.toISOString(),
    body:     ev.description ?? "",
    location: ev.location ?? "",
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
