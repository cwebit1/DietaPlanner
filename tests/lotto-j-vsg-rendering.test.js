'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

assert(!html.includes("t==='V-'")&&!html.includes("i.categoria==='V-'"),'la UI non deve più interpretare il token V-');
assert.match(html,/if\(tipo==='C'\)return tokens\.has\('C'\)\|\|tokens\.has\('S'\)/,'S deve far comparire la ricetta nella riga C');
assert.match(html,/if\(tipo==='P'\)return \[\.\.\.tokens\]\.some\(t=>\['PC','PP','PF','PU','PL'\]\.includes\(t\)\)\|\|tokens\.has\('G'\)/,'G deve far comparire la ricetta nella riga P');
assert.match(html,/return tokens\.has\('V'\)/,'la riga V deve mostrare soltanto una vera V');
assert.match(html,/function righeVsgUniche\(materializzate\)\{[\s\S]{0,600}for\(const tipo of \['C','P','V'\]\)/,'il riepilogo deve costruire le righe C/P/V raggruppando per ricetta, non ripetendo una ricetta a piu ruoli');
assert((html.match(/righeVsgUniche\(materializzate\)/g)||[]).length>=2,'Pasto e Menù devono condividere la stessa proiezione V/S/G raggruppata');

// Il punto vero della regressione: la riga deve mostrare il NOME della
// ricetta, mai un elenco di ingredienti sciolti. valoriRigaVsg deve
// restituire soltanto r.nome, senza alcun ramo che pesca dentro
// ricetta.ingredienti per un elenco alternativo.
const inizioFunzione=html.indexOf('function valoriRigaVsg');
const fineFunzione=html.indexOf('\n}',inizioFunzione);
const corpo=html.slice(inizioFunzione,fineFunzione);
assert(!/\.ingredienti/.test(corpo),'valoriRigaVsg non deve leggere ricetta.ingredienti: deve mostrare sempre e soltanto il nome ricetta, mai un elenco di ingredienti sciolti');
assert.match(corpo,/proprietarie\.map\(r=>r\.nome\)/,'valoriRigaVsg deve restituire i nomi delle ricette');

const inizioUniche=html.indexOf('function righeVsgUniche');
const fineUniche=html.indexOf('\n}',inizioUniche);
const corpoUniche=html.slice(inizioUniche,fineUniche);
assert(!/\.ingredienti/.test(corpoUniche),'righeVsgUniche non deve leggere ricetta.ingredienti: stessa regola, mai ingredienti sciolti');
assert.match(corpoUniche,/nome:r\.nome/,'righeVsgUniche deve usare il nome della ricetta, non un elenco di ingredienti');

console.log('lotto J rendering C/P/V: sempre nome ricetta, mai ingredienti sciolti - ok');
