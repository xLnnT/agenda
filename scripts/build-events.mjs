// Haalt de ICS-feeds uit calendars.json op, breidt herhalende afspraken uit
// en schrijft docs/events.json. Wordt door de GitHub Action elk half uur gedraaid.
import ical from "node-ical";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MONTHS_BACK = 2;
const MONTHS_AHEAD = 12;

const now = new Date();
const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MONTHS_BACK, 1));
const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + MONTHS_AHEAD + 1, 1));

function text(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "val" in v) return String(v.val ?? "");
  return String(v);
}

/** Kalenderdag (YYYY-MM-DD) van een hele-dag-datum in de tijdzone waarin ze bedoeld is. */
function dayKey(d) {
  if (d.tz) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: d.tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }
  if (d.dateOnly) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return d.toISOString().slice(0, 10);
}

function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Feed-URL: uit de env-variabele (secret) als "env" gezet is, anders het "url"-veld. */
function feedUrl(cal) {
  const raw = cal.env ? process.env[cal.env] : cal.url;
  if (!raw) throw new Error(cal.env ? `env-variabele ${cal.env} ontbreekt` : "geen url");
  return raw.trim().replace(/^webcals?:\/\//i, "https://");
}

async function fetchCalendar(cal) {
  const url = feedUrl(cal);
  const res = await fetch(url, { headers: { "User-Agent": "agenda-site/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = ical.sync.parseICS(await res.text());

  const out = [];
  for (const component of Object.values(data)) {
    if (!component || component.type !== "VEVENT") continue;
    if (component.status === "CANCELLED") continue;
    if (component.recurrenceid) continue; // zit al in "recurrences" van het hoofd-event

    let instances;
    try {
      instances = ical.expandRecurringEvent(component, { from, to, expandOngoing: true });
    } catch (err) {
      console.warn(`  ! kon ${component.uid} niet uitbreiden: ${err.message}`);
      continue;
    }

    for (const inst of instances) {
      if (inst.event.status === "CANCELLED") continue;
      const start = inst.start;
      const end = inst.end ?? inst.start;
      // Privé-agenda: enkel tonen dát er iets is, niet wat
      const title = cal.private ? "Privé afspraak" : text(inst.summary).trim() || "(zonder titel)";
      const location = cal.private ? undefined : text(inst.event.location).replace(/\s*\n\s*/g, ", ").trim() || undefined;

      if (inst.isFullDay) {
        const s = dayKey(start);
        let e = inst.end ? dayKey(end) : addDays(s, 1);
        if (e <= s) e = addDays(s, 1);
        out.push({ id: `${cal.id}:${component.uid}:${s}`, calendarId: cal.id, title, start: s, end: e, allDay: true, location });
      } else {
        const s = start.toISOString();
        let e = end.toISOString();
        if (e <= s) e = new Date(start.getTime() + 30 * 60 * 1000).toISOString();
        out.push({ id: `${cal.id}:${component.uid}:${s}`, calendarId: cal.id, title, start: s, end: e, allDay: false, location });
      }
    }
  }
  return out;
}

const configPath = process.env.CALENDARS_FILE ?? path.join(root, "calendars.json");
const calendars = JSON.parse(await readFile(configPath, "utf8"));
const events = [];
const errors = [];

for (const cal of calendars) {
  process.stdout.write(`• ${cal.name} … `);
  try {
    const evs = await fetchCalendar(cal);
    events.push(...evs);
    console.log(`${evs.length} afspraken`);
  } catch (err) {
    console.log(`MISLUKT (${err.message})`);
    errors.push({ calendarId: cal.id, message: err.message });
  }
}

events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

const output = {
  calendars: calendars.map(({ id, name, color }) => ({ id, name, color })),
  range: { from: from.toISOString(), to: to.toISOString() },
  events,
  errors,
};

await writeFile(path.join(root, "docs", "events.json"), JSON.stringify(output));
console.log(`→ docs/events.json: ${events.length} afspraken, ${errors.length} fouten`);
if (errors.length === calendars.length && calendars.length > 0) process.exit(1);
