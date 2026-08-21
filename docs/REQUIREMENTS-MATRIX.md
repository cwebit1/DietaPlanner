# DietaPlanner — matrice requisiti eseguibile

| ID | Regola | Priorità | Responsabile | Test |
|---|---|---|---|---|
| ENG-01 | Proteina scelta prima del carboidrato | HARD | `composeMeal` | `protein-first` |
| ENG-02 | Carboidrato adattato dopo la proteina, senza filtro di fattibilità upstream | HARD | `chooseCarb` | `all configured carbs rotate` |
| ENG-03 | Affettati impongono pane | HARD | `composeMeal` | `affettati -> pane` |
| ENG-04 | Secondo con patate chiude P+C+V | HARD | `composeMeal` | `potato rule` |
| ENG-05 | Frequenze macro e cap sottotipi configurabili | HARD | `buildProteinGrid`, adapter | `weekly frequencies` |
| ENG-06 | Massimo due fonti proteiche al giorno | HARD | adapter generazione | `daily protein cap` |
| ENG-07 | Ricetta non ripetuta nella stessa generazione | HARD | `chooseRecipe` | `temporary stock` |
| ENG-08 | Roll manuale non consuma stock settimanale | HARD | UI adapter | browser test |
| ENG-09 | Poco tempo preferisce ricette senza cottura e P+C | SOFT | `chooseRecipe`, adapter | `quick fallback` |
| ENG-10 | `soloManuale` esclusa dall'automatico | HARD | `recipeBlocked` | `manual-only filter` |
| CARB-01 | Budget 14 celle, max 6 per tipo | HARD | `validateCarbBudget` | `carb budget` |
| CARB-02 | Limitati max 2 ciascuno e 3 complessivi | HARD | `validateCarbBudget` | `limited carbs` |
| CARB-03 | Gallette e crackers non limitati | HARD | configurazione canonica | data test |
| VEG-01 | Fresco in inventario con porzione piena prima degli altri tier | HARD | `chooseVegetable` | `fresh inventory first` |
| VEG-02 | Nessun contorno ripetuto nello stesso giorno, alternanza settimanale | HARD/SOFT | `chooseVegetable` | `vegetable rotation` |
| VEG-03 | Disattivate e ricorrente sono vincoli hard | HARD | `chooseVegetable` | `disabled/recurring` |
| VEG-04 | Stagione è priorità, non esclusione; inventario prevale | SOFT | `chooseVegetable` | `inventory beats season` |
| INV-01 | Inventario non esclude ricette dalla programmazione | HARD | `chooseRecipe` | `empty inventory still plans` |
| INV-02 | Priorità scadenza, avanzo, freezer | SOFT | `inventoryUrgency` | `urgency order` |
| INV-03 | Lista spesa è deficit esatto cumulativo | HARD | lista spesa UI | browser/data test |
| INV-04 | Quasi esaurito avvisa senza escludere | HARD | UI/helper | browser test |
| HIST-01 | Storico consumi indipendente dal piano e cancellabile solo esplicitamente | HARD | `consumoGiorno` | persistence test |
| HIST-02 | Consumo automatico solo su pasto preesistente alla finestra | HARD | UI consumo | browser test |
| TIME-01 | Generazione automatica solo per giorni `> oggi` | HARD | `automaticDayAllowed`, adapter | `future-only` |
| TIME-02 | Oggi resta modificabile manualmente fino alla scadenza | HARD | UI | browser test |
| SPEC-01 | Speciali deliberati, max 2/settimana, esclusi dai macro | HARD | UI/adapter | browser test |
| DATA-01 | Ogni ingrediente ricetta risolve nel catalogo | HARD | import/validator | data test |
| DATA-02 | Copertura granulare PC/PP/PF/PU/PL+C+V | HARD | `coverageForRecipe`, dati | coverage test |
| DATA-03 | Verdura: 70g insalata, 200g ortaggi, aromatici esclusi | HARD | `coverageForRecipe` | thresholds test |
| SAFE-01 | Allergie attive e blocchi ingrediente escludono ovunque | HARD | `recipeBlocked`, UI ricerca | filter test |
| SAFE-02 | Profili onnivoro/vegetariano/vegano sono configurati solo nell'area nutrizionista | HARD | `dietProfile`, `ricetteAmmesse` | profile filters |
| SAFE-03 | Ogni allergia o intolleranza si seleziona dalla griglia allergeni | HARD | `allergeniAttivi`, `recipeBlocked` | allergen filters |
| SAFE-04 | Esclusioni ingredienti modificabili solo nell'area nutrizionista | HARD | `ingredientiBloccati`, `filtriSicurezzaRicette` | ingredient exclusion |
| SAFE-05 | Ogni ingrediente dichiara esplicitamente l'array `allergeni`, anche quando vuoto | HARD | `ingredienti.json`, import IndexedDB | schema + coverage audit |
| SAFE-06 | Ogni ricetta rende determinabili gli allergeni attraverso i propri ingredienti risolti; eventuali campi ricetta sono solo una cache derivata | HARD | `ricette.json`, catalogo ingredienti | allergen derivation audit |
| SAFE-07 | Un allergene attivo o ingrediente escluso dal nutrizionista rimuove la ricetta da ogni pool automatico e manuale | HARD | `recipeBlocked`, `ricetteAmmesse` | exhaustive hard-exclusion test |
| UI-01 | Menù renderizzabile con piano, inventario e storico vuoti | HARD | `renderMenuSettimanale` | first-run smoke test |
| UI-02 | Set utente e configurazione nutrizionista sono viste separate | HARD | `view-set`, `view-impostazioni` | DOM/browser test |
| MENU-01 | Bozza separata dal piano committato | HARD | `menuDraft` UI | isolation test |
| MENU-02 | Annulla/Resetta/Rigenera/Salva con semantica specificata | HARD | menu UI | browser test |
| MENU-03 | Carosello multi-settimana | UX | menu UI | browser test |
| UI-03 | Pannello pasto: Pasto/Speciale e roll macro | HARD | UI | `ui-contract.test.js` + browser |
| UI-04 | Tastiera mobile non copre il campo attivo | UX | visualViewport helper | `ui-contract.test.js` + viewport browser |
| SET-01 | Tabelle carboidrati e proteine hanno Pulisci/Completa/Casuale/Salva | HARD | Set UI | `ui-contract.test.js` + browser |
| SET-02 | Celle di sistema distinguibili da quelle utente | UX | `origineCaselleCarb` | `ui-contract.test.js` |
| SET-03 | Cereali non graditi senza possibilità di escluderli tutti | HARD | Set UI, `ricetteAmmesse` | browser + conformance |
| SET-04 | Tetto settimanale personalizzato trasversale con fallback segnalato | SOFT | `applyIngredientCaps`, adapter | `engine-core.test.js` |
| MAN-01 | Ricerca diretta per Carbo/Prot/Verdura include `soloManuale` | HARD | `abilitaRicercaDirettaPasto` | `ui-contract.test.js` + browser |
| MAN-02 | Ricerca diretta rispetta allergie, blocchi e tetti raggiunti | HARD | `ricetteAmmesse(false)`, ricerca UI | conformance + browser |
| BREAK-01 | Colazione a gruppi, speciale configurabile e premio dopo 5 regolari | HARD | colazione UI | conformance + browser |
| SNACK-01 | Tetti settimanali/giornalieri spuntini configurabili | HARD | config nutrizionista + UI | conformance |
| SHOP-01 | Comprati immutabili durante il ricalcolo | HARD | lista spesa UI | source contract |
| CONSUME-01 | Inventario scalato solo al consumo reale | HARD | `elaboraConsumoAutomatico` | source contract |
| RESET-01 | Reset piano non cancella `consumoGiorno` | HARD | reset UI | source contract |
| RESET-02 | Reset storico esplicito cancella `consumoGiorno` | HARD | reset UI | `conformance.test.js` |
| PWA-01 | Cache versionata e asset attivi inclusi | HARD | `sw.js` | `conformance.test.js` + live smoke |

## Criterio di chiusura

Un requisito è considerato chiuso soltanto quando ha almeno un controllo automatico e, se coinvolge DOM/IndexedDB, una verifica browser sulla build pubblicata. La matrice non attribuisce più genericamente alla suite browser coperture che lo smoke test non esegue.
