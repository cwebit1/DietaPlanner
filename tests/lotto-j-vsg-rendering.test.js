'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

assert(!html.includes("t==='V-'")&&!html.includes("i.categoria==='V-'"),'la UI non deve più interpretare il token V-');
assert.match(html,/if\(tipo==='C'\)return tokens\.has\('C'\)\|\|tokens\.has\('S'\)/,'S deve far comparire la ricetta nella riga C');
assert.match(html,/if\(tipo==='P'\)return \[\.\.\.tokens\]\.some\(t=>\['PC','PP','PF','PU','PL'\]\.includes\(t\)\)\|\|tokens\.has\('G'\)/,'G deve far comparire la ricetta nella riga P');
assert.match(html,/return tokens\.has\('V'\)/,'la riga V deve mostrare soltanto una vera V');
assert.match(html,/const dati=\[\s*\{tipo:'C',icona:'🍞'\},\s*\{tipo:'P',icona:'🥩'\},\s*\{tipo:'V',icona:'🥬'\}/,'il riepilogo deve produrre esattamente tre righe C/P/V');
assert.match(html,/valoriRigaVsg\(materializzate,riga\.tipo\)/,'Pasto e Menù devono condividere la stessa proiezione V/S/G');

// Il punto vero della regressione: la riga deve mostrare il NOME della
// ricetta, mai un elenco di ingredienti sciolti. valoriRigaVsg deve
// restituire soltanto r.nome, senza alcun ramo che pesca dentro
// ricetta.ingredienti per un elenco alternativo.
const inizioFunzione=html.indexOf('function valoriRigaVsg');
const fineFunzione=html.indexOf('\n}',inizioFunzione);
const corpo=html.slice(inizioFunzione,fineFunzione);
assert(!/\.ingredienti/.test(corpo),'valoriRigaVsg non deve leggere ricetta.ingredienti: deve mostrare sempre e soltanto il nome ricetta, mai un elenco di ingredienti sciolti');
assert.match(corpo,/proprietarie\.map\(r=>r\.nome\)/,'valoriRigaVsg deve restituire i nomi delle ricette');

console.log('lotto J rendering C/P/V: sempre nome ricetta, mai ingredienti sciolti - ok');
