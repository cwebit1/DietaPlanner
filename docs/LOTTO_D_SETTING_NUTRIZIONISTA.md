# DietaPlanner — Lotto D: Setting nutrizionista

**Data:** 2026-08-29  
**Versione applicativa di verifica:** v87  
**Resolver canonico:** `nutrition-config.js`  
**Prerequisiti:** `docs/BASELINE_NUTRIZIONISTA_PDF_V1.md`, `docs/LOTTO_B_RESOLVER.md`, `docs/LOTTO_C_MOTORE.md`

## 1. Scopo

Collegare la vista **Setting nutrizionista** alla sorgente canonica dei vincoli, aggiungere la rappresentazione delle quantità/limiti contestuali e rimuovere il side-effect per cui il salvataggio del Setting riscriveva il catalogo ricette.

Punti baseline affrontati:
- **11**: quantità primaria non più affidata soltanto alla macro;
- **12**: struttura quantità/limiti per `colazione`, `pastoPrincipale`, `spuntino`;
- **13**: eliminata la mutazione globale delle ricette al salvataggio e all'avvio;
- **15**: unità UI preservate come `pz`, `g`, `fette` e predisposizione `ml`;
- **27**: infrastruttura per limiti contestuali colazione;
- **28-29**: valori globali mostrati tramite la baseline canonica e distinti dai limiti superiori PDF;
- **31**: olio risolto dal resolver nel range PDF 10-15 g;
- **35-37**: separazione visibile tra valori PDF/piano e regole APP-CWE.

Il Lotto D **non** modifica ancora il Set utente, il catalogo ingredienti/ricette o il calcolo quantitativo delle realizzazioni.

## 2. Sorgente canonica della vista

La costante storica `CONFIG_AVANZATA_DEFAULT` resta soltanto come fallback di bootstrap/compatibilità.

Le operazioni attive della vista usano ora:
- `configAvanzataDefaultCanonico()`;
- `configAvanzataEffettivaSalvata()`;
- `risolviConfigNutrizionista()`;
- `configAvanzataDaRisolta()`.

Queste funzioni delegano a `DietaPlannerNutritionConfig.resolveNutritionConfig()`.

Conseguenza: UI, salvataggio e runtime degli elementi già collegati non possiedono più una seconda interpretazione indipendente dei limiti PDF.

## 3. Salvataggio

`salvaConfigAvanzata()`:

1. legge i campi;
2. mantiene le validazioni locali di coerenza min/max;
3. passa configurazione, allergeni, esclusioni e vincoli ingrediente al resolver canonico;
4. se `resolved.valid === false`, non salva;
5. se il resolver produce normalizzazioni entro i limiti PDF, salva la configurazione effettiva normalizzata e informa l'utente;
6. salva vincoli ingredienti e classi carboidrati;
7. aggiorna i cap runtime già esistenti;
8. non modifica alcuna ricetta.

Messaggio di conferma:
`Configurazione salvata senza modificare il catalogo ricette`.

## 4. Rimozione side-effect ricette

Sono stati rimossi da `index.html`:
- `quantitaNutrizionistaInGrammi()`;
- `applicaQuantitaNutrizionistaAlleRicette()`;
- la chiamata al salvataggio del Setting;
- la chiamata automatica dopo l'aggiornamento remoto delle ricette durante l'avvio.

Quindi un cambio di quantità nel Setting **non riscrive più `ricetta.ingredienti[].quantita`**.

Le quantità effettive dovranno essere risolte a runtime in un lotto dedicato, senza alterare il modello ricetta.

## 5. Quantità e limiti contestuali

Ogni vincolo ingrediente può ora contenere:

```js
contesti: {
  colazione:       { max, quantita },
  pastoPrincipale: { max, quantita },
  spuntino:        { max, quantita }
}
```

Il resolver restituisce questi dati come:

```js
contexts: {
  colazione:       { max, quantity },
  pastoPrincipale: { max, quantity },
  spuntino:        { max, quantity }
}
```

I campi contestuali sono indipendenti dal tetto utente e non modificano il catalogo.

## 6. Riferimenti PDF contestuali già codificati

`nutrition-config.js` espone `contextDefaultsForIngredient(meta)`.

Metadata attualmente verificati e rappresentati:

### Uova
- colazione: default 1 pz, range PDF 1-2 pz, max 2/settimana;
- pasto principale: 2 pz.

### Ricotta
- colazione: default 50 g, riferimento 50-60 g;
- pasto principale: 100 g.

### Salmone affumicato
- colazione: 40 g;
- pasto principale: 100 g.

### Famiglia affettati
- colazione: 40 g;
- pasto principale: 60 g.

Quindi Speck, prosciutto, bresaola ecc. possono ricevere la porzione contestuale della famiglia senza alterare il loro catalogo.

### Burro
- colazione: max 2/settimana.

### Crema di nocciole e cacao
- colazione: max 2/settimana.

Per Burro e Crema la guida esprime la quantità in **cucchiaini**. Non viene fatta una conversione silenziosa in grammi: la quantità resta da collegare a metadata unità espliciti, evitando di inventare un peso.

