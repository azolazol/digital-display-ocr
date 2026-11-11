import fs from 'node:fs';
const engine=fs.readFileSync('src/engine.js','utf8').replace(/^export /gm,''),app=fs.readFileSync('src/app.js','utf8').replace(/^import .*\n/,'');
fs.writeFileSync('index.html',fs.readFileSync('src/page.html','utf8').replace('/* APP_BUNDLE */',()=>engine+'\n'+app));
console.log('Built standalone index.html — no external dependencies');
