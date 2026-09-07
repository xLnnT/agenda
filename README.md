# Agenda

Statische website die gekozen Google/iCloud-agenda's toont, zodat je ze met anderen kan delen. Week-, maand- en lijstweergave, werkt op mobiel, dark mode inbegrepen.

Live: https://raw.githack.com/xLnnT/agenda/main/site/index.html

## Hoe het werkt

- `calendars.json` bepaalt welke agenda's getoond worden (naam, kleur, ICS-feed). Enkel wat hier staat is zichtbaar.
- `scripts/build-events.mjs` haalt de feeds op, breidt herhalende afspraken uit en schrijft `site/events.json` (2 maanden terug tot 12 maanden vooruit).
- De GitHub Action `.github/workflows/update-events.yml` draait dat script elk half uur en commit `site/events.json` als er iets veranderd is.
- `site/` is de pagina zelf: puur HTML/CSS/JS, dus ze werkt op GitHack of GitHub Pages zonder server.

## Agenda toevoegen of wijzigen

Voeg een item toe aan `calendars.json`:

```json
{ "id": "werk", "name": "LnnT werk", "color": "#2563eb", "url": "https://calendar.google.com/calendar/ical/<agenda-id>/public/basic.ics" }
```

**Google-agenda:** de agenda moet *openbaar* zijn. Ga op [calendar.google.com](https://calendar.google.com) naar de instellingen van de agenda → *Toegangsrechten voor afspraken* → vink *Openbaar maken* aan. De feed-URL is dan `https://calendar.google.com/calendar/ical/<agenda-id>/public/basic.ics` (de `@` in de id als `%40`). Je vindt de URL ook onderaan die pagina bij *Openbaar adres in iCal-indeling*.

**iCloud-agenda:** Agenda-app → ⓘ naast de agenda → *Openbare agenda* aanzetten → de `webcal://`-link kopiëren.

Na een push van `calendars.json` draait de Action meteen.

## Lokaal draaien

```
npm install
npm run dev
```

Dat haalt de afspraken op en serveert `site/` op http://localhost:3000.

## Opmerkingen

- GitHub schakelt geplande Actions uit als er 60 dagen geen activiteit is in de repo. Handmatig starten kan via *Actions → Afspraken bijwerken → Run workflow*.
- Bezoekers zien enkel titel, tijdstip en locatie van afspraken.
