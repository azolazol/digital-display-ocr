import fs from 'node:fs';
const engine=fs.readFileSync('src/engine.js','utf8').replace(/^export /gm,''),app=fs.readFileSync('src/app.js','utf8').replace(/^import .*\n/,'');
const worker=engine+'\n'+fs.readFileSync('src/worker.js','utf8').replace(/^import .*\n/,'');
const bundledApp=app.replace('/* WORKER_SOURCE */ null',()=>JSON.stringify(worker));
fs.writeFileSync('index.html',fs.readFileSync('src/page.html','utf8').replace('/* APP_BUNDLE */',()=>engine+'\n'+bundledApp));
console.log('Built standalone index.html — no external dependencies');

