import fs from 'node:fs/promises';
await import('./build-map.mjs');
const files=['index.html','price-core.js','price-view.js','wave-core.js','seed.js','map-style.css','legacy-calculator.html'];
await fs.mkdir('.runtime/site-v10/data',{recursive:true});for(const f of files)await fs.copyFile(f,'.runtime/site-v10/'+f);for(const f of ['price-map.json','us-history-audit.json','market-sentiment.json'])await fs.copyFile('data/'+f,'.runtime/site-v10/data/'+f);await fs.writeFile('.runtime/site-v10/.nojekyll','');console.log('V10 public assets staged');
