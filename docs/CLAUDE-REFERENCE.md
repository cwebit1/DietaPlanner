# DietaPlanner — Riferimento tecnico interno (uso Claude)

> Consultare questo file PRIMA di ogni modifica, insieme a `AGENTS.md` e
> `docs/REGOLE_FLUSSO_LOGICO.md` (quest'ultimo è la fonte delle regole
> funzionali/di business — QUESTO file è la mappa tecnica del codice).
> Aggiornare questo file quando una modifica cambia struttura, versioni o
> funzioni descritte qui sotto.
>
> **Prima di lavorare su qualunque bug del motore di generazione, leggere
> anche `docs/AUDIT-STATO-LAVORO.md`** (indice) e i due report collegati
> `docs/AUDIT-ANOMALIE-UTENTE.md` / `docs/AUDIT-STRUTTURA-LOGICA.md`: è un
> audit completo (comportamento reale osservato + causa radice nel codice,
> riga per riga) già svolto su gran parte del motore — evita di riscoprire
> da zero problemi già isolati, e contiene per ognuno le cautele precise
> per non rompere altro in fase di correzione.

Ultimo aggiornamento riferimento: 2026-08-23, sulla base di HEAD
`4741ccf` (repo `cwebit1/DietaPlanner`).

## 1. File del repo e ruolo

| File | Ruolo |
|---|---|
| `index.html` (~9425 righe, ~528K) | App intera: markup + CSS + un unico `<script>` (righe 976–9356) con tutta la logica UI, IndexedDB, rendering. Carica `engine-core.js` ed `motor.js` in coda (righe 9421-9422) con query `?v=84` per cache-busting. |
| `engine-core.js` | Libreria pura "motore di regole" (no DOM, no IndexedDB). Esporta `window.DietaPlannerEngine` (alias `E` in motor.js). Contiene i DEFAULTS di configurazione, algoritmi di scelta (proteine, carboidrati, verdure, ricette), grid builder, algebra di copertura (P/C/V). |
| `motor.js` (v79, commento in testa può essere disallineato dal vero numero: vedi §2) | Livello "applicativo" del motore: legge/scrive IndexedDB (tramite `getOne/getAll/put` definiti in index.html), applica le regole di `engine-core.js` al contesto reale (ricette.json importate in DB, preferenze utente, storico). Espone funzioni globali (`generaPianoSettimana`, `componiPastoModulare`, ecc.) usate da index.html. |
| `ricette.json` | `{versione, ricette:[...]}`. Attualmente versione 11, 326 ricette. Schema ricetta: `nome, fascia, porzioni, gruppoProteico, tipoPortata, ingredienti:[[nome,quantità],...], procedimento:[...], copertura ("PC/PP/PF/PU/PL"+"C"+"V"), richiedeCottura, soloManuale, allergeniPresenti, piattoSpeciale, (eventuali: sottoCategoriaModulare, carboidratiCompatibili, esclusa)`. |
| `ingredienti.json` | `{versione, ingredienti:[...]}` — libreria ingredienti base (gruppo, allergeni, categoria/deperibilità per la logica "tier" verdure, ecc.). |
| `manifest.json`, `sw.js`, `icon-*.png` | PWA standard (installabilità, service worker cache). |
| `docs/REGOLE_FLUSSO_LOGICO.md` | **Fonte di verità funzionale.** Regole di business, decisioni vincolanti, specifiche UI. Da rileggere per intero nelle sezioni pertinenti prima di ogni intervento (obbligo già scritto in `AGENTS.md`). |
| `docs/REQUIREMENTS-MATRIX.md`, `docs/PIANO_RICOSTRUZIONE.md`, `docs/CONFORMANCE-REPORT-V7x.md` | Storico di verifiche di conformità per versione — utili per capire cosa è stato validato, non regole vive. |
| `tests/*.js` | `engine-core.test.js`, `data.test.js`, `conformance.test.js`, `ui-contract.test.js`, `browser-smoke.js`. Test Node su `engine-core.js` e sui dati JSON; utile eseguirli dopo modifiche al motore. |
| `tools/enrich-data.js`, `tools/rebuild-recipes-v78.js` | Script di manutenzione dati (arricchimento/ricostruzione ricette), non parte del runtime app. |
| `AGENTS.md` | Regole operative vincolanti per chi (AI o umano) modifica il progetto. Leggere sempre. |

## 2. Versioni — attenzione ai disallineamenti

