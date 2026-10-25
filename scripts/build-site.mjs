import fs from 'node:fs/promises';
const files=['index.html','app.js','live-data.js','core.js','r1-core.js','style.css','r1-layout.css','legacy-calculator.html'];
await fs.mkdir('.runtime/site/data',{recursive:true});for(const f of files)await fs.copyFile(f,'.runtime/site/'+f);for(const f of ['dashboard-seed.json.gz','dashboard-updates.json','market-sentiment.json'])await fs.copyFile('data/'+f,'.runtime/site/data/'+f);await fs.writeFile('.runtime/site/.nojekyll','');console.log('Public assets staged');
