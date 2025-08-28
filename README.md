# GA4 → OpenAI: Next.js Dashboard (Startkit)

## Snabbstart
1. Skapa `.env.local` i projektroten baserat på `.env.local.example`.
2. Installera beroenden:
   ```bash
   npm i
   npm run dev
   ```
3. Öppna http://localhost:3000 och fyll i GA4 Property ID + månad.

## Miljövariabler
Fyll i din Service Account och OpenAI-nyckel i `.env.local`:
```
GA4_CLIENT_EMAIL=...
GA4_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
OPENAI_API_KEY=sk-...
```

> Tips: behåll `\n`-radbrytningarna i nyckeln.

## API:er
- **Google Analytics Data API (GA4)** via `@google-analytics/data`
- **OpenAI** via `openai`

## Map
- `app/page.tsx` – UI med formulär, KPI-kort och AI-sammanfattning
- `app/api/ga4/route.ts` – hämtar KPI:er från GA4 för vald period
- `app/api/ai/route.ts` – genererar AI-rapporttext

