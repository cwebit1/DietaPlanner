'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const index=read('index.html');
const sw=read('sw.js');
const manifest=JSON.parse(read('manifest.json'));

assert(index.includes('<script src="motor-v12.js?v=2"></script>'));
assert(index.includes('<script src="nutrition-config.js?v=2"></script>'));
assert(index.includes('<script src="engine-core.js?v=2"></script>'));
assert(index.includes("el.textContent='v2'"));
assert(index.includes("const DB_NAME = 'dieta-app-nuovo-ricettario'"));
assert(index.includes("const DB_VERSION = 3"));
for(const store of ['ingredienti','varianti','inventario','ricette','piano','impostazioni','consumoGiorno','spesa']){
  assert(index.includes("createObjectStore('"+store+"'"),store+' deve essere migrato/creato');
}

for(const source of ['index.html','motor-v12.js','sw.js']){
  const text=read(source);
  assert(!/(?:fetch|src=)[^\n]{0,120}(?:^|[\/"'])ricette\.json(?:[?"']|$)/m.test(text),source+' non deve caricare ricette.json');
  assert(!/(?:fetch|src=)[^\n]{0,120}(?:^|[\/"'])ingredienti\.json(?:[?"']|$)/m.test(text),source+' non deve caricare ingredienti.json');
}
assert(sw.includes('ingredienti-new.json'));
assert(sw.includes('db-ricette.json'));
assert(sw.includes("const CACHE_NAME = 'dieta-planner-v2'"));
assert.equal(manifest.version,'2');
assert.equal(manifest.display,'fullscreen');
assert.equal(manifest.orientation,'portrait');
assert.deepEqual(manifest.icons.map(icon=>icon.sizes),['192x192','512x512']);
for(const icon of manifest.icons)assert(fs.existsSync(path.join(root,icon.src.replace(/^\.\//,''))),icon.src);

const listeners={};
const self={addEventListener:(type,fn)=>{listeners[type]=fn;},skipWaiting:()=>{}};
vm.runInNewContext(sw,{self,caches:{},fetch,URL,Response,Promise});
assert.deepEqual(Object.keys(listeners).sort(),['activate','fetch','install']);

for(const block of index.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
  if(block[1].trim())new Function(block[1]);
}
console.log('lotto H contratto PWA e sorgenti: ok');
