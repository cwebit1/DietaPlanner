'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),ingredients=require('../ingredienti.json'),recipes=require('../ricette.json');
const names=new Set(Object.keys(ingredients.ingredienti));
assert.equal(ingredients.versione,5);assert.equal(recipes.versione,9);
for(const r of recipes.ricette){assert(r.nome);assert(Array.isArray(r.ingredienti));assert(Array.isArray(r.allergeniPresenti),`${r.nome}: allergeniPresenti`);for(const row of r.ingredienti)assert(names.has(row[0]),`${r.nome}: ingrediente mancante ${row[0]}`);const derived=[...new Set(r.ingredienti.flatMap(row=>ingredients.ingredienti[row[0]].allergeni||[]))].sort();assert.deepEqual(r.allergeniPresenti,derived,`${r.nome}: allergeni derivati`);if(!['colazione','spuntino'].includes(r.tipoPortata))assert.equal(typeof r.richiedeCottura,'boolean',`${r.nome}: richiedeCottura`);assert.equal(typeof r.soloManuale,'boolean');}
for(const required of ['Ramen Giapponese','Tagliolini al salmone','Tagliolini ai funghi','Tagliolini al pomodoro fresco e basilico','Zuppa cereali e legumi in brodo','Zuppa di lenticchie','Zuppa di ceci','Zuppa di fagioli al rosmarino','Misticanza di radicchio','Radicchio rosso e carote'])assert(recipes.ricette.some(r=>r.nome===required),required);
assert(recipes.ricette.find(r=>r.nome==='Ramen Giapponese').soloManuale);
for(const [name,x] of Object.entries(ingredients.ingredienti)){assert(Array.isArray(x.allergeni),name);assert.equal(typeof x.bloccoManuale,'boolean',name);}
console.log('data: ok');
