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
| SAFE-02 | Profili vegetariano, vegano, celiachia e lattosio sono configurati solo nell'area nutrizionista | HARD | `dietProfile`, `ricetteAmmesse` | profile filters |
| UI-01 | Menù renderizzabile con piano, inventario e storico vuoti | HARD | `renderMenuSettimanale` | first-run smoke test |
| UI-02 | Set utente e configurazione nutrizionista sono viste separate | HARD | `view-set`, `view-impostazioni` | DOM/browser test |
| MENU-01 | Bozza separata dal piano committato | HARD | `menuDraft` UI | isolation test |
| MENU-02 | Annulla/Resetta/Rigenera/Salva con semantica specificata | HARD | menu UI | browser test |
| MENU-03 | Carosello multi-settimana | UX | menu UI | browser test |
| UI-01 | Pannello pasto: Pasto/Speciale e roll macro | HARD | UI | browser test |
| UI-02 | Tastiera mobile non copre il campo attivo | UX | visualViewport helper | mobile test |

I requisiti non coperti da test unitario puro sono coperti nella suite browser integrata prima della pubblicazione.
