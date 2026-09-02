'use strict';
const assert=require('node:assert/strict');
require('../motor-v12.js');
const M=global.DietaPlannerMotorV12;

assert.equal(M.categoriaPrincipale(['C','S']),'C','il sugo resta dettaglio del carboidrato');
assert.equal(M.categoriaPrincipale(['PP','G']),'PP','la guarnizione resta dettaglio della proteina');
assert.equal(M.categoriaPrincipale('V'),'V','una vera verdura resta categoria V');
assert.equal(M.categoriaPrincipale('S'),'S','un token S isolato non viene promosso a V');
assert.equal(M.categoriaPrincipale('G'),'G','un token G isolato non viene promosso a V');

assert.deepEqual(
  Object.assign({},M.copertura({classe:['C','S']}),{tokens:[...M.copertura({classe:['C','S']}).tokens]}),
  {tokens:['C','S'],C:true,V:false,S:true,G:false,P:false,proteinTokens:[]}
);
assert.deepEqual(
  Object.assign({},M.copertura({classe:['PP','G']}),{tokens:[...M.copertura({classe:['PP','G']}).tokens]}),
  {tokens:['PP','G'],C:false,V:false,S:false,G:true,P:true,proteinTokens:['PP']}
);
assert.equal(M.copertura({classe:'V-'}).V,false,'V- non è più una copertura riconosciuta');

assert.equal(M.scoreCopertura({classe:['C','S']},'C'),14,'S contribuisce allo score senza valere come V completa');
assert.equal(M.scoreCopertura({classe:['PP','G']},'PP'),11,'G contribuisce allo score senza valere come V completa');
assert.equal(M.scoreCopertura({classe:['C','V']},'C'),16,'la V completa mantiene il proprio peso distinto');

const proteina={classe:['PP','G']};
const carboidrato={classe:['C','S']};
const verdura={classe:'V'};
assert.equal(M.pastoCompletoPerToken([proteina,carboidrato],'PP'),false,'S e G non chiudono il requisito V');
assert.equal(M.pastoCompletoPerToken([proteina,carboidrato,verdura],'PP'),true,'solo una vera V chiude il pasto');

console.log('lotto J semantica motore V/S/G: ok');
