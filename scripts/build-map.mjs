import fs from 'node:fs/promises';
const snapshot=JSON.parse(await fs.readFile('data/price-map.json'));
const safe=j=>JSON.stringify(j).replaceAll('<','\\u003c');
await fs.writeFile('seed.js','window.PRICE_SEED='+safe(snapshot)+';\n');
console.log('Built embedded fallback with original data dates');
