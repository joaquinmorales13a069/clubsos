// Generador .ics conforme a RFC 5545 (versión Deno para edge function).

export interface IcsEvent {
  uid:         string;
  start:       Date;
  end:         Date;
  summary:     string;
  description?: string;
  location?:   string;
  organizer?:  { name: string; email: string };
}

function fmt(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildIcs(ev: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//clubSOS//Citas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}@clubsos.com`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(ev.start)}`,
    `DTEND:${fmt(ev.end)}`,
    `SUMMARY:${escapeIcs(ev.summary)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${escapeIcs(ev.description)}`);
  if (ev.location)    lines.push(`LOCATION:${escapeIcs(ev.location)}`);
  if (ev.organizer)   lines.push(`ORGANIZER;CN=${escapeIcs(ev.organizer.name)}:mailto:${ev.organizer.email}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}
