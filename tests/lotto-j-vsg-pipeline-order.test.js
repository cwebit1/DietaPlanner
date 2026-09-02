'use strict';
const assert=require('node:assert/strict');
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

const proteinaSeparata={id:'p-separata',classe:['PP','G']};
const proteinaCombinata={id:'p-combinata',classe:['PP','C','G']};
const carboidrato={id:'c-sugo',classe:['C','S']};
const basi=M.componiBasiProteinaCarboidrato(
  [proteinaSeparata,proteinaCombinata],
  [carboidrato]
);

assert.deepEqual(basi,[[proteinaSeparata,carboidrato],[proteinaCombinata]],'ogni base nasce dalla P e riceve C soltanto se non è già contenuta');
assert.equal(basi[0][0],proteinaSeparata,'P deve essere sempre la prima realizzazione');
assert.equal(basi[0][1],carboidrato,'C deve essere applicata dopo P');
assert.equal(basi[1][0],proteinaCombinata,'una P+C dichiarata resta candidata senza duplicare C');
assert.equal(M.copertura(basi[0][0]).G,true,'G resta dettaglio della proteina');
assert.equal(M.copertura(basi[0][1]).S,true,'S resta dettaglio del carboidrato');

console.log('lotto J ordine pipeline P -> C -> V: ok');
