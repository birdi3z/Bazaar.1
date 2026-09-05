# Bazaar — SolidStart

This project migrates the Bazaar React app to Solid.js and wraps it in a SolidStart v2 filesystem-routed application.

## Requirements

- Node.js 24+
- npm

## Run

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Structure

- `src/app.jsx` — SolidStart application root and filesystem router.
- `src/routes/index.jsx` — `/` route.
- `src/components/Bazaar.jsx` — migrated Bazaar UI and client state.
- `src/app.css` — minimal global document styling.
- `vite.config.ts` — SolidStart v2 + Nitro v3 configuration.

## Notes

The original `window.storage` persistence API is retained when available and now falls back to browser `localStorage`, with SSR-safe guards so SolidStart can render on the server.

The existing Alpha Vantage / Anthropic / Stripe / Zapier integrations remain client-side integrations from the source app; they were not converted into SolidStart server functions in this pass.
.