- `motor.js` riga 1 dice `v79` nel commento, ma `MOTORE_REGOLE.versione` in
  fondo al file dice `'79'` mentre `index.html` carica `motor.js?v=84` e
  `engine-core.js?v=84`: il numero `?v=84` è **solo cache-busting**, non
  corrisponde necessariamente al numero logico "v79" nei commenti interni.
  Non fidarsi dei commenti di versione nel codice: verificare sempre con
  `git log` cosa è stato effettivamente cambiato di recente.
- `motor.js` contiene **funzioni ridefinite due volte nello stesso file**
  (es. `componiPastoModulare`, `generaPortateMotore`,
  `motoreV10CompletaDraftPerRealizzazione`): essendo `function` declarations
  nello stesso scope, **vince l'ultima definizione nel file** (quella verso
  la fine, dopo il commento "v78 — algebra deterministica di copertura").
  La prima definizione di queste funzioni è morta/non raggiungibile — non
  modificarla pensando che sia quella attiva.
- `ricette.json` ha un campo `versione` proprio (attualmente 11) usato per
  la logica di aggiornamento automatico dati in index.html (vedi
  `versioneRemota`/`versioneLocale` intorno alla riga 1714-1748).

## 3. Architettura logica del motore (pipeline "algebra di copertura")

Il motore NON compone più i pasti sommando "primo fisso + secondo fisso +
contorno fisso" per nome. Dalla v78 (vedi REGOLE_FLUSSO_LOGICO §22-24) usa
un'**algebra di copertura**:

1. Ogni ricetta dichiara cosa "copre" tramite il campo `copertura`
   (stringa/array di token tra `PC,PP,PF,PU,PL` = proteina per macro,
   `C` = carboidrato, `V` = verdura). Se il campo manca, `engine-core.js →
   coverageForRecipe()` lo deduce dagli ingredienti (euristiche su nomi tipo
   pasta/riso/patate per C, pomodoro/zucchine/insalata per V).
2. Per ogni pasto serve coprire `{proteina del macro assegnato, C, V}`
   (`requiredCoverage()`).
3. `completaRealizzazioniCopertura()` (motor.js) parte da un set di
   "realizzazioni" (ricette scelte) e aggiunge ricette finché tutti i token
   richiesti sono coperti: prima la proteina (se manca), poi il
   carboidrato, poi la verdura — ognuna scelta tramite pool filtrati da
   `ricetteAmmesse()` (esclude allergeni/bloccati/profilo dieta) +
   `applicaTettiIngredienti()` (rispetta tetti settimanali per ingrediente)
   + `E.chooseRecipe()` (sceglie tra i candidati, con priorità a
   inventario in scadenza/avanzi, poi meno usati/meno recenti).
4. Il risultato di un pasto è quindi un **array `realizzazioni`**
   (`{ricettaId, copertura:[...]}`) non più un secondo/primo/contorno
   ipotizzati per nome. I campi legacy `primoId/secondoId/contornoId` nel
   piano vengono comunque popolati per compatibilità con la UI (assegnando
   il ruolo in base a quale token copre ciascuna ricetta scelta).

Punto di ingresso principale generazione settimanale:
`generaPianoSettimana(scarto, opzioni)` → per ogni giorno futuro
(`E.automaticDayAllowed`) e ogni pasto pranzo/cena non bloccato/consumato,
chiama `generaPortateMotore()` → `scegliSottotipoMotore()` (sceglie il
sottotipo proteico, es. carne_bianca, nel rispetto di caps e rotazione) →
`componiPastoModulare()` → `completaRealizzazioniCopertura()`. Gestisce
anche la colazione (via funzioni `scegliColazioneAutomaticaCoerente`,
`componentiColazioneDaSet`, definite in index.html, chiamate con
`typeof === 'function'` guard perché motor.js non le conosce a priori).

`engine-core.js` è deliberatamente puro e testabile (vedi
`tests/engine-core.test.js`) — ogni nuova regola "matematica" (frequenze,
caps, scelta più-vecchio-meno-usato, algebra di copertura) va aggiunta lì
se non dipende da IndexedDB/DOM; la parte che tocca IndexedDB/preferenze
utente va in `motor.js`.

## 4. Struttura IndexedDB (definita in index.html, righe ~980-996)

DB aperto con `indexedDB.open(DB_NAME, DB_VERSION)`. Object stores
(keyPath):
- `ingredienti` (id) — libreria base ingredienti (import da ingredienti.json)
- `varianti` (id) — varianti/formati concreti di un ingrediente base
  (`ingredienteId` → FK verso `ingredienti`)
