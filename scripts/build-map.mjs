import fs from 'node:fs/promises';
const snapshot=JSON.parse(await fs.readFile('data/price-map.json')),tracking=JSON.parse(await fs.readFile('data/etf-tracking.json')),ranks=JSON.parse(await fs.readFile('data/us-etf-rankings.json'));
const safe=j=>JSON.stringify(j).replaceAll('<','\\u003c');
await fs.writeFile('seed.js','window.PRICE_SEED='+safe(snapshot)+';\nwindow.ETF_TRACKING='+safe(tracking)+';\nwindow.US_ETF_RANKINGS='+safe(ranks)+';');
console.log('Built embedded fallback with original data dates');
