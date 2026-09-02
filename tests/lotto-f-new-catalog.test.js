const assert = require('node:assert/strict');
const ingredientsFile = require('../ingredienti-new.json');
const recipesFile = require('../db-ricette.json');

const ingredients = ingredientsFile.ingredienti;
const recipes = recipesFile.ricette;
const expectedGroup = {
  C: 'carboidrati',
  PC: 'proteine',
  PP: 'proteine',
  PF: 'proteine',
  PU: 'proteine',
  PL: 'proteine',
  V: 'verdura'
};

assert.equal(ingredientsFile.versione, 21);
assert.equal(recipesFile.versione, 73);
assert.equal(Object.keys(ingredients).length, 157);
assert.equal(recipes.length, 39);

for (const recipe of recipes) {
  assert.ok(Number.isInteger(recipe.id), `id ricetta non valido: ${recipe.id}`);
  assert.equal(recipe.gruppi.length, 4, `ricetta ${recipe.id}: gruppi`);
  for (const group of recipe.gruppi) {
    const items=(group.ingredienti||[]).concat((group.composizioni||[]).flatMap(c=>c.ingredienti||[]));
    for (const item of items) {
      const metadata = ingredients[item.nome];
      assert.ok(metadata, `ricetta ${recipe.id}: ingrediente mancante ${item.nome}`);
      if (item.categoria && !expectedGroup[item.categoria]) continue;
      if (!expectedGroup[group.categoria]) continue;
      const actualGroups = Array.isArray(metadata.gruppo) ? metadata.gruppo : [metadata.gruppo];
      const expected=item.categoria&&expectedGroup[item.categoria]?expectedGroup[item.categoria]:expectedGroup[group.categoria];
      assert.ok(
        !expected||actualGroups.includes(expected),
        `ricetta ${recipe.id}: ${item.nome} non appartiene a ${item.categoria||group.categoria}`
      );
    }
  }
}

for (const name of ['Speck', 'Pancetta a cubetti', 'Prosciutto cotto', 'Prosciutto crudo', 'Bresaola', 'Salsiccia', 'Salsiccia di maiale', 'Salsiccia di tacchino']) {
  assert.equal(ingredients[name].sottotipo, 'affettati', `${name}: famiglia insaccati/affettati`);
  assert.equal(ingredients[name].porzione, 60, `${name}: porzione principale PDF`);
}

for (const name of ['Tonno', 'Sgombro in scatola', 'Salmone affumicato']) {
  assert.equal(ingredients[name].sottotipo, 'pesce_conservato', `${name}: pesce conservato`);
}
for (const name of ['Tonno fresco', 'Pesce spada']) {
  assert.equal(ingredients[name].sottotipo, 'pesce_grande', `${name}: pesce grande`);
}

assert.equal(ingredients.Patate.gruppo, 'carboidrati');
for (const name of ['Fagiolini', 'Funghi champignon', 'Zucca']) {
  assert.equal(ingredients[name].gruppo, 'verdura', `${name}: classificazione verdura`);
}
for (const name of ['Piselli in barattolo', 'Piselli surgelati']) {
  assert.deepEqual(ingredients[name].gruppo, ['proteine', 'verdura'], `${name}: uso occasionale come verdura`);
}

for (const name of ['Insalata mista', 'Lattuga', 'Radicchio', 'Rucola', 'Songino', 'Valeriana']) {
  assert.equal(ingredients[name].porzione, 75, `${name}: porzione insalata`);
}
for (const name of ['Fagiolini', 'Funghi champignon', 'Zucca']) {
  assert.equal(ingredients[name].porzione, 225, `${name}: porzione ortaggi`);
}

assert.equal(ingredients.Uova.unitaPorzione, 'pezzi');
assert.equal(ingredients.Uova.porzione, 2);
assert.equal(ingredients.Friselle.unitaPorzione, 'pezzi');
assert.equal(ingredients.Friselle.porzione, 2);
assert.equal(ingredients.Friselle.pesoPorzioneGrammi, 50);

assert.equal(ingredients['Granita fatta in casa'].conservazione, 'surgelato');
assert.equal(ingredients['Sfoglie di lasagna'].conservazione, 'lunga');
assert.ok(!ingredients['Burro di arachidi'], 'ingrediente escluso per scelta utente');
assert.ok(!ingredients['Farina 00'], 'ingrediente tecnico non inventariato');
assert.ok(ingredients.Riso, 'riso semplificato presente');
assert.ok(!ingredients['Riso Originario'] && !ingredients['Riso integrale'], 'varianti riso legacy assenti');

console.log('lotto F catalogo nuovo: ok');
