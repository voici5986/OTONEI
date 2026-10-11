// Run the ordinary browser suite against deterministic production assets.
process.env.PLAYWRIGHT_PWA = '0';
await import('./run-pwa-e2e.mjs');