- `inventario` (id) — giacenze per variante (`variantId`, quantità, stato,
  scadenza, zona freezer/dispensa, avanzoScomodo)
- `ricette` (id) — import da ricette.json, più eventuali ricette utente
- `piano` (id = `GIORNO_pasto`, es. `2026-08-24_pranzo`, o `_colazione`) —
  piano settimanale effettivo, sia generato dal motore che manuale
- `impostazioni` (chiave) — key/value generico: qui vivono tutte le
  preferenze (tabellaGiornoCategoria, setProteineLimitate, setPocoTempo,
  setVerdurePreferite, verdureDisattivate, configAvanzata, allergeniAttivi,
  ingredientiBloccati, tettiIngredienteSettimanali,
  vincoliIngredientiNutrizionista, configCarboidrati, colazionePreferita,
  colazionePreferitaGiorni, cerealiNonGraditi, verduraRicorrente*, ecc.)
- `consumoGiorno` (id) — storico di cosa è stato effettivamente consumato,
  usato per rotazione (`ultimoRicetta`, `ultimoCarb`, `ultimoVerdura`,
  `sottotipiTotali`, `ultimoCategoriaProteica`)
- `spesa` (id) — lista della spesa derivata dai deficit inventario
  (`E.shoppingDeficits`)

Funzioni di accesso generiche `getOne(store, key)`, `getAll(store)`,
`put(store, obj)` sono definite in index.html e usate sia dallo script
principale che da motor.js (motor.js le chiama come globali, assumendo che
index.html sia già caricato — motor.js NON è indipendente, va sempre usato
dentro index.html).

## 5. Viste UI (in index.html)

`mostraVista(nome)` (riga ~3484) mostra/nasconde `section.view` per id
`view-<nome>` e attiva il tab corrispondente. Viste esistenti:
`piano, menu, ricette, spesa, inventario, set, impostazioni, nutrizionista`.
Ogni vista ha una o più funzioni `render*` chiamate al cambio vista
(es. `renderPiano`, `renderMenuSettimanale`, `renderRicette`,
`renderInventario`, `renderSet` + helper set (`renderCaselleCarboidrati`,
`aggiornaStatoConfigCarb`, `renderSetTabellaGiorno`,
`renderSetPreferenzeMenu`), `renderInfoVersioniRemote`,
`renderConfigAvanzata`). ~245 funzioni definite in totale in index.html:
prima di aggiungere una funzione, cercare se esiste già un helper simile
(rischio di duplicati/nomi quasi uguali, vedi §2 per motor.js).

## 6. Workflow operativo per ogni modifica (da AGENTS.md + prassi osservata)

1. Rileggere le sezioni pertinenti di `docs/REGOLE_FLUSSO_LOGICO.md` (regole
   funzionali) e questo file (mappa tecnica) per l'area toccata.
2. Individuare con `grep`/`view` la funzione/sezione esatta in index.html,
   motor.js o engine-core.js — mai riscrivere "a memoria" senza aver
   riletto il codice attuale (in particolare per motor.js, verificare quale
   definizione tra i duplicati è quella attiva, vedi §2).
3. Applicare SOLO la modifica richiesta, senza toccare dati/valori
   predefiniti/logiche adiacenti non autorizzati.
4. Validare la sintassi JS (`node --check` sul file, o node su
   `tests/engine-core.test.js` / `data.test.js` se si tocca il motore).
5. Controllare diff (`git diff`) prima di pubblicare.
6. Push: **l'ambiente bash di Claude ha l'accesso all'API GitHub
   bloccato** (`host_not_allowed`, verificato in sessioni precedenti) — il
   push va probabilmente fatto manualmente da Cwe via interfaccia web
   GitHub, salvo verifica aggiornata caso per caso.
7. Aggiornare `?v=NN` nei tag `<script>` di index.html quando si modifica
   motor.js/engine-core.js, per invalidare la cache browser (prassi già
   vista nello storico commit, es. bump a v84).

## 7. Cose da NON dare per scontate (errori tipici da evitare)

- Non assumere che "motor.js v79" nel commento sia la versione vera in
  produzione: controllare `?v=NN` in index.html e `git log`.
- Non modificare la prima definizione di una funzione duplicata in motor.js
  senza controllare se è quella "morta".
- I tocchi UI/estetici non diventano vincoli funzionali (regola esplicita
  in REGOLE_FLUSSO_LOGICO §"REGOLA OPERATIVA VINCOLANTE").
- Le interventi tire/tipo-cella in altri progetti (VehicleCare Pro) NON
  c'entrano con DietaPlanner — repo e domini separati.
