'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const index=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const inizio=index.indexOf('async function renderMenuSettimanale(){');
const fine=index.indexOf('  const giorni = giorniSettimana(menuSettimanaScarto);',inizio);
assert(inizio>=0&&fine>inizio,'renderMenuSettimanale deve essere presente');
const apertura=index.slice(inizio,fine);

assert.match(
  apertura,
  /const draftAttivo=menuDraft;\s*menuDraft=null;\s*try\s*{\s*await elaboraConsumoAutomatico\(\);\s*}finally\s*{\s*menuDraft=draftAttivo;\s*}/,
  'il consumo automatico del Menù deve disattivare la bozza, scrivere sul piano reale e ripristinare la bozza anche in caso di errore'
);

const posizioneNull=apertura.indexOf('menuDraft=null;');
const posizioneConsumo=apertura.indexOf('await elaboraConsumoAutomatico();');
const posizioneRipristino=apertura.indexOf('menuDraft=draftAttivo;');
assert(posizioneNull<posizioneConsumo&&posizioneConsumo<posizioneRipristino,'ordine isolamento-consumo-ripristino');

console.log('consumo automatico Menù instradato sullo store piano reale: ok');
