# DietaPlanner — Lotto B: resolver nutrizionale centrale

**Data:** 2026-08-29  
**Modulo:** `nutrition-config.js`  
**Baseline:** `docs/BASELINE_NUTRIZIONISTA_PDF_V1.md` V1.2  
**Audit di partenza:** `docs/AUDIT_NUTRIZIONISTA_LOTTO_A.md`

## 1. Scopo del Lotto B

Creare e testare una sola funzione pura di risoluzione dei vincoli, senza collegarla ancora alla UI o al motore di produzione.

Punti baseline coperti in questo lotto:
- **1**: sorgente unica di configurazione risolta;
- **2**: separazione metadati PDF / default APP / configurazione;
- **39**: precedenza Nutrizionista/User nei limiti ingrediente;
- **44**: test automatici del resolver;
- **51-52**: semantica hard dello zero carboidrati e divieto di fallback;
- **53-54**: funzione pura per copertura/residuo quantitativo della verdura;
- **55-60**: semantica AUTO / ESCLUSO / FISSO e schema base dei 14 carboidrati.

Questo lotto **non cambia ancora il comportamento visibile dell'app**.

## 2. File aggiunti

- `nutrition-config.js`
- `tests/nutrition-config.test.js`

File applicativi non modificati nel Lotto B:
- `index.html`
- `motor.js`
- `engine-core.js`
- `ingredienti.json`
- `ricette.json`

## 3. Contratto del resolver

API principale:

```js
resolveNutritionConfig({
  nutritionist: {
    config,
    ingredientConstraints,
    allergens,
    blockedIngredientIds
  },
  user: {
    carbohydrates,
    ingredientWeeklyCaps
  }
})
```

Output principale:

```js
{
  version,
  valid,
  errors,
  warnings,
  profile,
  proteinFrequencies,
  subtypeCaps,
  ingredientConstraints,
  carbohydrates,
  fruit,
  vegetables,
  maxProteinSourcesPerDay,
  specialBreakfastMax,
  specialMealsMax,
  snackWeeklyCaps,
  snackDailyCaps,
  oilGramsPerMeal,
  cooldownDays,
  deadlines,
  safety
}
```

Il resolver è puro: non legge IndexedDB, non modifica ricette e non muta gli oggetti ricevuti.

## 4. Gerarchia applicata

### 4.1 PDF

`PDF_BASELINE` contiene i limiti nutrizionali verificati:
- frequenze proteiche;
- sottotipi;
- carboidrati 0-2;
- frutta;
- porzioni verdura/insalata;
- colazioni speciali;
- spuntini;
- olio.

### 4.2 APP

`APP_DEFAULTS` contiene soltanto regole applicative:
- target interni;
- 14 slot carboidrato;
- massimo celle per tipo;
- tetto cumulativo carboidrati limitati = 3, finché non viene revocato esplicitamente;
- cooldown;
- deadline;
- pasti speciali;
- altri default tecnici.

### 4.3 Nutrizionista e utente

- il nutrizionista può restringere il PDF, non allargarlo;
- esclusione clinica vince sempre;
- massimo ingrediente effettivo = minimo tra clinico e utente;
- il cap utente non può scendere sotto un minimo clinico: la configurazione viene dichiarata non valida;
- profilo vegetariano/vegano produce esclusioni strutturali, **non nuove frequenze arbitrarie**.

## 5. Carboidrati — modello canonico

Per ogni tipo esistono tre stati:

### AUTO
Non è stato imposto un numero dall'utente.

- se il carboidrato **non ha tetto settimanale PDF**, può entrare nel riempimento automatico;
- se ha tetto 0-2, non viene mai inserito autonomamente.

### EXCLUDED
Zero esplicito dell'utente.

- esclusione hard dall'automatico;
- nessun fallback può riattivarlo.

### FIXED
Numero positivo esplicito.

- è un conteggio settimanale esatto;
- il resolver conserva esattamente quel numero;
- per una voce 0-2, il numero non può superare 2;
- il totale delle voci limitate continua a rispettare il tetto APP-CWE 3 finché resta vigente.

### Esempio normativo

`Friselle = 2`:

- `fixedCounts.friselle = 2`;
- `remainingSlots = 12`;
- le 12 posizioni mancanti possono essere riempite soltanto con voci AUTO senza tetto;
- natura e disposizione sono marcate per randomizzazione nel Lotto motore.

## 6. Compatibilità con i dati legacy

Il vecchio `configCarboidrati` memorizza `0` anche quando una voce non è mai stata configurata.

Per non trasformare retroattivamente tutti gli zeri legacy in esclusioni:
- `0` senza un marcatore esplicito viene interpretato come **AUTO**;
- lo zero hard richiede `explicitZeroKeys` oppure il nuovo stato canonico `excluded`.

Il Lotto E dovrà rendere questa distinzione persistente nella UI/IndexedDB.

## 7. Verdura — copertura quantitativa pura

Funzione:

`vegetableCoverage(entries, portionConfig)`

Ogni componente fornisce:
- `quantity`;
- `kind: 'vegetable' | 'salad'`.

La funzione converte ogni quantità in frazione di porzione e somma le frazioni.

Esempi:
- 80 g di zucchine su target 200 g → copertura 0,4 → residuo ortaggi 120 g;
- 100 g ortaggi + 35 g insalata → 0,5 + 0,5 = porzione completa → residuo 0.

Il resolver **non identifica la verdura dal nome**. Il Lotto motore dovrà fornire metadati strutturati.

## 8. Validazioni protettive

Il resolver segnala o normalizza:
- valori nutrizionista oltre i limiti PDF;
- min/max incoerenti;
- carboidrati fissi oltre tetto PDF;
- totale limitati oltre tetto APP-CWE;
- oltre 14 slot fissi;
- nessuna voce AUTO disponibile per completare gli slot;
- tetto utente sotto un minimo clinico.

Quando una configurazione è impossibile:
- `valid = false`;
- `errors` contiene la causa;
- il motore futuro non dovrà inventare fallback contrari ai vincoli.

## 9. Test

`tests/nutrition-config.test.js` copre:
- default PDF;
- 14 slot AUTO senza limitati;
- Friselle=2 → 12 residui;
- zero esplicito hard;
- compatibilità zero legacy;
- tetto 0-2;
- tetto cumulativo APP-CWE;
- configurazione impossibile;
- profilo vegetariano senza override frequenze;
- clamp dei valori oltre PDF;
- combinazione cap clinico/utente;
- conflitto cap utente vs minimo clinico;
- residuo verdura;
- combinazione ortaggi + insalata;
- allergeni/blocchi deduplicati;
- limiti frutta.

Smoke del resolver eseguito dopo il commit: **PASS**.

## 10. Vincolo per il Lotto C

Il Lotto C deve:
1. importare/usare `nutrition-config.js`;
2. fare consumare a `motor.js` ed `engine-core.js` la **stessa configurazione risolta**;
3. non ricreare un secondo resolver;
4. rimuovere hardcode soltanto quando il test equivalente è già presente;
5. correggere i fallback che violano cap/zero;
6. non modificare ancora la UI o i cataloghi.

La randomizzazione reale dei 14 carboidrati e il residuo verdura diventano comportamento di produzione soltanto quando il Lotto C/G li collega al motore.
