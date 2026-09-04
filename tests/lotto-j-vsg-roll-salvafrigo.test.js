'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const motor=fs.readFileSync(path.join(__dirname,'..','motor-v12.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

assert.match(motor,/async function normalizzaRealizzazioniVerdura[\s\S]*completaResiduoVerduraRicette\(materializzate,pool,giorno,portionConfig,undefined,bloccateIds\)/,'ogni Roll deve riusare soglia e redistribuzione comuni');
assert.match(motor,/bilancioVerdura:await bilancioVerduraDaRealizzazioni\(realizzazioni,resolved\.vegetables\)/,'il Roll deve salvare il bilancio ricalcolato');
assert.match(motor,/if\(!c\.V\) return \[\];[\s\S]*async function proprietarioRoll/,'Roll V deve accettare soltanto una vera V');
assert.match(motor,/if\(opzioni\.usaInventario\)ctx\.livelliInventario=await livelliPrioritaInventario\(\);[\s\S]{0,400}costruisciPastoSequenziale\(token,giorno,carbCandidati,pool,ctx\)/,'rigenerazione e Salvafrigo devono usare la pipeline comune con priorità inventario attivabile');
assert.match(motor,/if\(ctx\.livelliInventario\)proteine=applicaPrioritaInventario\(proteine,ctx\.livelliInventario\)/,'Salvafrigo deve applicare davvero la priorità di scorte urgenti/avanzi/freezer al pool proteico');
assert.match(html,/modalita==='salvafrigo'\?\{soloAnteprima:true,usaInventario:true\}:\{soloAnteprima:true\}/,'Salvafrigo (pagina Pasto) deve attivare la stessa rigenerazione con priorità inventario, come anteprima non salvata');
assert.match(motor,/programmatoOriginale=\{[\s\S]{0,180}bilancioVerdura:clone\(old\.bilancioVerdura\|\|null\)/,'Salvafrigo deve preservare anche il bilancio programmato originale');

console.log('lotto J Roll, Salvafrigo e rigenerazione V/S/G: ok');
