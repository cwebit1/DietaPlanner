'use strict';
const assert=require('node:assert/strict');
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

assert.deepEqual(M.ruoliVerduraDaClasse(['PP','G']),{V:false,S:false,G:true},'P+G deve dichiarare una guarnizione, non una V');
assert.deepEqual(M.ruoliVerduraDaClasse(['C','S']),{V:false,S:true,G:false},'C+S deve dichiarare un sugo, non una V');
assert.deepEqual(M.ruoliVerduraDaClasse('V'),{V:true,S:false,G:false},'V resta riservata alla verdura completa');

assert.deepEqual(M.calcolaBilancioVSG({richiestaGrammi:200}),{
  richiestaGrammi:200,grammiV:0,grammiS:0,grammiG:0,residuoGrammi:200,
  coperturaCompleta:false,strategia:'v_dedicata'
});
assert.equal(M.calcolaBilancioVSG({richiestaGrammi:200,grammiS:80}).residuoGrammi,120);
assert.equal(M.calcolaBilancioVSG({richiestaGrammi:200,grammiG:60}).residuoGrammi,140);
assert.deepEqual(M.calcolaBilancioVSG({richiestaGrammi:200,grammiS:80,grammiG:80}),{
  richiestaGrammi:200,grammiV:0,grammiS:80,grammiG:80,residuoGrammi:40,
  coperturaCompleta:false,strategia:'redistribuzione_sg'
});
assert.equal(M.calcolaBilancioVSG({richiestaGrammi:200,grammiS:100,grammiG:50}).strategia,'v_dedicata','50 g esatti richiedono una V dedicata');
assert.equal(M.calcolaBilancioVSG({richiestaGrammi:200,grammiV:200}).strategia,'nessuna');
assert.equal(M.calcolaBilancioVSG({richiestaGrammi:200,grammiV:250}).residuoGrammi,0,'il residuo non può essere negativo');
assert.equal(M.calcolaBilancioVSG({richiestaGrammi:200,grammiS:170}).strategia,'regola_sotto_soglia_da_definire','non va inventata la redistribuzione se G è assente');
assert.equal(M.calcolaBilancioVSG({richiestaGrammi:200,grammiG:170}).strategia,'regola_sotto_soglia_da_definire','non va inventata la redistribuzione se S è assente');

console.log('lotto J contratto V/S/G: ok');
