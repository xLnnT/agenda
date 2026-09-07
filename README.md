# Agenda

Statische website die gekozen Google/iCloud-agenda's toont, zodat je ze met anderen kan delen. Week-, maand- en lijstweergave, werkt op mobiel, dark mode inbegrepen.

Live: https://raw.githack.com/xLnnT/agenda/main/site/index.html

## Hoe het werkt

- `calendars.json` bepaalt welke agenda's getoond worden (naam, kleur, ICS-feed). Enkel wat hier staat is zichtbaar.
- `scripts/build-events.mjs` haalt de feeds op, breidt herhalende afspraken uit en schrijft `site/events.json` (2 maanden terug tot 12 maanden vooruit).
- De GitHub Action `.github/workflows/update-events.yml` draait dat script elk half uur en commit `site/events.json` als er iets veranderd is.
- `site/` is de pagina zelf: puur HTML/CSS/JS, dus ze werkt op GitHack of GitHub Pages zonder server.

## Agenda toevoegen of wijzigen

Voeg een item toe aan `calendars.json`. De feed-URL zelf staat niet in de repo maar in een secret:

```json
{ "id": "werk", "name": "LnnT werk", "color": "#2563eb", "env": "FEED_WERK" }
```

**Google-agenda:** ga op [calendar.google.com](https://calendar.google.com) naar *Instellingen en delen* van de agenda en kopieer onderaan het **Geheime adres in iCal-indeling**. De agenda hoeft niet openbaar te zijn. Wie het adres heeft kan de agenda enkel lezen, niet wijzigen.

**iCloud-agenda:** Agenda-app → ⓘ naast de agenda → *Openbare agenda* aanzetten → de `webcal://`-link kopiëren.

Zet het adres als GitHub-secret met dezelfde naam als in `env` (*Settings → Secrets and variables → Actions*), of via de terminal:

```
gh secret set FEED_WERK
```

Voeg de secret ook toe aan de lijst in `.github/workflows/update-events.yml`. Na een push van `calendars.json` draait de Action meteen. Lokaal zet je dezelfde adressen in `.env` (zie `.env.example`).

## Lokaal draaien

```
npm install
npm run dev
```

Dat haalt de afspraken op en serveert `site/` op http://localhost:3000.

## Opmerkingen

- GitHub schakelt geplande Actions uit als er 60 dagen geen activiteit is in de repo. Handmatig starten kan via *Actions → Afspraken bijwerken → Run workflow*.
- De site is alleen-lezen: bezoekers zien een kopie (`site/events.json`) met enkel titel, tijdstip en locatie. Er is geen verbinding terug naar Google, dus niemand kan afspraken toevoegen of wijzigen.
