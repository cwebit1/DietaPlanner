'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'nutrition-baseline-v1.json'), 'utf8'));
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const motor = fs.readFileSync(path.join(root, 'motor.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'engine-core.js'), 'utf8');
const ingredients = JSON.parse(fs.readFileSync(path.join(root, 'ingredienti.json'), 'utf8')).ingredienti;
const recipes = JSON.parse(fs.readFileSync(path.join(root, 'ricette.json'), 'utf8')).ricette;

/*
 * Lotto A snapshot.
 *
 * Questo test NON certifica che il comportamento attuale sia corretto.
 * Congela invece gli anchor tecnici verificati durante l'audit, compresi
 * i mismatch noti. Quando un Lotto successivo corregge uno di questi punti,
 * il test deve essere aggiornato nello stesso commit insieme allo stato
 * dell'audit. In questo modo una correzione non può cambiare silenziosamente
 * cinque percorsi adiacenti.
 */

// Baseline PDF: fatti normativi indipendenti dal codice corrente.
assert.deepEqual(baseline.proteinFrequencies.legumi, { min: 2, max: null });
assert.equal(baseline.subtypeCaps.affettati, 1);
assert(baseline.carbohydrates.limitedByPdf.includes('piadina'));
assert(baseline.carbohydrates.limitedByPdf.includes('gallette'));
assert(baseline.carbohydrates.limitedByPdf.includes('crackers'));
assert.equal(baseline.carbohydrates.userZeroMeansAutomaticExclusion, true);
assert.equal(baseline.carbohydrates.defaultFill.totalSlots, 14);
assert.equal(baseline.carbohydrates.defaultFill.weeklyCappedAutoInsert, false);
assert.equal(baseline.carbohydrates.partialFill.preserveExactUserCounts, true);
assert.equal(baseline.carbohydrates.partialFill.neverOverrideExplicitZero, true);
assert.equal(baseline.vegetables.residualCompletion, true);
assert.equal(baseline.breakfast.specialDefaultPerWeek, 1);
assert.equal(baseline.breakfast.specialPdfMaxPerWeek, 2);
assert.equal(baseline.oil.pdfMinTeaspoons, 2);
assert.equal(baseline.oil.pdfMaxTeaspoons, 3);

// Snapshot dei conflitti correnti: devono cambiare solo in un Lotto dedicato.
assert(
  /legumi:\s*\{min:2,\s*max:3\}/.test(index),
  'Lotto A snapshot: FREQUENZE_CONSIGLIATE legumi non è più max 3; aggiornare audit e test nello stesso Lotto.'
);
assert(
  engine.includes("legumi:{min:N.PDF_BASELINE.proteinFrequencies.legumi.min,max:N.PDF_BASELINE.proteinFrequencies.legumi.max,target:N.APP_DEFAULTS.proteinTargets.legumi}"),
  'Lotto C: engine default legumi deve derivare dal resolver canonico.'
);
assert(
  /\{\s*chiave:\s*'piadina',\s*label:\s*'Piadina',\s*limitato:\s*true/.test(index),
  'Lotto A snapshot: classificazione corrente della piadina è cambiata; aggiornare audit e test.'
);
assert(
  /\{\s*chiave:\s*'gallette',\s*label:\s*'Gallette',\s*limitato:\s*false/.test(index),
  'Lotto A snapshot: Gallette non sono più non-limitate nel codice; aggiornare audit e test.'
);
assert(
  /\{\s*chiave:\s*'crackers',\s*label:\s*'Crackers',\s*limitato:\s*false/.test(index),
  'Lotto A snapshot: Crackers non sono più non-limitati nel codice; aggiornare audit e test.'
);
assert(
  index.includes("const attivatiLimitati=new Set(CONFIG_CARB_TIPI.filter(t=>t.limitato&&(statoCaselleCarb[t.chiave]||0)>0)"),
  'Lotto A snapshot: completaCaselleCarboidrati non conserva più il filtro sui limitati attivati; aggiornare audit e test.'
);
assert(
  index.includes("const min=Math.min(...pool.map(t=>statoCaselleCarb[t.chiave]||0))"),
  'Lotto A snapshot: il completamento corrente non usa più il bilanciamento per minimo; aggiornare audit e test.'
);
assert(
  !engine.includes("if(!pool.length)pool=Object.keys(defs).filter"),
  'Lotto C: è riapparso il fallback globale dei carboidrati.'
);
assert(
  engine.includes("if(!pool.length)return null"),
  'Lotto C: chooseCarb deve fermarsi quando il budget residuo è esaurito.'
);
assert(
  motor.includes("const cov=E.parseCoverage(protein);let veg=null;if(!cov.veg&&!hasPotato)veg=await scegliContornoMotore"),
  'Lotto A snapshot: la copertura verdura nel pasto modulare è cambiata; aggiornare audit e test.'
);
assert(
  /getFrequenzeConsigliateEffettive\(\)\s*\{\s*return FREQUENZE_CONSIGLIATE;\s*\}/.test(index),
  'Lotto A snapshot: il bridge frequenze Set non è più hardcoded; aggiornare audit e test.'
);
assert(
  index.includes('await applicaQuantitaNutrizionistaAlleRicette();'),
  'Lotto A snapshot: il salvataggio nutrizionista non richiama più la mutazione ricette; aggiornare audit e test.'
);

// Chiavi configurazione: mismatch noto UI/motore e cap utente dormiente.
assert(index.includes("chiave:'setVerdureDisattivate'"));
assert(motor.includes("'setVerdureDisattivate'"));
assert(motor.includes("'verdureDisattivate'"),'fallback legacy verdure da preservare durante la migrazione');
assert(motor.includes("'tettiIngredienteSettimanali'"),'chiave cap utente deve restare letta dal resolver/motore');
assert(
  !index.includes("chiave:'tettiIngredienteSettimanali'"),
  'Lotto A snapshot: è comparso un writer UI per i tetti utente; aggiornare audit e test.'
);

// I cap ingrediente attuali sono soft-fallback: se tutto il pool sfora, il pool originale rientra.
assert(
  /return \{pool:allowed,exceeded:allowed\.length<all\.length,blockedAll:all\.length>0&&!allowed\.length\}/.test(engine),
  'Lotto C: applyIngredientCaps deve mantenere i massimi hard senza reintrodurre il pool originale.'
);

assert(motor.includes('caricaConfigurazioneNutrizionaleRisolta'));
assert(motor.includes('N.resolveNutritionConfig'));
assert(!motor.includes("cfg.proteinFrequencies.formaggi={min:3,max:6,target:5}"),'override vegetariano arbitrario non deve riapparire');
assert(!motor.includes("cfg.proteinFrequencies.legumi={min:14,max:null,target:14}"),'override vegano arbitrario non deve riapparire');

// Classificazioni base già corrette da preservare.
assert.equal(ingredients.Speck && ingredients.Speck.sottotipo, 'affettati');
assert.equal(ingredients['Salmone affumicato'] && ingredients['Salmone affumicato'].sottotipo, 'pesce_conservato');

// Ricette miste che oggi possono eludere il cap perché lo storico conta recipe.gruppoProteico.
const speckMixed = recipes.find(r => r.nome === 'Pasta con speck e taleggio');
assert(speckMixed, 'Manca ricetta snapshot: Pasta con speck e taleggio');
assert.equal(speckMixed.gruppoProteico, 'formaggio_stagionato');

const smokedSalmonMixed = recipes.find(r => r.nome === 'Tramezzini con formaggio spalmabile e salmone affumicato');
assert(smokedSalmonMixed, 'Manca ricetta snapshot: Tramezzini con formaggio spalmabile e salmone affumicato');
assert.equal(smokedSalmonMixed.gruppoProteico, 'formaggio_fresco');

console.log('nutrition-lotto-a-snapshot: ok');
