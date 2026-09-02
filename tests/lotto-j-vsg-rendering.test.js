'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

assert(!html.includes("t==='V-'")&&!html.includes("i.categoria==='V-'"),'la UI non deve più interpretare il token V-');
assert.match(html,/if\(tipo==='C'\)return i\.categoria==='C'\|\|\(tokens\.has\('S'\)/,'S deve essere mostrato dentro la riga C');
assert.match(html,/if\(tipo==='P'\)return \['PC','PP','PF','PU','PL'\]\.includes\(i\.categoria\)\|\|\(tokens\.has\('G'\)/,'G deve essere mostrato dentro la riga P');
assert.match(html,/return tokens\.has\('V'\)&&/,'la riga V deve mostrare ingredienti soltanto di una vera V');
assert.match(html,/const dati=\[\s*\{tipo:'C',icona:'🍞'\},\s*\{tipo:'P',icona:'🥩'\},\s*\{tipo:'V',icona:'🥬'\}/,'il riepilogo deve produrre esattamente tre righe C/P/V');
assert.match(html,/valoriRigaVsg\(materializzate,riga\.tipo\)/,'Pasto e Programmazione devono condividere la stessa proiezione V/S/G');

console.log('lotto J rendering C/P/V con S e G incorporati: ok');