Gli yogurt Müller/aromatizzati citati dal PDF non sono presenti nel catalogo corrente: nessuna voce fittizia è stata aggiunta nel Lotto D.

## 7. UI contestuale

Per gli ingredienti Carboidrati/Proteine/Verdure:
- la riga generale resta `Min | Max | Quantità`;
- quando esistono regole PDF contestuali, esse vengono mostrate anche se l'ingrediente non è stato reso globalmente `limitato`;
- se l'ingrediente è limitato, sono disponibili override per tutti e tre i contesti.

Gli ingredienti fuori dalle tre macro ma con regole PDF note, per esempio **Burro** e **Crema di nocciole e cacao**, compaiono in una sezione:
**Contesti PDF aggiuntivi**.

Un override contestuale può essere salvato con `stato:'disponibile'`: configurare una dose di colazione non trasforma automaticamente l'ingrediente in un alimento globalmente limitato.

## 8. Piano vegetariano/vegano nella vista

Le frequenze delle macro escluse dal profilo vengono ora disabilitate visivamente usando il profilo risolto dal resolver:
- vegetariano → carne/pesce disabilitati;
- vegano → carne/pesce/formaggi/uova disabilitati.

Non vengono introdotte frequenze alternative arbitrarie.

Gli ingredienti esclusi dal profilo restano bloccati negli swipe come già previsto.

## 9. Separazione PDF / APP-CWE

Nella sezione Parametri nutrizionali globali sono ora visibili due blocchi distinti:

### PDF / piano nutrizionale
- frequenze proteiche;
- sottotipi limitati;
- frutta e porzione;
- colazioni speciali;
- olio;
- spuntini con riferimento PDF;
- frutta secca.

### Regole applicative APP-CWE
- max fonti proteiche/giorno;
- pasti speciali;
- cap generico `da_limitare`;
- cooldown;
- deadline pranzo/cena.

Questo evita di attribuire al PDF regole tecniche dell'app.

## 10. Reset

`Ripristina valori del piano` usa ora `configAvanzataDefaultCanonico()`.

Il reset:
- ripristina la baseline effettiva;
- azzera allergeni e vincoli configurati come prima;
- aggiorna anche i cap runtime;
- non tocca ricette/ingredienti.

## 11. Runtime già collegato

`applicaConfigAvanzataRuntime()` risolve la configurazione tramite la sorgente canonica prima di impostare:
- `CAP_SPUNTINO_SETTIMANALE`;
- `CAP_SPUNTINO_GIORNALIERO`;
- `CAP_COLAZIONE_SPECIALE`.

Gli altri parametri ancora non consumati dal runtime restano esplicitamente fuori da questo lotto.

## 12. File modificati

Applicazione:
- `nutrition-config.js`;
- `index.html`.

Test:
- `tests/nutrition-config.test.js`;
- `tests/nutrition-lotto-a-snapshot.test.js`;
- `tests/lotto-c-integration.test.js`;
- nuovo `tests/lotto-d-nutritionist-setting.test.js`.

Non modificati:
- `motor.js` nel Lotto D;
- `engine-core.js` nel Lotto D;
- `ingredienti.json`;
- `ricette.json`.

## 13. Test

Eseguiti:
- sintassi `nutrition-config.js`: PASS;
- sintassi `engine-core.js`: PASS;
- sintassi `motor.js`: PASS;
- sintassi script inline `index.html`: PASS;
- `nutrition-config.test.js`: PASS;
- `engine-core.test.js`: PASS;
- `lotto-c-integration.test.js`: PASS;
- `lotto-d-nutritionist-setting.test.js`: PASS;
- `nutrition-lotto-a-snapshot.test.js`: PASS;
- `conformance.test.js`: PASS.

`ui-contract.test.js` continua a fallire sullo stesso assert legacy preesistente relativo a `if(!haContenutoVoce || !voce.programmatoIl) continue;`. Non appartiene al Lotto D e non è stato modificato.

## 14. Cosa resta aperto

Il Lotto D non rende ancora operative nel calcolo pasti le quantità contestuali: adesso sono **rappresentate, configurabili e salvabili**.

Per applicarle realmente occorre che una realizzazione possa portare la propria quantità/fattore e che lo stesso valore sia usato simultaneamente da:
- nutrizione;
- inventario;
- lista spesa;
- storico consumato.

Questo resta l'intervento atomico già protetto dal Lotto C.

Restano inoltre da affrontare:
- yogurt Müller/aromatizzato quando/solo se saranno presenti nel catalogo;
- salsa di soia con unità esplicita cucchiaino/ml;
- stato soft `da limitare`;
- requisiti integrale/frutta/olio negli altri percorsi;
- Set utente.

## 15. Prossimo lotto

Il passo successivo è **Lotto E — Set utente**:
- Set derivato dai limiti nutrizionista;
- range/disabilitazioni coerenti;
- cap utente come restringimento;
- stato carboidrati AUTO / 0 / FISSO persistente;
- nessun bypass clinico.
