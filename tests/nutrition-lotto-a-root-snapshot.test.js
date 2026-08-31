'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const baseline = JSON.parse(read('tests/fixtures/nutrition-baseline-v1.json'));
const ingredientsDb = JSON.parse(read('ingredienti-new.json'));
const recipesDb = JSON.parse(read('db-ricette.json'));
const index = read('index.html');
const motor = read('motor-v12.js');

/*
 * Lotto A — snapshot della nuova root.
 *
 * Questo test non modifica e non certifica il comportamento del motore. Congela
 * la baseline normativa, le sorgenti attive e gli anchor strutturali verificati
 * dopo la promozione del nuovo ricettario nella root.
 */

// Baseline PDF indipendente dai cataloghi.
assert.deepEqual(baseline.proteinFrequencies.legumi, { min: 2, max: null });
assert.equal(baseline.subtypeCaps.affettati, 1);
assert.equal(baseline.subtypeCaps.pesce_conservato, 1);
assert(baseline.carbohydrates.limitedByPdf.includes('piadina'));
assert(baseline.carbohydrates.limitedByPdf.includes('gallette'));
assert(baseline.carbohydrates.limitedByPdf.includes('crackers'));
assert.equal(baseline.carbohydrates.userZeroMeansAutomaticExclusion, true);
assert.equal(baseline.carbohydrates.defaultFill.totalSlots, 14);
assert.equal(baseline.carbohydrates.defaultFill.weeklyCappedAutoInsert, false);
assert.equal(baseline.vegetables.residualCompletion, true);
assert.equal(baseline.vegetables.partialContributionCounts, true);
assert.equal(baseline.oil.pdfMinTeaspoons, 2);
assert.equal(baseline.oil.pdfMaxTeaspoons, 3);

// La root deve caricare esclusivamente il nuovo formato.
assert(index.includes("const URL_INGREDIENTI_REMOTE = 'ingredienti-new.json'"));
assert(index.includes("const URL_RICETTE_REMOTE = 'db-ricette.json'"));
assert(index.includes('<script src="nutrition-config.js?v=2"></script>'));
assert(index.includes('<script src="engine-core.js?v=2"></script>'));
assert(index.includes('<script src="motor-v12.js?v=2"></script>'));
assert(motor.includes("loadJson(base+'db-ricette.json')"));
assert(motor.includes("loadJson(base+'ingredienti-new.json')"));
assert(!motor.includes("loadJson(base+'ricette.json')"));
assert(!motor.includes("loadJson(base+'ingredienti.json')"));

// Snapshot strutturale dei due cataloghi correnti.
assert.equal(ingredientsDb.versione, 21);
assert.equal(Object.keys(ingredientsDb.ingredienti).length, 157);
assert.equal(recipesDb.versione, 70);
assert.equal(recipesDb.ricette.length, 40);
assert.equal(new Set(recipesDb.ricette.map((recipe) => recipe.id)).size, recipesDb.ricette.length);
assert(recipesDb.ricette.every((recipe) => Array.isArray(recipe.gruppi)));
assert(recipesDb.ricette.every((recipe) => recipe.gruppi.every((group) => Array.isArray(group.ingredienti))));

const ingredients = ingredientsDb.ingredienti;
assert(Object.values(ingredients).every((ingredient) => Array.isArray(ingredient.allergeni)));
assert(Object.values(ingredients).every((ingredient) => typeof ingredient.bloccoManuale === 'boolean'));

// Classificazioni e unità già verificate da preservare.
assert.equal(ingredients.Speck.sottotipo, 'affettati');
assert.equal(ingredients['Salmone affumicato'].sottotipo, 'pesce_conservato');
assert.equal(ingredients.Friselle.gruppo, 'carboidrati');
assert.equal(ingredients.Friselle.unitaPorzione, 'pezzi');
assert.equal(ingredients.Patate.gruppo, 'carboidrati');
assert.equal(ingredients.Fagiolini.gruppo, 'verdura');
assert.equal(ingredients['Funghi champignon'].gruppo, 'verdura');
assert.equal(ingredients.Zucca.gruppo, 'verdura');

console.log('nutrition-lotto-a-root-snapshot: ok');
