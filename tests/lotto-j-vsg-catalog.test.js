'use strict';
const assert=require('node:assert/strict');
const db=require('../db-ricette.json');

assert.equal(db.versione,73);
assert.equal(db.ricette.length,39);
const byId=new Map(db.ricette.map(r=>[r.id,r]));
const classe=id=>Array.isArray(byId.get(id).classe)?byId.get(id).classe:[byId.get(id).classe];

for(const id of [6,7,43])assert.deepEqual(classe(id),['C','S'],`template ${id}: sugo C+S`);
assert.deepEqual(classe(44),['C','PU','PL','S'],'uovo e piselli resta un sugo proteico C+S');
assert.deepEqual(classe(31),['PC','G'],'bresaola e rucola usa G');
assert.deepEqual(classe(33),['PC','G'],'prosciutto e melone usa G');
assert.deepEqual(classe(39),['PP','G'],'seppie e piselli usa G');

assert.deepEqual(classe(5),['V','C'],'Pomodori gratinati conserva la V completa');
for(const id of [9,10,16,42])assert(classe(id).includes('V'),`template ${id}: piatto freddo con V completa`);

const mistiConV=db.ricette.filter(r=>{const c=Array.isArray(r.classe)?r.classe:[r.classe];return c.includes('V')&&c.length>1;}).map(r=>r.id).sort((a,b)=>a-b);
assert.deepEqual(mistiConV,[5,9,10,16,42],'nessun sugo o guarnizione deve restare classificato V');

console.log('lotto J audit catalogo V/S/G: ok');
