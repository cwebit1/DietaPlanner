# Registro modifiche

**Stato:** log permanente e sequenziale di tutti i rapporti di modifica al
repository, di qualunque area o file. Ogni intervento aggiunge una nuova
sezione datata in fondo al file, mai riscrivendo o cancellando le
precedenti. Fonte di riferimento per qualunque sessione (umana o AI) che
riprenda un lavoro già iniziato: leggere le sezioni pertinenti prima di
continuare, invece di ricostruire la cronologia da `git log`.

Ogni sezione riporta almeno: commit coinvolto, cosa è stato chiesto, cosa
è stato trovato, cosa è stato deciso/implementato, file modificati, esito
dei controlli, eventuali problemi adiacenti annotati ma non toccati.

Le sezioni sono raggruppate per filone di lavoro quando più interventi
consecutivi riguardano lo stesso argomento (es. tutte le modifiche a
`configCarboidrati*` restano vicine); un nuovo filone apre semplicemente
una nuova intestazione di primo livello in fondo al file.

---

## 12. Prototipo grafico Menù settimanale esteso — 8 settembre 2026

**Obiettivo richiesto da Cwe:** trasformare la pagina Menù nel quadro esteso e
curato dell'intero piano nutrizionale settimanale.

**Intervento effettuato:** aggiunta al solo prototipo una nuova vista Menù
navigabile dalla bottom bar. La pagina comprende testata e navigazione della
settimana, riepilogo del piano, sette giornate complete e sempre aperte,
Colazione, Pranzo e Cena, distinzione tra primo/secondo/contorno, un lucchetto
grafico per realizzazione e la barra dei comandi prevista dalla pagina
originale. Inseriti metadata espliciti per il futuro collegamento ai record
settimanali prodotti dal motore.

**Separazione confermata:** `index.html`, motore, database e IndexedDB non sono
stati modificati. I pasti visualizzati sono contenuti dimostrativi del mockup e
non introducono regole nutrizionali.

**Verifiche:** `git diff --check` pulito; parsing dello script inline con Node.js
riuscito; sette giornate renderizzate nel dataset; `index.html` invariato. Il
controllo automatico tramite browser headless non è stato eseguito perché il
runtime grafico Chromium non è installato nell'ambiente.

**File modificati:** `restyling-preview.html`, `docs/REGISTRO_MODIFICHE.md`.

**SHA dell'intervento grafico:** `76db7899c8aa903f870f9781fc66c65d1ab1a166`.

---

## 11. Rifinitura card pasti — 8 settembre 2026

**Correzioni richieste da Cwe:** portare a 10 px il margine inferiore del
carosello speciale e rimuovere i chevron di espansione dalle intestazioni dei
pasti, perché le card non useranno quel controllo.

**Intervento effettuato:** il margine inferiore delle immagini speciali è stato
impostato a 10 px. I chevron sono stati rimossi da Colazione, Pranzo e Cena e la
griglia delle intestazioni è stata ricomposta senza la colonna che riservava
loro spazio.

**Separazione confermata:** modificato soltanto `restyling-preview.html`;
`index.html`, motore e database restano invariati.

**Verifiche:** `git diff --check` pulito; parsing dello script inline riuscito;
assenza dei chevron nel markup verificata.

**File modificato:** `restyling-preview.html`.

---

# Filone: Migrazione Set carboidrati (formato storico → stato canonico)

Riguarda: `configCarboidrati`, `configCarboidratiOrigini`,
`configCarboidratiStati`, `configCarboidratiExplicitZeroKeys` (store
`impostazioni`) e i punti che li leggono/scrivono in `index.html`,
`motor-v12.js`, `nutrition-config.js`.

## 1. Commit `67daf09` — prima divergenza trovata e corretta

**Obiettivo dell'incarico:** indagare e correggere eventuali
incompatibilità tra i record storici del Set carboidrati in IndexedDB e il
formato canonico attuale (AUTO/FIXED/EXCLUDED), senza presupporre il
problema ma dimostrandolo dalla cronologia Git.

**Formati storici realmente trovati:**
- **Formato corrente**: `configCarboidratiStati` = `{chiave:{mode,count}}`
  completo per tutte le chiavi (introdotto in `2d4537b`). Nessuna
  incompatibilità.
- **Formato storico più vecchio** (pre-`2d4537b`): solo `configCarboidrati`
  (conteggio totale per chiave) + `configCarboidratiOrigini` (array
  `'utente'`/`'sistema'` per indice). Il vecchio pulsante Salva completava
  **sempre** il totale a 14 caselle prima di scrivere, mescolando conteggi
  scelti dall'utente con caselle aggiunte dal completamento automatico
  ("Completa e fissa"/"Casuale").

**Bug dimostrato:** `motor-v12.js:selezioneCarboidratiPersistita`
interpretava un conteggio storico misto (es. riso: 4, origini
`['utente','utente','sistema','sistema']`) come FIXED 4, mentre
l'interfaccia Set (`index.html:caricaConfigCarboidrati`, commit `b49f721`)
interpretava correttamente FIXED 2 (solo le caselle realmente scelte
dall'utente). Un utente vedeva nel Set un conteggio corretto ma la
generazione reale ne applicava uno sbagliato.

**Causa:** due implementazioni duplicate e divergenti della stessa
migrazione (violazione di AGENTS.md — resolver canonico unico).

**Correzione:** nuova funzione condivisa
`nutrition-config.js:legacyCarbohydrateUserCounts(rawCounts, origins)`,
usata sia da `index.html` sia da `motor-v12.js:selezioneCarboidratiPersistita`
(contratto di ritorno invariato per non rompere `tests/lotto-h-stress-migrations.test.js`,
che pinnava il vecchio comportamento su un input sintetico).

**Test:** nuovo `tests/lotto-migrazione-set-storico.test.js` — fallisce sul
commit precedente (`4 !== 2`), passa dopo la correzione. Suite esistente
verde, incluso il test pinnato.

**File modificati:** `nutrition-config.js`, `motor-v12.js`,
`index.html`, `tests/lotto-migrazione-set-storico.test.js` (nuovo).

---

## 2. Commit `d6a503e` — affidabilità delle origini legacy e descrizione corretta

**Problema riscontrato (segnalato da Cwe):**
- **Problema A**: `legacyCarbohydrateUserCounts` considerava un array
  origini incompleto (es. lunghezza 1 contro conteggio 4) come prova
  sufficiente per dedurre un conteggio parziale, rischiando di perdere un
  conteggio storico positivo quando il dato non è determinabile con
  certezza.
- **Problema B**: la funzione e il test descrivevano il meccanismo come
  "migrazione persistente"/"salvataggio e ricaricamento", mentre in realtà
  non scriveva nulla — era una normalizzazione eseguita a ogni lettura.

**Comportamento implementato:** un array origini è affidabile **solo**
quando è un vero array, ha *esattamente* la stessa lunghezza del
conteggio grezzo, ed ogni elemento è *esattamente* `'utente'` o
`'sistema'`. Solo allora si contano le sole caselle `'utente'` (zero
utente ⇒ AUTO). In ogni altro caso (assente, più corto, più lungo, valori
sconosciuti) il conteggio grezzo positivo resta **interamente FIXED**
(mai perso), zero resta AUTO. Precedenza confermata invariata:
`configCarboidratiStati` → `explicitZeroKeys` → normalizzazione legacy.
Nessuna scrittura durante la lettura.

**File modificati:** `nutrition-config.js`, `motor-v12.js` (solo commento
collegato), `tests/lotto-migrazione-set-storico.test.js` (corretta la
sezione mal descritta come "salvataggio e ricaricamento"; aggiunti gli 8
casi richiesti su affidabilità delle origini, zero esplicito, precedenza
di `configCarboidratiStati`, stabilità su letture ripetute). Nessun nuovo
file di test.

**Controlli:** `node tests/lotto-migrazione-set-storico.test.js`,
`node tests/nutrition-config.test.js`, `node --check nutrition-config.js`,
`node --check motor-v12.js`, `git diff --check` — tutti OK.

**Conferma:** nessuna scrittura automatica introdotta — verificato sia per
lettura del codice (`nutrition-config.js`/`motor-v12.js` non toccano
`put`/IndexedDB in queste funzioni) sia con un'asserzione dedicata nel
test (nessuna nuova chiave in `impostazioni`, `configCarboidratiStati`
resta assente dopo la lettura del formato legacy).

---

## 3. Commit `c001fe2` — eliminazione del doppio percorso (migrazione persistente unica)

**Problema riscontrato (segnalato da Cwe):** la correzione precedente
risolveva il caso immediato ma manteneva il sistema ibrido — i record
legacy restavano la sorgente, reinterpretati a ogni lettura sia dal Set
sia dal motore, senza mai creare definitivamente lo stato canonico.
Principio architetturale richiesto: *"La compatibilità storica esiste
soltanto nel punto unico di migrazione. Dopo una migrazione riuscita,
l'applicazione lavora esclusivamente sullo schema corrente."*

**Punti che leggevano le chiavi legacy (individuati prima di modificare):**
- `motor-v12.js:caricaConfigurazioneNutrizionaleRisolta` — leggeva tutte e
  4 le chiavi a ogni risoluzione della configurazione, via
  `selezioneCarboidratiPersistita`.
- `index.html:caricaConfigCarboidrati` — leggeva tutte e 4 le chiavi a ogni
  apertura del Set, via `legacyCarbohydrateUserCounts` +
  `normalizeCarbohydrateSelection`.
- `index.html:getConfigCarboidratiCaselle` — legge ancora `configCarboidrati`
  grezzo, ma è codice morto (nessun chiamante, il compositore legacy che lo
  usava è spento): non fa parte del funzionamento ordinario, non toccato,
  solo annotato nel rapporto finale.
- `nutrition-config.js:resolveNutritionConfig` — ha un fallback di default
  che referenzia le chiavi legacy come forma d'input generica del
  resolver; non è un lettore IndexedDB e non viene più esercitato da
  nessun chiamante reale dopo questa modifica; lasciato invariato
  (contratto pubblico generico della funzione, non specifico a questo bug).

**Punto unico di migrazione scelto:**
`motor-v12.js:migraStatoCarboidratiCanonicoSeNecessario()`, richiamata una
sola volta da `inizializza()` (il bootstrap dell'app, chiamato
esplicitamente prima di `caricaConfigCarboidrati()` all'avvio in
`index.html`), prima che qualunque altra lettura risolva la
configurazione.

**Comportamento:**
1. Se `configCarboidratiStati` esiste già (anche `{}` esplicito), non fa
   nulla — nessuna rilettura dei legacy, nessuna riscrittura (idempotente).
2. Se non esiste, legge una sola volta i record legacy, li converte con
   `legacyCarbohydrateUserCounts` + `normalizeCarbohydrateSelection`
   (garantendo copertura dell'intero elenco canonico dei carboidrati,
   anche tutto AUTO su database vuoto), e scrive `configCarboidratiStati`
   in un'unica `put` atomica.
3. Se la scrittura fallisce, l'eccezione risale esplicita al chiamante:
   nessuno stato canonico parziale, nessuna migrazione dichiarata
   completata a torto, i record legacy restano intatti per un tentativo
   successivo.

**Lettura ordinaria resa canonica:**
`caricaConfigurazioneNutrizionaleRisolta` e `caricaConfigCarboidrati`
leggono ora **esclusivamente** `configCarboidratiStati`.
`selezioneCarboidratiPersistita` resta invariata ma non è più richiamata
dal percorso ordinario: sopravvive solo per il punto di migrazione stesso
e come utility per chi vuole interrogare un record legacy isolato (usata
anche da `tests/lotto-h-stress-migrations.test.js`, non toccato).

**Scrittura del Set (invariata):** `salvaConfigCarboidratiSet` scriveva
già sempre `configCarboidratiStati` completo indipendentemente dai legacy
— nessuna modifica necessaria lì.

**Test:** `tests/lotto-migrazione-set-storico.test.js` riscritto (stessa
suite, nessun nuovo file) sui 12 casi richiesti: database vuoto → tutto
AUTO; canonico esistente → non toccato né esteso, anche con legacy
contraddittorio presente; origini miste → FIXED utente corretto; origini
assenti/incoerenti → conteggio preservato per intero come FIXED; zero
esplicito → EXCLUDED; zero implicito → AUTO; scrittura effettiva
verificata; doppia inizializzazione → stato identico; seconda
inizializzazione → zero scritture (contate con uno spy su `put`); Set e
motore leggono lo stesso stato canonico (confrontati direttamente);
impostazioni estranee/`piano`/`consumoGiorno` intatti; fallimento
simulato in scrittura → nessuno stato parziale, legacy intatti. Nessuna
settimana generata, nessun retry casuale.

**File modificati:** `motor-v12.js`, `index.html`,
`tests/lotto-migrazione-set-storico.test.js`.

**Controlli:** `node tests/lotto-migrazione-set-storico.test.js`,
`node tests/nutrition-config.test.js`, `node tests/lotto-e-root-user-set.test.js`,
`node --check nutrition-config.js`, `node --check motor-v12.js`,
`git diff --check` — tutti OK.

**Non toccato in questo commit (per istruzione esplicita, annotato qui):**
- `getConfigCarboidratiCaselle`/`scegliCarboidratoModulare` in
  `index.html`: codice morto che legge ancora `configCarboidrati` grezzo,
  irraggiungibile da nessun chiamante attivo. Se mai riattivato andrebbe
  fatto passare dal resolver canonico.
---

## 4. Commit `2ca7c8a` — completamento: eliminazione definitiva del sistema ibrido

**SHA iniziale:** `8563d70` (main).

**Obiettivo dell'incarico:** completare la rimozione del sistema ibrido
eliminando dal funzionamento corrente le scritture legacy ancora
effettuate dal Set, i lettori/API legacy morti rimasti esportati, e
l'accettazione senza validazione di uno stato canonico presente ma
incompleto o malformato. Al termine, una sola verità funzionale:
`configCarboidratiStati`.

**Residui trovati (confermati con ricerca globale prima di modificare):**
- **Residuo A**: `index.html:salvaConfigCarboidratiSet` continuava a
  scrivere `configCarboidrati`/`configCarboidratiOrigini`/
  `configCarboidratiExplicitZeroKeys` oltre a `configCarboidratiStati`.
- **Residuo B**: `getConfigCarboidratiCaselle()` (legge ancora
  `configCarboidrati` grezzo) e il suo unico chiamante
  `scegliCarboidratoModulare()`/`scegliCarboidratoDaConfig()` — l'intera
  catena, senza chiamanti runtime (confermato con `grep` globale),
  esisteva solo per consumare il formato legacy. `motor-v12.js:selezioneCarboidratiPersistita`
  restava esportata ma non più richiamata dal punto unico di migrazione
  (che usa `legacyCarbohydrateUserCounts`+`normalizeCarbohydrateSelection`
  direttamente) né da alcun percorso ordinario: solo da 3 test diretti.
- **Residuo C**: la migrazione considerava concluso il lavoro alla sola
  *esistenza* di `configCarboidratiStati`, senza validarne la forma
  (mode sconosciuta, FIXED non numerico/zero/negativo/decimale, chiavi
  canoniche mancanti mai completate).

**Funzioni e scritture eliminate:**
- `index.html:salvaConfigCarboidratiSet` — rimosse le 3 scritture legacy;
  scrive esclusivamente `configCarboidratiStati`.
- `index.html:getConfigCarboidratiCaselle`, `scegliCarboidratoModulare`,
  `scegliCarboidratoDaConfig`, `contaCarboidratoSettimana` — rimosse per
  intero (catena morta, senza chiamanti runtime, esisteva solo per
  consumare il formato legacy). La costante `CARBOIDRATI_ROTAZIONE`,
  rimasta orfana come effetto collaterale (usata solo da
  `scegliCarboidratoModulare`), **non rimossa** (non è di per sé un
  lettore del formato legacy, solo un array di chiavi; annotata qui e
  non toccata per restare strettamente nel perimetro richiesto).
- `motor-v12.js:selezioneCarboidratiPersistita` — rimossa per intero (non
  usata dal punto unico di migrazione né da alcun percorso ordinario) e
  tolta dall'API esportata. I 3 test che la richiamavano direttamente
  (`lotto-h-stress-migrations.test.js`, `lotto-c-new-engine-integration.test.js`)
  sono stati aggiornati per verificare la stessa garanzia sostanziale
  tramite il punto unico di migrazione reale (il primo) o le funzioni pure
  `legacyCarbohydrateUserCounts`/`normalizeCarbohydrateSelection` (il
  secondo, che non usa IndexedDB), senza indebolire il requisito
  originale.

**Validazione canonica introdotta:** nuove `motor-v12.js:validaStatoCarboidratiCanonico`
(controllo strutturale puro) e logica aggiornata in
`migraStatoCarboidratiCanonicoSeNecessario`:
1. record assente → migrazione legacy (invariata).
2. record presente, tutte le voci valide, chiavi canoniche mancanti →
   completa solo le mancanti come AUTO, scarta proprietà estranee,
   un'unica scrittura; il legacy non viene letto.
3. record presente con una voce non valida (mode sconosciuta, FIXED non
   numerico/decimale/zero/negativo, valore non interpretabile) → **eccezione
   esplicita** che indica chiave e causa; nessuna scrittura, nessuna
   correzione silenziosa, nessuna rilettura del legacy come fallback.
4. record presente, completo e valido → nessuna scrittura.

**File modificati:** `motor-v12.js`, `index.html`,
`tests/lotto-migrazione-set-storico.test.js` (riscritto sui 9 casi
richiesti), `tests/lotto-h-stress-migrations.test.js`,
`tests/lotto-c-new-engine-integration.test.js`.

**Test eseguiti (controlli consentiti):**
```
node tests/lotto-migrazione-set-storico.test.js  → ok
node tests/nutrition-config.test.js               → ok
node tests/lotto-e-root-user-set.test.js          → ok
node tests/lotto-h-stress-migrations.test.js      → ok
node --check nutrition-config.js                  → OK
node --check motor-v12.js                         → OK
git diff --check                                  → pulito
```

**Verifica globale prima del push:** confermato con `grep` ricorsivo che
(a) nessun percorso runtime legge più i tre record legacy fuori dal corpo
di `migraStatoCarboidratiCanonicoSeNecessario`; (b) nessun salvataggio
corrente scrive più su di essi; (c) `configCarboidratiStati` è l'unica
verità letta sia da `caricaConfigurazioneNutrizionaleRisolta` (motore) sia
da `caricaConfigCarboidrati` (Set); (d) nessuna API esportata residua per
reinterpretare il formato storico (`selezioneCarboidratiPersistita`
rimossa; `legacyCarbohydrateUserCounts` resta esportata ma usata solo dal
punto di migrazione e dai test).

**Problemi adiacenti annotati, non toccati (fuori perimetro esplicito):**
- La costante `CARBOIDRATI_ROTAZIONE` in `index.html`, rimasta senza
  utilizzi dopo la rimozione di `scegliCarboidratoModulare` — non è un
  lettore del formato legacy carboidrati (solo un array di chiavi), quindi
  fuori dal perimetro di questo intervento.
- Ripreso da un rapporto precedente, ancora valido: l'ordine posizionale
  in `motor-v12.js:targetTabellaPerSlot` (primo elemento dell'array
  `giorno_N` = pranzo, secondo = cena) resta un'osservazione, non
  un'incompatibilità storica.

**SHA finale:** `2ca7c8aa711d9a5cfbc1dcb69431c7834aafd22e`.

---

# Filone: Quantità contestuali nutrizionista → realizzazione del pasto

Riguarda: `resolveNutritionConfig().ingredientConstraints[id].contexts`
(colazione/pastoPrincipale/spuntino, prodotto dal resolver) e i due punti
in `motor-v12.js` che determinano la quantità effettiva di un ingrediente
al momento della realizzazione.

## 1. Commit `a32aa55` — quantità contestuali fino alla realizzazione

**Obiettivo:** garantire che le quantità contestuali del nutrizionista
(es. Uova 1 pz colazione / 2 pz pasto principale; Ricotta 50 g colazione /
100 g pasto principale) arrivino fino alla realizzazione effettiva,
usando esclusivamente `resolveNutritionConfig()` come fonte di verità.

**Flusso reale ricostruito (due percorsi distinti, verificati separatamente):**
1. **Pasto principale (pranzo/cena)**: le ricette si compilano una sola
   volta in `motor-v12.js:inizializza` → `compilaRicetta` →
   `preparaIngredientiDettagliati` → `quantitaConfigurata`, cache
   persistita in IndexedDB (store `ricette`), invalidata solo da un
   cambio versione catalogo o dal pulsante "Applica e ricostruisci". Le
   ricette compilate qui non sono mai usate per la colazione.
2. **Colazione**: percorso separato. Il selettore colazione (in
   `index.html`, non toccato) legge `variante.porzioneColazione`, scritto
   da `motor-v12.js:sincronizzaIngredientiIndexedDB`.

**Difetto riprodotto (entrambi confermati con un test mirato, non ipotizzati):**
- `quantitaConfigurata(nome,meta)` leggeva **direttamente**
  `vincoliIngredientiNutrizionista` grezzo (bypassando il resolver),
  considerava solo la quantità generica (`v.quantita`), non riceveva
  alcun contesto e non consultava mai `ingredientConstraints[id].contexts`.
  Test: Uova nel pasto principale risultava `1` (il valore generico
  scorretto) invece di `2` (il valore contestuale corretto).
- `sincronizzaIngredientiIndexedDB` calcolava `variante.porzioneColazione`
  **solo** dal catalogo statico (`ingredienti-new.json:porzione`), senza
  mai consultare il resolver: nessuna quantità contestuale di colazione
  arrivava mai alla variante usata dal selettore.

**Correzione applicata (motor-v12.js soltanto, nessuna duplicazione delle
regole contestuali):**
- `quantitaConfigurata` ora legge esclusivamente `configRuntime()` (cache
  di sessione di `resolveNutritionConfig()`), con precedenza
  `contexts.pastoPrincipale.quantity` → `quantity` generico → porzione di
  catalogo. Contesto `'pastoPrincipale'` fisso e esplicito (identificatore
  canonico già usato dal resolver): le ricette compilate da questo punto
  non sono mai usate per la colazione, quindi non serve altro contesto qui.
- `sincronizzaIngredientiIndexedDB` calcola `porzioneColazione` con la
  stessa precedenza (`contexts.colazione.quantity` → porzione di
  catalogo), tramite una lettura diretta e non cache di
  `caricaConfigurazioneNutrizionaleRisolta()` (questa funzione gira
  **prima** della migrazione canonica dei carboidrati nella sequenza di
  `inizializza`: passare dalla cache di sessione qui la scriverebbe con
  uno snapshot pre-migrazione, restando stantia per tutta la sessione).
  L'idoneità alla colazione (quale ingrediente sia selezionabile) resta
  invariata, decisa solo dal catalogo (`sottoCategoriaColazione`): il
  contesto nutrizionista non inventa un'idoneità che il catalogo non
  definisce, cambia solo il valore quando l'ingrediente è già idoneo.

**Scoperta collaterale, annotata e non toccata (fuori perimetro esplicito,
"Non modificare... catalogo ingredienti"):** "Uova" e "Ricotta" — gli
esempi obbligatori dell'incarico — non sono attualmente selezionabili in
colazione nel catalogo operativo: nessuna `sottoCategoriaColazione` di
primo livello per loro in `ingredienti-new.json`. "Uova" ha un campo
`ancheColazione` con nota testuale "doppia gestione: stesso ingrediente,
due contesti con frequenze diverse", ma questo campo non è consumato da
nessun codice (né prima né dopo questa correzione) — è un dato dormiente.
Di conseguenza il test verifica la correzione del **meccanismo** per la
colazione con un ingrediente realmente idoneo nel catalogo attuale
("Latte parzialmente scremato"), e verifica esplicitamente che Uova/
Ricotta restano con `porzioneColazione:null` (comportamento corretto e
invariato, dato che il catalogo non li rende idonei) invece di forzare
un'idoneità inventata. Sistemare l'idoneità di Uova/Ricotta in colazione
richiederebbe una modifica al catalogo ingredienti, esplicitamente esclusa
da questo incarico: segnalato qui per una decisione separata di Cwe.

**File modificati:** `motor-v12.js`,
`tests/lotto-d-contestuali-realizzazione.test.js` (nuovo).

**Test eseguiti (controlli consentiti):**
```
node tests/lotto-d-contestuali-realizzazione.test.js  → ok (fallisce su 1≠2 senza la correzione, verificato)
node tests/nutrition-config.test.js                    → ok
node tests/lotto-d-root-nutritionist-setting.test.js   → ok
node --check nutrition-config.js                       → OK
node --check motor-v12.js                               → OK
git diff --check                                        → pulito
```

**Non modificati:** `nutrition-config.js` (fonte di verità invariata),
database ricette, catalogo ingredienti, limiti settimanali, migrazioni
IndexedDB, UI, logica carboidrati; rappresentazione pz/g non affrontata.

**SHA finale:** `a32aa554651a47708c30c738cb9fa784caaab28e`.

---

## 2. Commit `0605373` — chiusura del flusso colazione per Uova e Ricotta

**Obiettivo:** eliminare ogni sistema parallelo/hardcoded e chiudere il
flusso contestuale a colazione per Uova (1 pz) e Ricotta (50 g), un solo
ingrediente per contesto, tutte le quantità da `resolveNutritionConfig()`.

**Due scritture precedenti individuate (ordine reale ricostruito):**
1. `motor-v12.js:sincronizzaIngredientiIndexedDB` (fonte autorevole,
   corretta nella sezione 1 di questo filone per il *valore* contestuale,
   ma leggeva l'idoneità solo da `sottoCategoriaColazione` di primo
   livello — mai da `ancheColazione` — quindi Uova/Ricotta restavano non
   idonee).
2. `index.html:seedIfEmpty` → blocco `TAG_COLAZIONE` (porzioni hardcoded,
   incluso `uova: 120g` — incompatibile con la quantità contestuale in
   pezzi) + patch che escludeva esplicitamente `ricotta` dalla colazione
   (contraddiceva la regola PDF già presente nel resolver:
   `docs/BASELINE_NUTRIZIONISTA_PDF_V1.md` conferma "ricotta: 50-60 g" a
   colazione, nessun documento la esclude — verificato prima di
   modificare, nessuna decisione realmente incompatibile trovata).
   **Verificato con ricerca globale: `seedIfEmpty()` non ha alcun
   chiamante nell'app** — questa seconda scrittura non era in realtà mai
   eseguita a runtime, ma restava un percorso morto potenzialmente
   riattivabile ("una seconda architettura", stesso principio già
   applicato ad altri residui in questo registro).

**Fonte eliminata:** il blocco `TAG_COLAZIONE` e la patch di esclusione
`ricotta` in `index.html:seedIfEmpty` — rimossi per intero. Mantenuta
l'esclusione di `latte intero` (decisione applicativa indipendente, non
collegata a questo flusso). `index.html` non scrive più
`colazioneGruppo`/`porzioneColazione` se non per quella singola esclusione
residua: legge soltanto le varianti sincronizzate dal motore.

**Struttura canonica scelta:** `ancheColazione` (metadato già presente per
Uova in `ingredienti-new.json`) è diventato il formato canonico per gli
ingredienti a **doppio contesto** (usati sia a colazione sia nel pasto
principale): un solo ingrediente, mai duplicato in una variante
"colazione" separata. Aggiunto lo stesso metadato a Ricotta:
```json
"ancheColazione": {
  "sottoCategoriaColazione": "proteine",
  "porzioneMin": 50,
  "porzioneMax": 60
}
```
(`ingredienti-new.json`, versione catalogo 21→22 per invalidare la cache
compilata). Per gli ingredienti a colazione esclusiva resta il campo di
primo livello `sottoCategoriaColazione`/`porzione` (più semplice, non
duplicato altrove: nessuna riscrittura dell'intero catalogo, fuori
perimetro "non riscrivere il sistema generale della colazione"). Nuova
funzione unica `motor-v12.js:metaColazioneCanonica(d)`: unico punto di
lettura per l'idoneità e la porzione di fallback, controlla prima
`ancheColazione` poi il campo di primo livello — mai due formati letti in
punti diversi.

**Flusso finale fino allo snapshot:**
- **Idoneità**: `sincronizzaIngredientiIndexedDB` → `metaColazioneCanonica(d)`
  → `variante.colazioneGruppo`. Nessuna lettura del resolver per decidere
  *se* un ingrediente è idoneo (resta una proprietà del catalogo).
- **Quantità colazione**: `resolveNutritionConfig().ingredientConstraints[id].contexts.colazione.quantity`
  (unità nativa: pezzi per Uova, grammi per Ricotta) con priorità sul
  fallback di catalogo (`ancheColazione.porzioneMin`); conversione
  nell'equivalente in grammi per `variante.porzioneColazione` tramite la
  **stessa** funzione già usata per il pasto principale
  (`grammiDaQuantita`, mai una seconda conversione pz/g duplicata) — così
  l'unità visuale resta sempre quella nativa (1 pz, non 60 g) mentre il
  calcolo nutrizionale interno usa il peso equivalente.
- **Pasto principale**: invariato dalla sezione 1 di questo filone
  (`quantitaConfigurata` → `contexts.pastoPrincipale.quantity`).
- **Snapshot**: `snapshotRealizzazione()` copia direttamente
  `ricetta.ingredienti` (già con `quantita`/`unita` corretti dalla
  compilazione) in `ingredientiEffettivi` — nessuna trasformazione
  aggiuntiva, verificato che Uova resti `2 pz` e Ricotta `100 g`.

**File modificati:** `motor-v12.js`, `ingredienti-new.json` (aggiunto
`ancheColazione` a Ricotta, versione 21→22), `index.html` (rimossi
`TAG_COLAZIONE` e la patch di esclusione ricotta),
`tests/lotto-d-contestuali-realizzazione.test.js` (aggiornato, stessa
suite, nessun nuovo file).

**Test eseguiti (controlli consentiti):**
```
node tests/lotto-d-contestuali-realizzazione.test.js  → ok (fallisce senza la correzione: colazioneGruppo null invece di 'proteine', verificato)
node tests/nutrition-config.test.js                    → ok
node tests/lotto-d-root-nutritionist-setting.test.js   → ok
node --check nutrition-config.js                       → OK
node --check motor-v12.js                               → OK
git diff --check                                        → pulito
```
`index.html`: nessuno strumento dedicato nel repository, script
modificato estratto ed eseguito con `node --check` (stesso metodo già
usato nei filoni precedenti); nessuna suite completa avviata.

**Non modificati:** frequenze settimanali, carboidrati, verdure,
migrazioni IndexedDB, ricette, UI grafica; `nutrition-config.js`
(nessuna regola contestuale duplicata nel motore).

**Problema adiacente annotato, non toccato:** `seedIfEmpty()` in
`index.html` resta senza alcun chiamante nell'app (dead code più ampio di
questo intervento, che ha rimosso solo i due blocchi in conflitto diretto
con la colazione): decisione su un'eventuale rimozione completa lasciata
a Cwe.

**SHA finale:** `060537372f71a0878859e98f40c7319d8f6e35df`.

---

## 3. Commit `606e95c` — contratto unico quantità/unità/grammi per gli ingredienti a pezzi

**Obiettivo:** garantire una gestione unica e coerente degli ingredienti
contati a pezzi (casi rappresentativi: Uova 2 pz = 120 g; Friselle 2 pz =
50 g) lungo l'intera cascata catalogo → ricetta compilata → snapshot →
visualizzazione → lista spesa → scarico inventario.

**Contratto definitivo dei campi:**
- `quantita`: valore nell'unità NATIVA dell'ingrediente (pezzi per
  Uova/Friselle, grammi per gli altri) — mai dedotta dal nome
  dell'ingrediente, sempre da `meta.unitaPorzione` (metadato canonico).
- `unita`: `'pz'` se `meta.unitaPorzione==='pezzi'`, altrimenti `'g'`.
- `grammi`: equivalente interno (`grammiDaQuantita`), usato solo per
  nutrizione/confronti/aggregazioni pesate — mai mostrato come tale
  all'utente per un ingrediente a pezzi.
- `pesoPezzo` (variante): fattore di conversione derivato dal catalogo
  (`pesoPorzioneGrammi/porzione`), mai una tabella nome→peso hardcoded.
- `porzioneColazione` (variante): stesso contratto, sempre grammi-
  equivalenti internamente; la UI riconverte a pezzi solo alla
  formattazione finale (`formattaQuantita`).

**Percorsi verificati e già corretti (non modificati):**
- `motor-v12.js:preparaIngredientiDettagliati`/`quantitaConfigurata`:
  producono già `quantita` nativa, `grammi` equivalente, `unita` da
  `meta.unitaPorzione` — generico, nessun nome hardcoded (verificato
  anche per Friselle, vedi sotto).
- `motor-v12.js:snapshotRealizzazione`: copia `ricetta.ingredienti`
  senza alcuna trasformazione — quantità/unità/grammi arrivano intatti.
- `index.html:aggiornaListaSpesaAutomatica` (ramo `motoreNuovo`): usa già
  `ing.grammi` per gli ingredienti a pezzi, con un commento esplicito che
  descrive esattamente il contratto richiesto — nessuna correzione
  necessaria, verificato eseguendo la formula reale estratta dal file.

**Difetti riprodotti e corretti (`index.html`, entrambi confermati
percorso live per `voce.motoreNuovo`):**
1. `scalaInventarioPerRicetta()`/`annullaScalaInventarioPerRicetta()`
   scalavano/restituivano l'inventario con `ing.quantita` grezzo, senza
   controllare `ing.unita`: per un ingrediente a pezzi questo scalava
   l'inventario (sempre in grammi) del solo conteggio-pezzi (es. `2`
   invece di `120 g`/`50 g`). Corretto riusando lo stesso pattern già
   corretto in `aggiornaListaSpesaAutomatica`. Verificato eseguendo (non
   reimplementando) la funzione reale estratta da `index.html`: 200 g di
   Friselle in inventario, scalate di una porzione da 2 pz (50 g) →
   150 g corrette (non 198 g, non un valore negativo).
2. `apriModalDettaglioRicetta()` (modal dettaglio ricetta) passava
   `i.quantita` grezzo a `formattaQuantita()` (che si aspetta sempre
   grammi): per le Uova questo avrebbe mostrato "0 pz" invece di "2 pz".
   Corretto con lo stesso pattern.

**Scoperta rilevante (non un difetto, un fatto del catalogo):** nessuna
ricetta di `db-ricette.json` contiene mai "Friselle" come ingrediente
(verificato con ricerca esaustiva su tutti i template) — il motore
sequenziale non può quindi selezionarla realmente in un pasto generato
oggi (`CARB_KEY_BY_NAME['friselle']` resta un carboidrato "riconosciuto"
ma orfano nel catalogo ricette). Non essendo autorizzata la modifica
delle ricette in questo intervento, il meccanismo per Friselle è stato
verificato compilando un template sintetico in memoria (mai scritto su
disco) con la stessa identica pipeline (`generaCombinazioni`+
`compilaRicetta`, quest'ultima resa esportabile per testabilità) usata
per ogni ricetta reale: risultato `quantita:2, unita:'pz', grammi:50`,
confermando che il meccanismo è generico e corretto anche per Friselle,
indipendentemente dalla sua assenza nel catalogo ricette attuale.
Decisione su un'eventuale aggiunta di Friselle a una ricetta reale
lasciata a Cwe (fuori perimetro: "non modificare le ricette").

**Residui storici esaminati e non toccati (motivazione):**
- `index.html:CARBOIDRATI_PASTO.friselle.porzione = 50`: consumato
  realmente da `nutrizioneCarboidratoModulare` (`fattore=porzione/100`,
  cioè grammi — interpretazione corretta, non confusa con un conteggio
  pezzi). Raggiungibile solo se `voce.primoCereale` è valorizzato, campo
  che il motore attuale non scrive mai con un valore reale (solo `null`,
  verificato con ricerca globale) — resta un ramo di compatibilità per
  eventuali vecchi record, mai esercitato dai dati prodotti oggi. Valore
  corretto, percorso non-morto-ma-non-esercitato: nessuna modifica.
- `index.html:seedIfEmpty` — voci seed di "Uova" (`formato:60,qta:120,
  unitaPezzo:true`) e "Friselle" (`formato:250,qta:250`, **senza**
  `unitaPezzo`): usano una convenzione di campi (`formato`/`qta`)
  incompatibile con lo schema live attuale (`pesoPezzo`/`unitaPezzo`/
  `porzioneColazione`), quindi anche se `seedIfEmpty()` venisse mai
  richiamata (verificato ancora una volta: nessun chiamante nell'app,
  stesso riscontro delle sezioni precedenti di questo registro) i dati
  non sarebbero compatibili con la pipeline corrente. Non rimosse in
  questo intervento: la rimozione toccherebbe l'intero blocco di seed
  (molti altri ingredienti, non solo Uova/Friselle), un modulo estraneo
  al contratto pz/g oggetto di questo incarico ("non riscrivere moduli
  estranei"); resta parte della decisione già aperta su `seedIfEmpty()`
  nella sezione precedente di questo registro.
- `index.html:etichettaOpzioneSpuntino` (`formattaQuantita(v,i.quantita)`)
  e le funzioni di nutrizione del componimento secondo+contorno legacy
  (`componiSecondoContorno`, `macronutrienteDominanteSync`,
  `nutrizionePerPersona` per ricette senza `nutrizioneManualeTotale`):
  nessuna include mai Uova o Friselle (verificato), e per le ricette
  compilate dal motore nuovo `nutrizionePerPersona` esce comunque prima
  tramite `ricetta.nutrizioneManualeTotale` (già corretto, calcolato da
  `calcolaNutrienti` su `.grammi`). Non toccate: fuori perimetro
  ("non affrontare altri ingredienti") e in gran parte percorsi legacy
  non esercitati dal motore attuale.

**File modificati:** `index.html` (`scalaInventarioPerRicetta`,
`annullaScalaInventarioPerRicetta`, `apriModalDettaglioRicetta`),
`motor-v12.js` (solo `compilaRicetta` esportata per testabilità, nessuna
logica cambiata), `tests/lotto-g-unita-pz-snapshot.test.js` (nuovo).

**Test eseguiti (controlli consentiti):**
```
node tests/lotto-g-unita-pz-snapshot.test.js         → ok (fallisce senza la correzione: "0" invece di "1" pattern trovato, verificato)
node tests/lotto-d-contestuali-realizzazione.test.js → ok
node --check motor-v12.js                             → OK
git diff --check                                      → pulito
```
`index.html`: nessuno strumento dedicato nel repository; script
modificato estratto e controllato con `node --check` (stesso metodo dei
filoni precedenti); nessuna suite completa avviata.

**Non modificati:** quantità nutrizionali del catalogo, frequenze,
carboidrati FIXED/AUTO/EXCLUDED, ricette, verdure, colazione (oltre a
quanto già chiuso nella sezione precedente), UI grafica. Nessun
ingrediente duplicato, nessuna tabella nome→peso introdotta, nessuna
conversione permanente pz→g.

**SHA finale:** `606e95c9208886e577e5fc385b27bb93781cbeb4`.

---

# Filone: Roadmap catalogo visuale e descrittivo

## 1. Registrazione della fase post-stabilizzazione — 7 settembre 2026

**Decisione di Cwe:** dopo la chiusura di tutte le correzioni funzionali,
aggiungere alla roadmap un catalogo parallelo esclusivamente visuale e
descrittivo, indicizzato con gli stessi ID delle ricette concrete e gli stessi
`variantId` degli ingredienti.

**Obiettivo:** consentire all'app, dato un ID, di ottenere separatamente i dati
funzionali oppure fotografia e ricetta testuale, senza appesantire o duplicare
il database usato dal motore.

**Confine registrato:** il catalogo parallelo non contiene e non modifica
classi, categorie, C/P/V/S/G, frequenze, limiti, quantità nutrizionali o
compatibilità. Le immagini restano file esterni; il catalogo conserva soltanto
il riferimento. L'assenza dei contenuti visuali non blocca il funzionamento
dell'app.

**Stato:** inserito esclusivamente nella roadmap; nessuna implementazione,
modifica allo schema IndexedDB o produzione massiva di immagini autorizzata in
questa fase.

**File modificati:** `docs/PIANO_REVISIONE_ROOT_NUOVO_DB.md`,
`docs/REGISTRO_MODIFICHE.md`.

---

## 2. Separazione delle responsabilità tra restyling e database visuale — 7 settembre 2026

**Decisione di Cwe:** il restyling grafico e l'integrazione tecnica del futuro
database visuale procedono in sessioni distinte, senza dipendenze funzionali
durante la fase grafica.

**Sessione grafica:** realizza nuova interfaccia, card fotografiche, swipe,
indicatori, fallback, responsive e immagini dimostrative tramite percorsi
statici. Queste immagini restano segnaposto e non sono collegate a ricette per
nome o ID.

**Sessione tecnica:** dopo la chiusura delle modifiche funzionali progetterà e
implementerà con Claude lo schema visuale, i collegamenti per ID ricetta e
`variantId`, il caricamento IndexedDB, la copertura degli ID, la risoluzione dei
percorsi, il fallback e il caricamento limitato alle viste Ricette, Pasto e
Menu.

**Contratto d'integrazione:** quando il database visuale sarà pronto,
sostituirà soltanto la sorgente delle immagini statiche del componente
grafico. Struttura, swipe e comportamento dell'interfaccia resteranno
invariati.

**Vincoli confermati:** cataloghi funzionale e visuale separati; catalogo
visuale limitato a ID, percorso immagine e testo; collegamenti soltanto per ID;
immagini esterne e mai Base64; assenza di contenuti non bloccante; nessun
accesso al vecchio `ricette.json`; nessun impatto su avvio o motore.

**Intervento effettuato:** aggiornamento esclusivamente documentale della
roadmap. Nessuna modifica a codice, schema IndexedDB, UI o cataloghi dati.

**File modificati:** `docs/PIANO_REVISIONE_ROOT_NUOVO_DB.md`,
`docs/REGISTRO_MODIFICHE.md`.

**Verifiche:** `git diff --check`.

**SHA dell'intervento:** `c6a0dbbfaec6643a803e49cd6feabd1dfa9e8dab`.

---

# Filone: Restyling grafico PWA

## 1. Prima integrazione del concept visuale — 7 settembre 2026

**Obiettivo autorizzato da Cwe:** avviare il restyling grafico della PWA sul
concept approvato, mantenendo separati il lavoro visuale e la futura
integrazione tecnica del catalogo fotografico.

**Correzione applicata:** il guscio condiviso dell'app usa ora una palette
avorio, salvia e verde bosco, con header editoriale e barra di navigazione
inferiore verde coordinata. La vista Pasto mostra la data estesa, una breve
caption e card più morbide e leggibili. Colazione, pranzo e cena possono
ricevere un carosello fotografico orizzontale con anteprima della slide
successiva, indicatore a pallini, scroll snap e fallback neutro in caso di
errore dell'immagine.

**Separazione funzionale preservata:** le fotografie sono tre asset
dimostrativi richiamati tramite path statici raccolti esclusivamente in
`IMMAGINI_VISUALI_DEMO`. Non esiste alcuna associazione per nome o ID e non è
stato creato alcun database visuale. Il componente non legge né modifica
motore, cataloghi, nutrizione, inventario, lista spesa o storico; non viene
mostrato negli slot vuoti o conclusi. La futura sessione tecnica potrà
sostituire soltanto la sorgente dei path.

**Asset:** tre WebP esterni 960×640, ottimizzati e privi di testo, logo e
watermark; peso complessivo circa 266 KB. Il primo visuale della colazione è
caricato con priorità, gli altri in lazy loading.

**Backup richiesto da Cwe:** prima di qualsiasi pubblicazione è stata salvata
la copia integrale `docs/backups/index-pre-restyling-2026-09-07.html`, verificata
tramite blob hash identico all'`index.html` del commit di partenza.

**File modificati:** `index.html`, `manifest.json`.

**File aggiunti:**
- `assets/visual-demo/colazione-overnight-oats.webp`;
- `assets/visual-demo/pranzo-spaghetti-vongole.webp`;
- `assets/visual-demo/cena-ceci-radicchio.webp`;
- `docs/backups/index-pre-restyling-2026-09-07.html`.

**Verifiche eseguite:**
```
parsing di tutti gli script inline tramite node:vm.Script → OK
parsing JSON di manifest.json                         → OK
esistenza di tutti i path statici dichiarati         → OK
identify sui tre WebP (960x640)                       → OK
confronto hash backup / index.html iniziale           → identico
git diff --check                                      → pulito
GitHub Pages: header, palette, data e bottom bar       → OK
generazione e salvataggio locale menu di prova        → OK
3 caroselli × 3 slide; immagini rotte                 → 0
overflow orizzontale documento                        → assente
swipe reale prima→seconda slide e indicatore attivo   → OK
console pagina                                        → nessun errore app
```

**Nota di verifica:** il primo tentativo locale non disponeva del binario
Chromium. Dopo la pubblicazione autorizzata da Cwe la verifica è stata eseguita
sulla GitHub Pages aggiornata con cache-buster, includendo interazione reale
con il carosello. Gli unici messaggi di console rilevati appartenevano
all'estensione di controllo del browser, non alla PWA.

**Non modificati:** `motor-v12.js`, `engine-core.js`, `nutrition-config.js`,
`db-ricette.json`, `ingredienti-new.json`, schema IndexedDB, regole funzionali,
dati e test del motore.

**SHA remoto dell'intervento:** `8084ead53bf43e5cbaebfcfc343029d29c826ff8`.

---

## 2. Ripristino produzione e isolamento della preview — 7 settembre 2026

**Decisione autorizzata da Cwe:** dopo il confronto con la schermata reale su
Android, ripristinare l'interfaccia precedente come pagina principale e
spostare il restyling in una pagina separata, così da poterlo sviluppare e
verificare senza influire sulla PWA in uso.

**Intervento effettuato:** `index.html` è stato ripristinato byte per byte dal
backup verificato `docs/backups/index-pre-restyling-2026-09-07.html`.
`manifest.json` è tornato alla versione cromatica precedente. La prima
integrazione grafica è stata conservata integralmente come
`restyling-preview.html`; i tre asset WebP dimostrativi restano disponibili
esclusivamente per questa sperimentazione visuale.

**Verifiche su GitHub Pages:** la pagina principale presenta nuovamente header
`Dieta·Planner`, sottotitolo `Pranzo e cena, senza sprechi`, colore tema
`#181c14` e non contiene il titolo editoriale del restyling. La preview
separata presenta invece header `DietaPlanner`, sottotitolo
`Piani sani, giorni migliori`, colore tema `#174b35` e il titolo editoriale.

**Separazione confermata:** nessun file del motore, catalogo funzionale, schema
IndexedDB o regola applicativa è stato modificato. Il lavoro successivo sul
restyling avverrà in `restyling-preview.html` finché Cwe non ne autorizzerà
esplicitamente il trasferimento nell'app principale.

**File ripristinati:** `index.html`, `manifest.json`.

**File aggiunto:** `restyling-preview.html`.

**SHA remoto dell'intervento:** `1a9c273f77b774aaa40c97ae200162bfd13c3d83`.

---

## 3. Ricostruzione grafica autonoma del mockup — 7 settembre 2026

**Obiettivo autorizzato da Cwe:** ricostruire prima l'interfaccia del mockup nel
modo più fedele possibile, occupandosi esclusivamente della grafica e
rimandando a una fase successiva qualsiasi collegamento funzionale.

**Intervento effettuato:** `restyling-preview.html` è stato trasformato in una
pagina dimostrativa autonoma e statica. Sono stati riprodotti header editoriale,
selettore settimanale, data estesa, card di colazione/pranzo/cena, immagini dei
piatti in corsia orizzontale con anteprima della scheda successiva,
indicatori, ingredienti, comandi visuali e bottom menu verde a quattro voci.

**Separazione garantita:** la preview non contiene script applicativi, non legge
IndexedDB e non importa motore o cataloghi. Le sole immagini utilizzate sono i
tre WebP dimostrativi già presenti in `assets/visual-demo`. `index.html`,
`manifest.json`, motore, database e configurazioni funzionali non sono stati
modificati.

**Verifiche:** `git diff --check` pulito; GitHub Pages carica tre card e sei
immagini valide da 960 px; confronto commit remoto limitato esclusivamente a
`restyling-preview.html`; resa visuale verificata nel browser senza immagini
rotte.

**File modificato:** `restyling-preview.html`.

**SHA remoto dell'intervento:** `bdbdd7c9eb9498dd394cb0acfbad2344634983ea`.

---

## 4. Compattazione della preview Android — 7 settembre 2026

**Correzione richiesta da Cwe:** rendere l'interfaccia meno gigante e più
snella, avvicinando la densità verticale al mockup nel quale i tre pasti sono
visibili nella stessa schermata.

**Intervento effettuato:** riduzione coordinata, sotto i 430 px CSS, di header,
logo, calendario, titolo data, card, fotografie, testi, ingredienti, pulsanti e
bottom menu. La caption viene nascosta nel formato più stretto; titolo e saluto
restano su una sola composizione compatta. Le icone calendario e lucchetto sono
ora disegnate in CSS e non dipendono dai glifi emoji del dispositivo.

**Separazione confermata:** modificato soltanto `restyling-preview.html`;
nessuna variazione a `index.html` o ai file funzionali.

**Verifiche:** `git diff --check`; caricamento GitHub Pages; tre card presenti e
tutte le immagini valide.

**SHA remoto dell'intervento:** `707e93dd01340fa103918aa0ee8dbc4472de3b74`.

---

## 5. Caroselli solidali e rifinitura header — 7 settembre 2026

**Correzioni richieste da Cwe:** ridurre lo spazio inutilizzato nell'header,
ingrandire leggermente il marchio, sostituire il lucchetto, mantenere ferme le
frecce durante lo swipe e far scorrere insieme fotografia e testo. Aggiungere
primo, secondo e contorno a pranzo e cena con descrizioni e dosi.

**Intervento effettuato:** l'header mobile è stato compattato; il lucchetto è
ora un'icona SVG lineare. Ogni pasto contiene un carosello di tre pannelli nei
quali immagine, tipologia, titolo, ingredienti e dosi scorrono come un'unica
unità, mentre la freccia resta ancorata alla card. Pranzo e cena presentano le
tre tipologie richieste. I dati e le immagini restano puramente dimostrativi.

**Separazione confermata:** modificato soltanto `restyling-preview.html`;
`index.html` e tutti i file funzionali restano invariati.

**Verifiche:** parsing dello script inline; `git diff --check`; tre caroselli da
tre pannelli, nove lucchetti SVG e immagini valide; click della freccia con
passaggio al secondo pannello e posizione della freccia invariata.

**SHA remoto dell'intervento:** `605ee1900af56b4b81e3e83aa08e1a136a8c7451`.

---

## 6. Ultima regolazione header e lucchetto — 7 settembre 2026

**Correzione richiesta da Cwe:** sottrarre altri 10 px allo spazio attorno al
titolo dell'header e raddoppiare le dimensioni del lucchetto stilizzato.

**Intervento effettuato:** nel formato mobile l'header passa da 72 a 62 px e il
padding laterale da 17 a 7 px, azzerando quello verticale. Il marchio conserva
la dimensione approvata. Il lucchetto SVG passa da circa 16,5 a 34 px, mentre
il contenitore della riga resta compatto.

**Separazione confermata:** modificato soltanto `restyling-preview.html`.

**Verifiche:** parsing script inline e `git diff --check`.

**SHA remoto dell'intervento:** `d2ada75daafc39e153c0e632b912a7df615ffb08`.

---

## 7. Allineamento interno pulsante Dettagli — 8 settembre 2026

**Correzione richiesta da Cwe:** allineare verticalmente icona, testo e freccia
nel pulsante verde `Dettagli`.

**Intervento effettuato:** il pulsante usa ora una griglia interna a tre colonne
con centratura verticale comune e una span dedicata al testo, eliminando le
diverse baseline dei tre elementi.

**Separazione confermata:** modificato soltanto `restyling-preview.html`.

**Verifiche:** parsing script inline, `git diff --check` e misura geometrica nel
browser: i tre centri verticali coincidono, scarto rilevato `0 px`, su tutti i
nove pulsanti generati dai caroselli.

**SHA remoto dell'intervento:** `661846caab59d00dde5a9b54842555e57af0ab5f`.

---

## 8. Prototipo grafico del cambio pasto verticale — 8 settembre 2026

**Obiettivo autorizzato da Cwe:** al comando `Cambia piatto`, far scorrere
dall'alto verso il basso l'intero pasto, mantenendo solidali fotografie, testi,
ingredienti e dosi. Dopo il primo cambio, comprimere il comando e mostrare
`Ripristina` per tornare al pasto programmato.

**Intervento effettuato:** aggiunta alla preview una rotazione verticale
dimostrativa indipendente per ciascuna card. Il contenuto corrente esce verso il
basso e la nuova proposta entra dall'alto; lo swipe orizzontale interno resta
disponibile e la relativa freccia rimane ancorata alla card. Dopo il cambio la
riga comandi presenta `Cambia`, `Ripristina` e `Dettagli`. Il pranzo alternativo
usa le tre fotografie fornite da Cwe per farro con pomodorini e zucchine,
branzino ai ferri e insalata di carote e barbabietole.

**Asset:** i tre originali allegati sono stati mantenuti invariati; nella repo
sono state aggiunte copie WebP 960×536 ottimizzate, per complessivi circa 191
KB.

**Separazione confermata:** la rotazione usa esclusivamente dati dimostrativi
interni alla preview e non interroga motore, database o IndexedDB. `index.html`
e i file funzionali non sono stati modificati.

**Verifiche:** parsing dello script e `git diff --check`; caricamento delle tre
nuove immagini; cambio del pranzo verso il set Farro/Branzino/Insalata;
comparsa di `Ripristina`; ritorno agli spaghetti originali.

**File modificato:** `restyling-preview.html`.

**File aggiunti:**
- `assets/visual-demo/alternativa-farro-pomodorini-zucchine.webp`;
- `assets/visual-demo/alternativa-branzino-ferri.webp`;
- `assets/visual-demo/alternativa-insalata-carote-barbabietole.webp`.

**SHA remoto dell'intervento:** `583a62fb5f7bf78b00c54235763767c0c3d28d3b`.

---

## 9. Direzione inversa del ripristino — 8 settembre 2026

**Correzione richiesta da Cwe:** differenziare visivamente il ripristino anche
quando sono disponibili soltanto due set di pasto.

**Intervento effettuato:** `Cambia` conserva il movimento con uscita verso il
basso e ingresso dall'alto. `Ripristina` usa il verso opposto: il contenuto
alternativo esce verso l'alto e il pasto programmato rientra dal basso.

**Separazione confermata:** modificato soltanto `restyling-preview.html`.

**Verifiche:** parsing dello script inline e `git diff --check`.

**SHA remoto dell'intervento:** `07d2a2f23761779de145a0c1df952a2c741161fa`.

---

## 10. Transizione verticale continua senza fading — 8 settembre 2026

**Correzione richiesta da Cwe:** eliminare il breve vuoto bianco tra uscita e
ingresso dei due pasti e usare un movimento esclusivamente assiale.

**Intervento effettuato:** il pannello uscente e quello entrante vengono
temporaneamente sovrapposti e animati nello stesso intervallo. Entrambi restano
completamente opachi: mentre uno lascia la card, l'altro ne occupa
progressivamente lo spazio, senza fading né fotogrammi vuoti. I versi distinti
di `Cambia` e `Ripristina` restano invariati.

**Separazione confermata:** modificato soltanto `restyling-preview.html`.

**Verifiche:** parsing dello script inline e `git diff --check`.

**SHA remoto dell'intervento:** `688639ab761adac52bbef1c9613cc3ff36ede806`.

---

## 11. Rotaia verticale lineare — 8 settembre 2026

**Correzione richiesta da Cwe:** ottenere lo stesso comportamento continuo del
carosello orizzontale, ruotato sull'asse verticale, senza fading,
sovrapposizioni o intervalli bianchi.

**Intervento effettuato:** la precedente coppia di animazioni indipendenti è
stata sostituita da una sola rotaia temporanea contenente i due pasti adiacenti,
bordo contro bordo. L'intera rotaia trasla esattamente di metà della propria
altezza, equivalente a un pannello: `Cambia` in un verso e `Ripristina` nel
verso opposto. Non vengono animate opacità e distanze eccedenti il pannello.

**Separazione confermata:** modificato soltanto `restyling-preview.html`.

**Verifiche:** parsing dello script inline e `git diff --check`.

**SHA remoto dell'intervento:** `47110f8f6fc77a76f9293ac459c101cb9e70e144`.

---

## 12. Metadati di integrazione della preview — 8 settembre 2026

**Richiesta di Cwe:** lasciare nella struttura grafica indicazioni utili per il
successivo lavoro di merge con l'app funzionale.

**Intervento effettuato:** aggiunti attributi DOM invisibili `data-ui-role`,
`data-bind`, `data-action`, `data-route`, `data-state` e
`data-meal-slot` ai principali componenti statici e generati. Inserito inoltre
il contratto JSON `restyling-merge-contract`, che elenca componenti, dati
attesi, azioni e invarianti di separazione.

**Impatto visuale:** nessuno; i metadati non applicano stili e non modificano
dimensioni, animazioni o contenuti visibili.

**Separazione confermata:** non è stato collegato alcun dato funzionale e non
sono stati modificati `index.html`, motore, database o IndexedDB.

**Verifiche:** parsing dello script applicativo, parsing del contratto JSON e
`git diff --check`.

**SHA remoto dell'intervento:** `6886a54bbf56636807c9adabfe2ec60d5988bb61`.

---

## 13. Scheda grafica dettagli ricetta — 8 settembre 2026

**Obiettivo autorizzato da Cwe:** aprire da ogni pulsante `Dettagli` una scheda ricetta quasi a tutto schermo, mantenendo visibile l'app sfocata sullo sfondo; aggiungere controllo porzioni, dati nutrizionali, storico e uno scheletro social firmato DietaPlanner, senza ridurre le animazioni.

**Intervento effettuato:** la preview dispone ora di un dialog con margini, immagine completa del piatto e fascia nera al 60% con titolo allineato a sinistra. La scheda include tempo stimato, ingredienti e dosi, spezie e condimenti, preparazione dimostrativa, riepilogo nutrizionale e statistiche di proposta/consumo. Le porzioni partono da 1; il pulsante meno è disattivato al minimo e i pulsanti più/meno aggiornano le dosi numeriche. La sezione social espone quattro comandi dimostrativi e il marchio DietaPlanner, senza pubblicare o condividere contenuti.

**Riferimenti per il merge:** ogni pannello ricetta e relativo pulsante Dettagli espongono un `data-recipe-id` univoco; il dialog conserva l'ID aperto. Il contratto `restyling-merge-contract` documenta binding e azioni per dettaglio, porzioni e condivisione. I contenuti reali saranno sostituiti in seguito tramite ID e IndexedDB, mai tramite confronto dei nomi.

**Separazione confermata:** modificato soltanto `restyling-preview.html`; `index.html`, database, motore e schema IndexedDB sono rimasti invariati.

**Verifiche:** parsing JavaScript e JSON, `git diff --check`; prova su GitHub Pages di apertura/chiusura, ID ricetta, porzione iniziale 1, meno disattivato, incremento a 2 con dose 60 g → 120 g e ritorno a 1. Nessun errore applicativo rilevato; i soli messaggi di console appartengono all'estensione di controllo del browser.

**SHA remoto dell'intervento:** `d4f82e55f0e49ac81322c60c8e5ca364ec53fbe4`.

---

## 14. Icone nella sezione social — 8 settembre 2026

**Correzione richiesta da Cwe:** sostituire i nomi testuali dei social con le rispettive icone.

**Intervento effettuato:** i quattro comandi dimostrativi mostrano ora icone vettoriali inline per WhatsApp, Facebook, Instagram e copia collegamento. Ogni pulsante conserva `data-channel`, `aria-label` e `title`, così il riferimento funzionale e l'accessibilità non dipendono dal contenuto grafico.

**Separazione confermata:** modificato soltanto `restyling-preview.html`; i pulsanti restano intenzionalmente inattivi e non è stato toccato `index.html`.

**Verifiche:** parsing JavaScript e JSON, `git diff --check`, presenza di quattro canali social distinti.

**SHA remoto dell'intervento:** `1ae24fdd2ba2afe685b39793958d03c459aa57ec`.

---

## 15. Blocco gesture, profilo utente e calendario nativo — 8 settembre 2026

**Richieste di Cwe:** portare a 16 px il margine della scheda Dettagli; consentirne la chiusura trascinandola verso il basso quando è già al proprio top; predisporre l'avatar Google e rendere più arioso il saluto con testo esatto “Buon Appetito!”; rendere funzionale lo swipe orizzontale del calendario usando come riferimento la logica già collaudata in `index.html`.

**Intervento effettuato:** la scheda Dettagli usa 16 px uniformi e segue il dito verso il basso solo quando `scrollTop === 0`, chiudendosi oltre la soglia e tornando in posizione negli altri casi. L'header espone `user.googleAvatarUrl`, un segnaposto circolare e due righe separate per il saluto. Il calendario è stato riallineato al modello di produzione: corsia nativa orizzontale di 181 giorni (±90), inerzia touch, selezione per data locale, ricentratura del giorno attivo e frecce settimanali.

**Correzione emersa dai test:** una prima implementazione animava manualmente sette giorni e poteva lasciare traslate le aree cliccabili. È stata rimossa e sostituita con lo scorrimento nativo già usato da `index.html`, evitando due comportamenti da riconciliare nel merge futuro.

**Separazione confermata:** il blocco modifica esclusivamente `restyling-preview.html`; `index.html`, motore, database e IndexedDB non sono stati toccati.

**Verifiche:** parsing JavaScript e contratto JSON; `git diff --check`; GitHub Pages con 181 pulsanti e overflow orizzontale nativo; frecce Lun 7 → Lun 14, selezione Mer 16 e ritorno settimanale a Mer 9; avatar e saluto; margine superiore Dettagli 16 px; apertura/chiusura; porzioni 1 → 2 e dose 60 g → 120 g; quattro icone social con canali ed etichette accessibili.

**SHA del blocco pubblicato:** `6d67c572f56a4d3fab523e1de9543e53825f3893`.

**SHA della correzione finale calendario:** `7fa1ffd3f2d9b0e8cd890b6d4a75f2f13732f644`.

---
# Filone: Unica fonte runtime delle regole nutrizionali (index.html vs resolver)

Riguarda: verifica sistematica di ogni blocco storico in `index.html` che
potesse costituire una seconda fonte funzionale rispetto a
`nutrition-config.js:resolveNutritionConfig()`, e rimozione del codice
dimostrato completamente morto.

## 1. Commit `11190a8` — matrice di verifica, una divergenza reale corretta, due blocchi morti rimossi

**Esclusione esplicita rispettata:** nessun intervento sulla mancanza di
ricette per Friselle/Piadina/Pasta sfoglia — riservate a Cwe, solo
annotate qui come richiesto.

**Matrice di verifica (blocco → chiamanti → fonte autorevole → decisione):**

| Blocco | Chiamanti reali | Fonte autorevole | Decisione |
|---|---|---|---|
| `CONFIG_AVANZATA_DEFAULT` | seed per il form Setting (`configAvanzataDefaultCanonico`/`EffettivaSalvata`) | sempre ripassato da `risolviConfigNutrizionista`→`N.resolveNutritionConfig` prima di essere usato o salvato | **corretto**, nessuna modifica |
| `CAP_SPUNTINO_SETTIMANALE`/`GIORNALIERO`, `CAP_COLAZIONE_SPECIALE` | cache di sessione (`applicaConfigAvanzataRuntime`), chiamata sia al boot sia al salvataggio | resolver | **corretto**, nessuna modifica |
| `FRUTTA_GIORNALIERA` | `renderIndicatoreFrutta` (live, colora l'indicatore frutta del giorno) | **nessuna** — era una `const` indipendente | **divergenza reale, corretta** (vedi sotto) |
| `CARBOIDRATI_PASTO` | `nutrizioneCarboidratoModulare` (solo per `voce.primoCereale`, mai scritto con valore reale dal motore attuale — verificato con ricerca globale) + `.label` in una UI di editing manuale | n/d, compatibilità storica | **non toccato**, uso delimitato alla compatibilità (punto 9 dell'incarico) |
| `CARBOIDRATI_ROTAZIONE` | nessuno (verificato) | — | **rimosso**, codice morto |
| `CARBOIDRATI_LIMITATI` | nessuno (verificato) | — | **rimosso**, codice morto |
| `seedIfEmpty()` | nessuno (riverificato sull'ultimo commit, come richiesto) | — | **rimosso per intero**, nessuna variabile viva dipendeva dal suo interno (verificato), dati seed incompatibili con lo schema live (`formato`/`qta` invece di `pesoPezzo`/`unitaPezzo`) |
| `ALLOCAZIONE_CONDIMENTO_PASTO.olio_evo.grammi` (10 g, duplica `oilGramsPerMeal`) | 2 soli riferimenti, entrambi gated dietro `voce.modo==='multi' && !(voce.realizzazioni&&voce.realizzazioni.length)` — condizione mai vera per il motore attuale (che scrive sempre `realizzazioni`) | resolver (ma **nessun consumatore vivo** lo legge affatto) | **non toccato**: nessuna divergenza runtime dimostrata oggi, ma `oilGramsPerMeal` risolto non ha alcun consumatore nella pipeline di generazione attuale — **decisione riservata a Cwe** (vedi sotto) |
| `subtypeCaps`/`maxProteinSourcesPerDay` in `motor-v12.js`/`engine-core.js` | `ricettaAmmessa`, `buildProteinGrid` | sempre `resolved.*` | **corretto**, nessuna modifica |

**Duplicazione runtime reale trovata e corretta:** `FRUTTA_GIORNALIERA =
{min:2,max:3}` era una costante indipendente, mai normalizzata dal
resolver, usata dal vivo in `renderIndicatoreFrutta()` (indicatore "Frutta
oggi: N / min-max porzioni" con colorazione). Se il nutrizionista modifica
`fruit.min`/`fruit.max` nel Setting, l'indicatore avrebbe continuato a
mostrare "2-3" fisso. Corretta con lo stesso pattern già in uso per
`CAP_SPUNTINO_*`/`CAP_COLAZIONE_SPECIALE`: `let`, valorizzata da
`applicaConfigAvanzataRuntime()` con `def.fruit`/`eff.fruit` (risolti).

**Codice morto rimosso:**
- `seedIfEmpty()` (intera funzione, ~470 righe) — dati di seed iniziale
  ormai incompatibili con lo schema live e senza alcun chiamante.
- `CARBOIDRATI_ROTAZIONE`, `CARBOIDRATI_LIMITATI` — costanti dichiarate
  senza mai un lettore.

**Decisione riservata a Cwe (non scelta autonomamente):**
`oilGramsPerMeal` risolto dal resolver non ha oggi **alcun consumatore
runtime** nella generazione: l'unico punto che applica una quota fissa di
olio EVO (`ALLOCAZIONE_CONDIMENTO_PASTO`, 10 g hardcoded) è raggiungibile
solo da record del vecchio componimento "multi" senza `realizzazioni`,
mai prodotti dal motore attuale. Non è una divergenza dimostrata (nulla
osserva oggi il numero sbagliato), ma è un'assenza: il valore che il
nutrizionista configura nel Setting non influenza alcun pasto generato
oggi. Due strade possibili, entrambe una decisione alimentare/di prodotto:
(a) collegare `oilGramsPerMeal` risolto alla nutrizione dei pasti generati
dal motore nuovo; (b) lasciare l'olio fuori dal calcolo quantitativo come
scelta consapevole e rimuovere `ALLOCAZIONE_CONDIMENTO_PASTO` come residuo
morto. Nessuna delle due applicata qui.

**File modificati:** `index.html` (rimozione `seedIfEmpty`,
`CARBOIDRATI_ROTAZIONE`, `CARBOIDRATI_LIMITATI`; correzione
`FRUTTA_GIORNALIERA`), `motor-v12.js` (solo export di `configRuntime` e
`ricettaAmmessa` per testabilità, nessuna logica cambiata),
`tests/lotto-resolver-unica-fonte-runtime.test.js` (nuovo).

**Test eseguiti (controlli consentiti):**
```
node tests/lotto-resolver-unica-fonte-runtime.test.js  → ok (fallisce senza la correzione: FRUTTA_GIORNALIERA non risolta, verificato)
node tests/nutrition-config.test.js                     → ok
node tests/lotto-d-contestuali-realizzazione.test.js    → ok
node tests/lotto-g-unita-pz-snapshot.test.js            → ok
node --check nutrition-config.js                        → OK
node --check motor-v12.js                                → OK
node --check engine-core.js                              → OK
git diff --check                                         → pulito
```
`index.html`: script modificato estratto e controllato con `node --check`
(stesso metodo dei filoni precedenti); nessuna suite completa avviata.

**Non modificati:** `db-ricette.json`, `ingredienti-new.json`, ricette
mancanti (Friselle/Piadina/Pasta sfoglia, riservate a Cwe), schema
carboidrati AUTO/FIXED/EXCLUDED, quantità Uova/Ricotta, contratto
quantita/unita/grammi, UI grafica, `nutrition-config.js`.

**SHA finale:** `11190a826a46584b428005972ab90440ceacc2ca`.

---

## 2. Commit `c7a6e5b` — rimossi due export interni aggiunti solo per il test

**Difetto riscontrato:** il commit `11190a8` aveva aggiunto all'oggetto
pubblico `DietaPlannerMotorV12` due funzioni interne, `configRuntime` e
`ricettaAmmessa`, esclusivamente per permettere a
`tests/lotto-resolver-unica-fonte-runtime.test.js` di verificarne
direttamente il comportamento — un ampliamento dell'API pubblica del
motore fatto per comodità del test, non per un bisogno reale di
consumatori esterni. Verificato con ricerca globale: nessun altro punto
del codice (né `index.html` né altri test) le usava.

**Correzione:** entrambe le funzioni tolte dall'oggetto esportato in
`motor-v12.js` (restano funzioni interne del modulo, invariate nel
comportamento). Nel test, la sola sezione che le richiamava (verifica di
un cap settimanale di sottotipo, es. `carne_rossa`) è stata **rimossa**,
non riscritta con un percorso pubblico: non esiste un percorso pubblico
deterministico per questa verifica isolata — `generaPasto`/
`generaPianoSettimana` selezionano il candidato con logica randomizzata
(nessun parametro per forzare un sottotipo specifico), quindi userli
avrebbe richiesto retry/non-determinismo, non un test affidabile. La
copertura del cap di sottotipo resta nei test già dedicati
(`nutrition-config.test.js` e gli altri test del motore che la
esercitano tramite generazione), come indicato dall'incarico. Nessun
hook, API `__test` o variabile globale introdotta al loro posto.

**Verificato e confermato invariato:** la correzione di
`FRUTTA_GIORNALIERA`, la rimozione di `seedIfEmpty()` e delle due
costanti carboidrati morte (`CARBOIDRATI_ROTAZIONE`,
`CARBOIDRATI_LIMITATI`) restano come nel commit `11190a8`, non toccate.
Il commento in `index.html` su `importaListaRicette` che cita
`seedIfEmpty()` resta invariato: è già nella forma storica consentita
("stessa logica che *prima viveva* dentro seedIfEmpty()").

**File modificati:** `motor-v12.js` (solo rimozione dei due nomi
dall'oggetto esportato), `tests/lotto-resolver-unica-fonte-runtime.test.js`
(rimossa la sola sezione sul cap di sottotipo, aggiornato il commento di
testa).

**Test eseguiti (controlli consentiti):**
```
node tests/lotto-resolver-unica-fonte-runtime.test.js  → ok
node tests/nutrition-config.test.js                     → ok
node --check motor-v12.js                                → OK
git diff --check                                         → pulito
```

**Non toccati:** `oilGramsPerMeal` (decisione funzionale separata
riservata a Cwe, non affrontata), ricette mancanti, `db-ricette.json`,
`ingredienti-new.json`, comportamento del motore, resolver, cataloghi,
interfaccia grafica.

**SHA finale:** `c7a6e5bd542f58bc1aa325899966ac5b7af97563`.

---

## 16. Rifinitura hero Dettagli e indicatore Today — 8 settembre 2026

**Correzioni richieste da Cwe:** rendere sempre riconoscibile il giorno corrente nella corsia calendario; eliminare i margini neri laterali della foto nella scheda Dettagli e ridurre l'invasività della didascalia sulle ricette lunghe.

**Intervento effettuato:** il giorno reale riceve un bordo verde bosco sottile indipendente dalla selezione. Nell'hero Dettagli la fotografia passa a piena larghezza con `object-fit: cover` e proporzione 4:3; il titolo entra nel flusso sotto l'immagine con una sovrapposizione limitata. Il rettangolo nero è sostituito da una sfumatura verticale dal trasparente al verde DietaPlanner con opacità circa 0,8.

**Separazione confermata:** modificato soltanto `restyling-preview.html`; `index.html` non è stato toccato. Prima del commit è stato verificato che la preview remota non fosse stata modificata dagli interventi paralleli presenti su `main`.

**Verifiche essenziali:** parsing JavaScript e `git diff --check`.

**SHA remoto:** `806551131b4d149906ac6868c929d4eea35bb055`.

---

## 17. Rifinitura ingredienti e scheda Dettagli — 8 settembre 2026

**Richieste di Cwe:** mostrare gli ingredienti nell'ordine icona, quantità/unità, “di”, nome; aggiungere 3 px sopra e ai lati della foto e 3 px laterali alla fascia sfumata; eliminare la barra verde sotto le statistiche perché duplicava il valore “Scelto”.

**Intervento effettuato:** righe ingredienti riorganizzate con spaziatura moderata; micro-cornice da 3 px sull'hero; padding laterale della didascalia aumentato di 3 px; barra percentuale nascosta. Conservati ID, porzioni dinamiche e riferimenti di integrazione.

**Separazione confermata:** modificato esclusivamente `restyling-preview.html`; `index.html` e i file funzionali non sono stati toccati.

**Verifiche:** parsing JavaScript e `git diff --check`.

---

## 18. Prova bordo bianco nell'hero Dettagli — 8 settembre 2026

**Richiesta di Cwe:** sostituire il padding da 3 px attorno alla fotografia con un bordo bianco degli stessi 3 px sui lati superiore, sinistro e destro.

**Intervento effettuato:** rimosso il padding visivo e applicato il bordo bianco; il lato inferiore resta senza bordo per mantenere continua la sfumatura verde. Modificato soltanto `restyling-preview.html`; `index.html` resta invariato.

**Verifica essenziale:** `git diff --check`.

**SHA remoto:** `cb29537890d1df523d33e8f170cd83d3ee3b158b`.

---

## 18. Chiusura grafica della scheda Dettagli — 8 settembre 2026

**Richiesta conclusiva di Cwe:** proseguire il bordo bianco sui lati della fascia sfumata, arrotondare gli angoli superiori della fotografia e trasformare l'elenco ingredienti in una tabella per garantire l'allineamento verticale.

**Intervento effettuato:** bordo bianco laterale continuo tra foto e sfumatura, angoli superiori arrotondati e tabella semantica a quattro colonne: icona, quantità/unità, “di”, ingrediente. La barra percentuale duplicata resta rimossa.

**Separazione confermata:** modificato esclusivamente `restyling-preview.html`; `index.html` e la parte funzionale non sono stati toccati.

**Verifiche:** parsing JavaScript, presenza della struttura tabellare e `git diff --check`.

**SHA remoto:** `482797c7de321bd323e08c3844ced16a9a184ae3`.

---

# Filone: Olio EVO — quota unica per pasto (decisione esplicita di Cwe)

Riguarda: gestione end-to-end della quantità di olio EVO secondo la
decisione di Cwe — «10 g complessivi al giorno, ripartiti in 5 g a
pranzo e 5 g a cena» — una sola fonte quantitativa, mai moltiplicata per
il numero di ricette che compongono il pasto.

## 1. Commit `a21c8d4` — resolver, applicazione atomica, rimozione legacy

**Difetto riscontrato:** `nutrition-config.js` esponeva `oilGramsPerMeal`
(default 10 g, range 10-15 "per pasto") mai realmente consumato dalla
pipeline nuova. Quando una ricetta compilata conteneva "Olio
extravergine oliva", la quantità derivava dalla porzione di catalogo
(`ingredienti-new.json`, 10 g), non dalla configurazione risolta: un
pasto con più realizzazioni contenenti olio poteva quindi sommare più
occorrenze indipendenti da 10 g ciascuna. `index.html` conservava inoltre
`ALLOCAZIONE_CONDIMENTO_PASTO` (10 g hardcoded), un secondo blocco
quantitativo concorrente.

**Decisione di Cwe:** olio EVO 10 g/die, 5 g a pranzo e 5 g a cena; una
sola fonte quantitativa per pasto principale, mai per ricetta; colazione
e spuntini esclusi automaticamente.

**Implementazione:**
- `nutrition-config.js`: `oilGramsPerMeal` → `oilGramsPerDay` (default
  10, `PDF_BASELINE.oil` ridefinito come range giornaliero 10-15 g).
  Nuovo campo derivato `oilGramsPerMainMeal = oilGramsPerDay/2` nell'output
  risolto — mai una seconda impostazione indipendente per pasto. Il campo
  legacy `oilGramsPerMeal` non alimenta più nulla: non viene letto né
  automaticamente raddoppiato in una quota giornaliera (gestito in modo
  non distruttivo, come richiesto).
- `engine-core.js`: `DEFAULTS.oilGramsPerMeal` → `oilGramsPerDay`
  (riferimento a `N.APP_DEFAULTS`, nessun valore duplicato).
- `index.html` (Setting nutrizionista): etichetta "Olio per pasto" →
  "Olio EVO al giorno", `data-cfg-avanzata` aggiornato a
  `oilGramsPerDay`. Il salvataggio (`salvaConfigAvanzata`) è già generico
  su `[data-cfg-avanzata]`: scrive automaticamente il campo giusto, un
  solo campo, nessun doppio binding.
- `motor-v12.js`: nuova `normalizzaRealizzazioniOlio(realizzazioni,
  oilGramsPerMainMeal)`, applicata nel **punto comune** dove le
  realizzazioni definitive di un pranzo/cena vengono chiuse
  (`chiudiPastoConVerdura`, richiamata da ogni ramo di
  `costruisciPastoSequenziale` — copre sia la generazione sequenziale
  completa sia `rigeneraPasto`) e nel punto equivalente per il Roll
  (`ruotaPasto`) — esattamente gli stessi due punti già usati da
  `normalizzaRealizzazioniVerdura`, stessa convenzione. La funzione:
  raccoglie tutte le occorrenze reali di "Olio extravergine oliva" fra le
  `ingredientiEffettivi` di *tutte* le realizzazioni del pasto (mai
  aggiunta se assente), ridistribuisce il totale in modo deterministico
  (stesso ordine di iterazione, mai casuale) così che la somma sia sempre
  esattamente 5 g indipendentemente da quante ricette del pasto la
  contengano, riusa il meccanismo `overrideQuantita` già stabilito per il
  residuo verdura (così la rotazione condimento lo riapplica
  correttamente invece di perderlo), e ricalcola `nutrientiEffettivi` con
  la stessa `calcolaNutrienti` già usata da `snapshotRealizzazione` — lo
  stesso snapshot già letto da nutrienti, inventario, lista spesa,
  storico, Roll, rigenerazione e Salvafrigo: nessun calcolo duplicato per
  queste destinazioni.
- Non toccati: template di `db-ricette.json`, porzione generale
  dell'ingrediente in `ingredienti-new.json` (resta un metadato di
  catalogo, non la regola giornaliera).

**Percorsi legacy rimossi (confermato senza chiamanti raggiungibili):**
`ALLOCAZIONE_CONDIMENTO_PASTO` e i relativi `CONDIMENTO_KCAL/GRASSI/PROT/
CARB` in `index.html` — i due soli consumatori (dentro
`componiSecondoContorno` e nell'aggregazione della lista spesa) erano
gated dietro `voce.secondoId`/`voce.modo==='multi' &&
!voce.realizzazioni.length`, condizioni mai prodotte dal motore attuale
(`voce.secondoId` non viene mai scritto con un valore reale — verificato
con ricerca globale, coerente con quanto già annotato in un filone
precedente di questo registro). Rimossi insieme ai rami morti che li
usavano; il resto di `componiSecondoContorno` (somma proteina+contorno,
non specifica dell'olio) non è stato toccato.

**Deviazione dichiarata dal vincolo "non esportare funzioni interne per
facilitare i test":** `normalizzaRealizzazioniOlio` è stata esportata.
Motivazione: nell'intero catalogo reale (`db-ricette.json`) un solo
template (id 34, legumi) contiene "Olio extravergine oliva" — verificato
con ricerca esaustiva. Non essendo autorizzata la modifica delle
ricette, non esiste alcun modo di produrre con la generazione reale uno
scenario con più realizzazioni di olio nello stesso pasto (scenario
esplicitamente richiesto dal test): l'unico punto di verifica possibile
per questo requisito è la funzione stessa, esercitata con dati costruiti
dalla stessa pipeline reale (`generaCombinazioni`+`compilaRicetta`+
`snapshotRealizzazione`, già esportate in interventi precedenti), mai
valori inventati a mano. Segnalato qui esplicitamente per un'eventuale
correzione di Cwe, a differenza del caso precedente (`configRuntime`/
`ricettaAmmessa`) dove esisteva un percorso pubblico alternativo e
l'export è stato rimosso.

**File modificati:** `nutrition-config.js`, `engine-core.js`,
`index.html`, `motor-v12.js` (nuova funzione + export dichiarato sopra),
`tests/lotto-olio-evo-quota-pasto.test.js` (nuovo),
`tests/nutrition-config.test.js` (aggiornati i riferimenti al campo
rinominato), `tests/lotto-resolver-unica-fonte-runtime.test.js`
(aggiornato per igiene, non nella lista dei controlli consentiti di
questo intervento, verificato passare comunque),
`docs/BASELINE_NUTRIZIONISTA_PDF_V1.md`,
`docs/SPECIFICA_FUNZIONALE_CORRENTE.md`.

**Test eseguiti (controlli consentiti):**
```
node tests/lotto-olio-evo-quota-pasto.test.js  → ok (fallisce senza la correzione: oilGramsPerDay non risolto, verificato)
node tests/nutrition-config.test.js             → ok
node --check nutrition-config.js                → OK
node --check motor-v12.js                        → OK
git diff --check                                 → pulito
```
`index.html`: script modificato controllato con `node --check` (stesso
metodo dei filoni precedenti); nessuna suite completa avviata.

**Non modificati:** template di `db-ricette.json`, porzione di
`ingredienti-new.json`, ricette mancanti riservate a Cwe, grafica del
restyling (solo l'etichetta e il binding del campo olio nel Setting),
carboidrati, proteine, verdure, residuo V/S/G, frequenze.

**SHA finale:** `a21c8d40a26c2cef55fa056a7138b412f94942c7`.

---

## 2. Commit `baaf9ba` — corregge la dichiarazione di "deviazione": rimossa l'esposizione artificiale di normalizzaRealizzazioniOlio

**Correzione alla sezione 1:** la sezione precedente dichiarava
esplicitamente l'esportazione di `normalizzaRealizzazioniOlio` come
deviazione motivata dal test. Cwe non ha autorizzato quella deviazione:
ripeteva lo stesso problema già corretto per `configRuntime`/
`ricettaAmmessa` in un filone precedente. Questa sezione la corregge,
senza riscrivere la sezione 1 (resta come cronologia di cosa fu fatto e
perché, con questa correzione sequenziale subito dopo).

**Correzione applicata:**
- `normalizzaRealizzazioniOlio` rimossa dall'oggetto pubblico
  `DietaPlannerMotorV12` (un solo rigo tolto). La funzione interna e i
  suoi due chiamanti runtime — chiusura del pasto
  (`chiudiPastoConVerdura`, dentro `costruisciPastoSequenziale`) e Roll
  (`ruotaPasto`) — restano invariati, nessuna modifica al comportamento.
- `tests/lotto-olio-evo-quota-pasto.test.js` riscritto per non chiamare
  più alcuna funzione interna: usa esclusivamente l'API pubblica
  `rigeneraPasto` (la stessa che la pagina Pasto usa per "Rigenera"),
  con tentativi ripetuti (bounded, stesso precedente già stabilito per
  altri scenari probabilistici in questo repository) finché il motore
  reale non produce, con dati reali, un pasto contenente olio.

**Copertura end-to-end rimasta nel test:**
- pranzo e cena con una realizzazione reale contenente olio (template
  34, l'unico nel catalogo con "Olio extravergine oliva"): totale
  sempre 5 g;
- invariante generale osservata su più target reali (legumi, carne,
  pesce, formaggi, uova): ogni volta che l'olio compare in un pasto
  reale generato, il totale è sempre 5 g, mai altro — sostituisce la
  precedente asserzione negativa ("carne non riceve mai olio"), rivelatasi
  non sempre vera nella generazione reale (un pasto a base carne può
  incorporare una realizzazione con olio in combinazioni particolari:
  l'invariante corretta da garantire non è "mai presente per certi
  target", ma "quando presente, sempre 5 g");
- `nutrientiEffettivi` presente e ricalcolato sulla realizzazione con
  olio;
- idoneità colazione (verificata sulla variante, nessuna generazione
  necessaria).

**Caso rimosso, non riproducibile end-to-end col catalogo attuale:** un
pasto con **più** realizzazioni contenenti olio contemporaneamente.
Nell'intero catalogo reale un solo template ha olio: il motore
sequenziale non può quindi mai comporre un pasto con due o più ricette
che lo contengano entrambe, indipendentemente dal numero di tentativi.
Non sostituito con ricette finte, nessuna estrazione/duplicazione della
funzione nel test, nessun hook `__test`, nessuna nuova esportazione,
nessuna modifica al catalogo. **Questo caso resta garantito solo
dall'implementazione matematica di `normalizzaRealizzazioniOlio`**
(ridistribuzione proporzionale con somma finale sempre esatta,
deterministica, vedi il commento della funzione in `motor-v12.js`) **e
dalla revisione del codice**, non da una prova end-to-end eseguibile
oggi. Se in futuro una seconda ricetta reale con olio viene aggiunta al
catalogo (decisione riservata a Cwe, fuori perimetro di questo
intervento), il caso diventerà riproducibile end-to-end e potrà essere
reintrodotto nel test con la stessa tecnica (`rigeneraPasto` + retry).

**Invariato (confermato, non toccato):** `oilGramsPerDay`,
`oilGramsPerMainMeal`, ripartizione 5 g pranzo/5 g cena col valore
giornaliero predefinito di 10 g, normalizzazione complessiva per pasto,
propagazione a nutrienti effettivi/inventario/lista spesa/storico/Roll,
rimozione di `ALLOCAZIONE_CONDIMENTO_PASTO`, cataloghi e ricette, UI e
restyling. Non è stato deciso in questo intervento se il valore
giornaliero debba restare fisso a 10 g o diventare configurabile nel
range 10-15 g: resta riservato a Cwe.

**File modificati:** `motor-v12.js` (un solo rigo, rimozione
dall'oggetto esportato), `tests/lotto-olio-evo-quota-pasto.test.js`
(riscritto).

**Test eseguiti (controlli consentiti):**
```
node tests/lotto-olio-evo-quota-pasto.test.js  → ok
node tests/nutrition-config.test.js             → ok
node --check motor-v12.js                        → OK
git diff --check                                 → pulito
```

**SHA finale:** `baaf9bad284b0b2d0fd857aa1e525787452262ac`.

---

## 3. Bottom bar della preview: set SVG e navigazione a swipe — 8 settembre 2026

**Correzione richiesta da Cwe:** sostituire i glifi eterogenei della bottom bar
con icone grandi appartenenti allo stesso linguaggio grafico, monocromatiche e
leggermente ombreggiate; evidenziare a colore la pagina selezionata e consentire
il passaggio tra le voci con uno swipe orizzontale.

**Intervento effettuato:** le quattro voci `Pasto`, `Menu`, `Spesa` e `Set`
utilizzano ora SVG lineari coordinati. Le icone inattive mantengono una tinta
salvia chiara, mentre quella attiva assume il colore oro, viene leggermente
sollevata e conserva l'indicatore circolare. La barra riconosce lo swipe
orizzontale verso sinistra o destra, seleziona rispettivamente la voce seguente
o precedente e ignora i gesti prevalentemente verticali. Il click diretto sulle
singole voci resta disponibile.

**Separazione confermata:** modificato soltanto `restyling-preview.html`;
`index.html`, motore, database e configurazioni funzionali non sono stati
modificati. La selezione nella preview è dimostrativa e contiene il metadata
`swipe-bottom-navigation` per il collegamento futuro alle viste reali.

**Verifiche:** `git diff --check` pulito; parsing completo dello script inline
con Node.js riuscito; confronto col remoto effettuato dopo il riallineamento con
gli interventi dell'altra sessione.

**File modificato:** `restyling-preview.html`.

**SHA dell'intervento grafico:** `539bb709f9ecb565ae6269f4fbe31da588ee2d21`.

---

## 4. Completamento della bottom bar a sei icone — 8 settembre 2026

**Correzione richiesta da Cwe:** aggiungere alla nuova bottom bar le icone
mancanti e consentire a un singolo swipe di attraversare più di una voce.

**Intervento effettuato:** alle voci già presenti sono state aggiunte `Ricette`
e `Inventario`, entrambe con SVG lineari coordinati al set approvato. La barra
usa ora sei colonne mantenendo icone grandi, tinta monocromatica per gli stati
inattivi, ombra leggera e colore oro per la pagina selezionata. La distanza del
gesto viene convertita nel numero di voci attraversate: uno swipe breve avanza
di una posizione, uno più ampio può raggiungerne più di una, entro i limiti
della barra.

**Separazione confermata:** modificato soltanto `restyling-preview.html`;
`index.html` e tutti i file funzionali restano invariati. Le nuove route
dimostrative sono `recipes` e `inventory`.

**Verifiche:** `git diff --check` pulito; parsing dello script inline con
Node.js riuscito; rilevate correttamente le sei route `meal`, `menu`, `recipes`,
`shopping`, `inventory` e `settings`.

**File modificato:** `restyling-preview.html`.

**SHA dell'intervento grafico:** `7867d9455e73e78584b48546e4337738decd210a`.

---

## 5. Tracciamento continuo dello swipe nella bottom bar — 8 settembre 2026

**Difetto segnalato da Cwe:** lo swipe tra le icone veniva risolto soltanto al
rilascio e procedeva per scatti, senza mostrare chiaramente la posizione
raggiunta mentre il dito era ancora sullo schermo.

**Correzione applicata:** aggiunto un indicatore oro che segue linearmente la
posizione del dito lungo la bottom bar. Durante il trascinamento l'icona attiva
si aggiorna al superamento del centro di ogni voce; al rilascio l'indicatore si
assesta con una breve transizione sulla posizione più vicina. Un singolo gesto
può continuare ad attraversare più voci. I movimenti prevalentemente verticali
restano riservati allo scorrimento della pagina e il click diretto sulle icone
continua a funzionare.

**Separazione confermata:** modificato soltanto `restyling-preview.html`;
`index.html`, motore, database e configurazioni funzionali sono invariati.

**Verifiche:** `git diff --check` pulito e parsing completo dello script inline
con Node.js riuscito.

**File modificato:** `restyling-preview.html`.

**SHA dell'intervento grafico:** `094b636871b6cd6f896bde4c87ad7a557613e70a`.

---

## 6. Inversione del verso dello swipe nella bottom bar — 8 settembre 2026

**Difetto segnalato da Cwe:** il movimento della selezione risultava opposto
alla direzione del dito.

**Correzione applicata:** invertito il calcolo della posizione durante il
trascinamento. Muovendo il dito verso destra la selezione procede ora verso
destra; muovendolo verso sinistra procede verso sinistra. Tracciamento continuo,
selezione dell'icona più vicina al rilascio e distinzione dallo scroll verticale
restano invariati.

**Separazione confermata:** modificato soltanto `restyling-preview.html`;
`index.html` e tutti i file funzionali restano invariati.

**Verifiche:** `git diff --check` pulito e parsing dello script inline con
Node.js riuscito.

**File modificato:** `restyling-preview.html`.

**SHA dell'intervento grafico:** `c2859084aba173d047cfe996044ffc4241c0a9d7`.

---

## 7. Modalità piatti speciali e carosello infinito — 8 settembre 2026

**Obiettivo autorizzato da Cwe:** usare la stella accanto al lucchetto per
aprire, con roll verticale, una lista orizzontale di piatti speciali; rendere il
carosello infinito, trasformare `Cambia piatto` in `Imposta come pasto` con un
richiamo rosso pulsante e aggiungere luci colorate animate al frame. I piatti
speciali non devono mostrare valori nutrizionali.

**Intervento effettuato:** la stella apre e chiude la modalità speciale con la
stessa animazione verticale della card. Il catalogo dimostrativo contiene pizza
alle verdure grigliate, torta salata con verdure e sushi misto. Il carosello usa
copie di raccordo alle estremità e riallineamento invisibile, così swipe e
freccia possono continuare in entrambe le direzioni senza un ritorno visibile.
Il comando di cambio diventa `Imposta come pasto`, con alone rosso pulsante, e
conferma la proposta attualmente visualizzata. Una cornice con gradiente
multicolore ruota attorno alla modalità speciale e scompare all'uscita. Nella
scheda Dettagli di una proposta speciale il blocco `Valori nutrizionali` viene
nascosto; non è stato inserito alcun testo sostitutivo in attesa della decisione
di Cwe.

**Asset aggiunti:** tre WebP 960×536 ottimizzati, circa 168 KB complessivi:
`speciale-pizza-verdure.webp`, `speciale-torta-salata-verdure.webp` e
`speciale-sushi-misto.webp`.

**Separazione confermata:** la modalità usa esclusivamente contenuti
dimostrativi nella preview. `index.html`, motore, database e IndexedDB restano
invariati.

**Verifiche:** `git diff --check` pulito; parsing dello script inline con
Node.js riuscito; presenza e formato dei tre asset controllati.

**File modificato:** `restyling-preview.html`.

**File aggiunti:** i tre asset WebP elencati sopra.

**SHA dell'intervento grafico:** `05262dfc67f5831211c47c7094be0ef16e527718`.

---

## 8. Rifinitura del frame e del loop dei piatti speciali — 8 settembre 2026

**Difetti segnalati da Cwe:** la cornice animata non comprendeva il titolo del
pasto; il carosello mostrava un ritorno a capo invece della prosecuzione
apparente `1 → 2 → 3 → 1`; i pallini non erano desiderati nella modalità
speciale. Il ridimensionamento richiesto riguardava esclusivamente il bagliore
rosso, non il pulsante né il testo.

**Correzione applicata:** la cornice multicolore è stata spostata sull'intera
card, includendo l'intestazione `COLAZIONE`, `PRANZO` o `CENA`. I pallini vengono
nascosti soltanto durante la visualizzazione degli speciali. Il raccordo tra le
copie terminali del carosello forza ora un riposizionamento istantaneo,
disattivando temporaneamente lo `scroll-behavior: smooth`: prima e ultima copia
sono visivamente identiche e non viene mostrato alcun riavvolgimento. Il
pulsante `Imposta come pasto` conserva dimensioni e testo approvati; sono stati
ridotti soltanto spessore, espansione, ombra e pulsazione dell'alone rosso.

**Separazione confermata:** modificato soltanto `restyling-preview.html`;
`index.html`, motore, database e IndexedDB restano invariati.

**Verifiche:** `git diff --check` pulito e parsing dello script inline con
Node.js riuscito.

**File modificato:** `restyling-preview.html`.

**SHA dell'intervento grafico:** `3a9f0e4bc818881a34391f9484391a9d3dc6e351`.

---

## 9. Stato persistente e rotazione della stella speciale — 8 settembre 2026

**Obiettivo autorizzato da Cwe:** conservare separatamente il pasto speciale
impostato e quello predefinito dal sistema. Dopo la conferma la modalità
speciale deve restare aperta mostrando il piatto selezionato; la stella deve
permettere di tornare al pasto di sistema e deve ruotare quando è attiva. La
stella interna deve inoltre essere ingrandita del 50% rispetto alla misura
originale, senza modificare il cerchio.

**Intervento effettuato:** la conferma non chiude più la card e trasforma il
comando in `Pasto speciale impostato`, interrompendo il richiamo rosso. Il piatto
speciale selezionato viene conservato separatamente dal set originale; chiudendo
la modalità con la stella torna visibile il pasto predefinito, mentre una nuova
apertura riparte dallo speciale confermato. Alla stella sono stati aggiunti i
binding `meal.systemDefault`, `meal.specialSelection` e
`meal.specialModeOpen`, l'azione `toggle-special-mode` e gli invarianti per la
futura persistenza. Durante lo stato attivo ruota soltanto la stella interna,
con un giro lineare ogni 2,8 secondi; il cerchio rimane fermo. La dimensione
mobile dell'SVG passa dal 68% al 102% del cerchio, incremento esatto del 50%
rispetto alla misura originale.

**Separazione confermata:** modificato soltanto `restyling-preview.html`;
`index.html`, motore, database e IndexedDB restano invariati.

**Verifiche:** `git diff --check` pulito; parsing dello script inline con
Node.js riuscito; presenza dei metadata e dell'animazione verificata.

**File modificato:** `restyling-preview.html`.

**SHA dell'intervento grafico:** `4cab93570292b61b207592e1b79ca8a88476d24c`.

---

## 10. Margine inferiore del carosello speciale — 8 settembre 2026

**Correzione richiesta da Cwe:** dopo la rimozione dei pallini, evitare che la
stella arrivi a contatto con la fascia delle immagini speciali.

**Intervento effettuato:** aggiunto un margine inferiore esatto di 8 px alla
sola fascia immagini quando la card è in modalità speciale. Le card normali,
le dimensioni della stella e gli altri spazi restano invariati.

**Separazione confermata:** modificato soltanto `restyling-preview.html`;
`index.html` e tutti i file funzionali restano invariati.

**Verifiche:** `git diff --check` pulito e parsing dello script inline con
Node.js riuscito.

**File modificato:** `restyling-preview.html`.

**SHA dell'intervento grafico:** `e2fbfda8011df5075145bf2911b5d52337ecd337`.

---

## 14. Cornice fissa del restyling — 8 settembre 2026

**Correzione richiesta da Cwe:** mantenere il nuovo Menù editoriale, il nuovo
header compatto e la nuova bottom bar, rendendo entrambe le cornici fisse mentre
scorre esclusivamente il contenuto centrale.

**Intervento effettuato:** annullato il precedente ripristino estetico; sono
stati mantenuti proporzioni, disposizione e ordine del nuovo header. Header e
bottom navigation sono fissati rispettivamente al bordo superiore e inferiore,
con compensazione dello spazio del contenuto su desktop e mobile. La nuova
composizione del Menù non è stata modificata.

**Separazione confermata:** `index.html`, motore, database e IndexedDB restano
invariati.

**Verifiche:** `git diff --check` pulito; parsing JavaScript riuscito;
`index.html` invariato.

**File modificato:** `restyling-preview.html`.

**SHA dell'intervento grafico:** `8aa2d170a9cc67f09288b105bd9ad506f3462e79`.

---

## 13. Menù editoriale su riferimento A e nuovo header — 8 settembre 2026

**Obiettivo richiesto da Cwe:** ricostruire il Menù settimanale seguendo come
riferimento metrico la proposta A approvata e adeguare anche proporzioni e
disposizione dell'header comune.

**Intervento effettuato:** sostituita la precedente vista dimostrativa con una
composizione editoriale comprendente testata `Il mio menù`, selettore settimana,
fascia di equilibrio nutrizionale, giornata corrente fotografica a tre colonne
e giornate successive compatte. L'header dispone ora logo, foglia, saluto e
avatar nello stesso ordine del riferimento e usa un'altezza ridotta. Conservati
i metadata destinati al futuro collegamento con i dati funzionali.

**Separazione confermata:** nessun intervento su `index.html`, motore, database
o IndexedDB. I contenuti alimentari restano dimostrativi e non costituiscono
regole funzionali.

**Verifiche:** `git diff --check` pulito; parsing JavaScript riuscito; confronto
tramite screenshot reale e misurazione DOM di header, testata, riepilogo,
giornata espansa, giornate compatte e bottom bar.

**File modificato:** `restyling-preview.html`.

**SHA dell'intervento grafico:** `e43d7fc1fed3ef93833b556a7fccc41eab35ffb9`.

---

# Filone: Ritiro dell'implementazione anticipata dei profili vegetariano/vegano

## 1. Commit `46eccab` — annullato il commit `ee58cc8` (e il suo fix `cfd0637`), fuori scope

**Motivo:** il commit `ee58cc8` ("Profili alimentari: vegetariano e
vegano non ereditano più i limiti proteici pensati per l'onnivoro")
implementava logiche definitive per i profili vegetariano e vegano
(`proteinFrequenciesByProfile`, `proteinDailyDiversificationRequired`,
la relativa gestione nel Setting nutrizionista e nel Set utente, e i
test che rendevano operative le settimane vegetariana e vegana) senza
autorizzazione esplicita di Cwe per quello scope. L'ultima precisazione
di Cwe chiarisce che lo sviluppo in corso riguarda **esclusivamente il
profilo onnivoro**: vegetariano e vegano saranno sviluppati
successivamente con logiche e impostazioni definite insieme al
nutrizionista.

**Azione:** annullate esclusivamente le modifiche introdotte dai
commit `ee58cc8` e `cfd0637` (revert pulito, nessun conflitto: nessun
commit intermedio tra `70eeeff` ed `ee58cc8` toccava gli stessi file
sorgente). Non toccati i commit grafici precedenti e successivi. Non
annullato il commit `70eeeff`, che resta integralmente valido.

**Rimosso:** `proteinFrequenciesByProfile`, `proteinDailyDiversificationRequired`,
`verificaFattibilitaSettimanale`, la gestione dedicata
vegetariano/vegano in `nutrition-config.js`/`engine-core.js`/`motor-v12.js`,
le modifiche al Setting nutrizionista (`renderRigheFrequenzeProteiche`)
e al Set utente relative ai profili, i test introdotti o riscritti per
rendere operative le settimane vegetariana e vegana, il capitolo "Filone:
Profili alimentari — limiti onnivori applicati impropriamente a
vegetariano/vegano" precedentemente aggiunto a questo registro.

**Resta integralmente valido (commit `70eeeff`, non toccato da questo
ritiro):**
- 0 scelte utente → completa automaticamente con 2 categorie differenti;
- 1 scelta → conserva quella scelta e completa con una categoria differente;
- 2 scelte → conserva entrambe;
- pranzo e cena hanno sempre categorie proteiche differenti;
- nessuna semantica `maxProteinSourcesPerDay`.

Nessuna reinterpretazione o correzione di vegetariano/vegano eseguita
in questo intervento: i due profili tornano al comportamento del
commit `70eeeff` (dichiarati incompatibili quando restano meno di due
categorie ammesse), senza alcuna nuova segnalazione dell'incompatibilità
- saranno sviluppati in un intervento successivo con logiche e
impostazioni definite insieme al nutrizionista.

**File modificati (tutti riportati esattamente allo stato precedente a
`ee58cc8`):** `nutrition-config.js`, `engine-core.js`, `motor-v12.js`,
`index.html`, `tests/lotto-proteine-autocompletamento.test.js`,
`tests/lotto-proteine-giorno-esclusione.test.js`,
`tests/lotto-set-proteine-buildgrid.test.js`,
`tests/lotto-set-proteine-validazione.test.js`,
`tests/nutrition-config.test.js`, `docs/REGISTRO_MODIFICHE.md` (rimosso
il capitolo aggiunto da `ee58cc8`).

**Verifiche eseguite:**
```
node tests/lotto-proteine-autocompletamento.test.js  → ok (torna al contenuto e al comportamento del commit 70eeeff)
node --check nutrition-config.js                       → OK
node --check engine-core.js                             → OK
node --check motor-v12.js                                → OK
git diff --check                                          → pulito
```
Verificato con ricerca globale: nessuna occorrenza residua di
`proteinFrequenciesByProfile`, `proteinDailyDiversificationRequired`,
`verificaFattibilitaSettimanale`, `renderRigheFrequenzeProteiche`.
`maxProteinSourcesPerDay` presente solo nei commenti storici già
esistenti dal commit `70eeeff`, nessuna reintroduzione della semantica
eliminata.

**SHA finale:** `46eccab632a521df71dc63768f207593c28623d2`.

---

# Filone: Tetto cumulativo carboidrati limitati configurabile ad personam

Riguarda: `nutrition-config.js`, `engine-core.js`, `index.html` (Setting
nutrizionista e Set utente) — decisione definitiva di Cwe: il tetto
cumulativo settimanale dei carboidrati limitati resta (default 3), ma
diventa configurabile per il singolo utente dal nutrizionista; è una
regola applicativa APP-CWE, non derivata dal PDF.

## 1. Commit `40cb0ba` — campo canonico `limitedCarbTotalMax` risolto lungo tutta la catena

**Stato precedente:** il valore era rigido a 3 ovunque -
`nutrition-config.js` confrontava le occorrenze FIXED direttamente con
`APP_DEFAULTS.limitedCarbTotalMax` (mai un valore per-utente);
`index.html` inizializzava `CONFIG_CARB_TETTO_LIMITATI` una sola volta
all'avvio dallo stesso default fisso (contatore, disabilitazione celle
e validazione del Set usavano quindi sempre 3); mancava un campo
dedicato nel Setting nutrizionista; `engine-core.js` (`buildCarbGrid`)
non riceveva alcuna configurazione dal chiamante.

**Modifica:**
- `nutrition-config.js`: nuova `resolveLimitedCarbTotalMax(config,errors)`
  — legge `nutritionist.config.limitedCarbTotalMax`; usa 3 quando il
  campo è assente o `null` (configurazioni storiche si risolvono
  automaticamente con 3, nessuna migrazione); valida che sia un intero
  0-14, altrimenti accoda un errore esplicito (`resolved.valid=false`)
  senza mai clampare o salvare il valore non valido. `resolveCarbohydratePlan`
  ora riceve il valore risolto come parametro e lo usa per la
  validazione delle occorrenze FIXED (mai più un confronto diretto con
  `APP_DEFAULTS.limitedCarbTotalMax`, che resta solo il default quando
  il campo è assente). Nuovo campo `resolved.limitedCarbTotalMax`
  nell'oggetto finale — unica fonte autorevole.
- `engine-core.js`: `buildCarbGrid` accetta ora un parametro `config` e
  lo inoltra a `validateCarbBudget` (che già leggeva correttamente
  `cfg.limitedCarbTotalMax` tramite `mergeConfig`, ma non lo riceveva
  mai dal chiamante). Nessun fallback locale diverso da 3, nessuna
  duplicazione di normalizzazione. **Nota:** `buildCarbGrid`/
  `validateCarbBudget` risultano privi di chiamanti sia in `index.html`
  sia in `motor-v12.js` (verificato con ricerca globale) — la
  correzione resta comunque corretta e a rischio zero, coerente con
  quanto richiesto.
- `motor-v12.js`: **nessuna modifica necessaria** — non contiene una
  propria interpretazione del tetto; consuma già `resolved.carbohydrates`,
  derivato da `resolveCarbohydratePlan` (corretto al punto sopra),
  quindi eredita automaticamente il comportamento corretto e il
  messaggio d'errore con totale richiesto e tetto effettivo (già
  presente nella stringa di errore del resolver).
- `index.html` (Set utente): `CONFIG_CARB_TETTO_LIMITATI` trasformata
  da costante fissa a variabile di sessione (`let`), aggiornata da una
  nuova `aggiornaTettoCarbLimitatiSet()` — stesso pattern già in uso
  per le proteine (`caricaVincoliProteineSet`/`frequenzeProteineSetCorrenti`).
  Richiamata al boot (`caricaConfigCarboidrati`) e alla riapertura della
  vista Set (`mostraVista('set')`), così contatore, disabilitazione
  celle e completamento riflettono sempre il valore per-utente.
  `salvaConfigCarboidratiSet` corretta: prima non passava affatto la
  configurazione nutrizionista al resolver in fase di validazione
  pre-salvataggio (usava sempre il default 3 anche con un tetto
  personale diverso salvato); ora legge `configAvanzata` e valida col
  tetto realmente risolto. Verificato che il completamento automatico
  (Casuale/Completa carboidrati) non tocca mai le categorie limitate
  (solo quelle AUTO senza tetto individuale): nessuna modifica
  necessaria lì.
- `index.html` (Setting nutrizionista): un solo campo numerico aggiunto
  nella sezione "Regole applicative APP-CWE" (già esistente, coerente
  con la natura APP-CWE della regola) — etichetta "Tetto cumulativo
  carboidrati limitati", indicazione "Regola APP-CWE · totale
  settimanale", `min=0 max=14 step=1`, valore dalla configurazione
  effettivamente salvata/risolta (default grafico 3 solo quando il dato
  non esiste). Il salvataggio e l'invalidazione della configurazione
  runtime (`invalidaConfigRuntime()`) erano già generici e coprono
  automaticamente il nuovo campo, nessuna modifica necessaria lì. Il
  pulsante di reset del Setting (già esistente) usa
  `configAvanzataDefaultCanonico()`, che ora risolve correttamente
  `limitedCarbTotalMax:3` per il ripristino.

**Intervallo e semantica (0-14):** 0 = nessun carboidrato limitato
programmabile; 1-13 = tetto cumulativo effettivo; 14 = nessun limite
cumulativo praticamente restrittivo, restando comunque attivi i cap
individuali PDF delle singole categorie (verificato con un test
dedicato: un cap PDF individuale non viene mai superato anche con
tetto cumulativo 14).

**Compatibilità:** nessuna modifica allo schema IndexedDB, il campo
resta dentro `configAvanzata`; nessuna migrazione distruttiva;
configurazioni esistenti prive del campo si risolvono automaticamente
con 3 (verificato).

**File modificati:** `nutrition-config.js`, `engine-core.js`,
`index.html`, `tests/lotto-tetto-carboidrati-limitati.test.js` (nuovo).

**Verifiche eseguite:**
```
node tests/lotto-tetto-carboidrati-limitati.test.js  → ok (fallisce senza la correzione: campo assente non risolve 3, verificato; passa dopo)
node --check nutrition-config.js                       → OK
node --check engine-core.js                              → OK
validazione script index.html (node --check per blocco) → OK
git diff --check                                          → pulito
```
Il test copre: campo assente → 3; valore personale 5 → resolver,
contratto di sorgente del Set e stessa funzione usata dal motore
tutti coerenti con 5 (e le stesse occorrenze respinte col default 3,
a dimostrazione che il tetto applicato è quello personale); valore 0 →
nessun limitato ammesso; valori non validi (decimale, negativo, >14,
non numerico) → configurazione non valida con messaggio esplicito,
`null` esplicito trattato come campo assente (mai come 0 o errore);
cap individuali delle singole categorie invariati anche con tetto
cumulativo 14.

**Non modificati:** profili vegetariano/vegano, logica proteica,
cataloghi, ricette, quantità, cap individuali delle categorie
carboidrato, restyling grafico (nessuna sezione toccata oltre
l'aggiunta del singolo campo richiesto).

**SHA finale:** `40cb0ba11c6667be5bc6e4dcc3f5907c73cc05b8`.

---

# Filone: Collegamento reale al motore delle 5 preferenze del Set utente

Riguarda: `motor-v12.js`, `index.html` — collega realmente alla generazione
corrente cinque preferenze già scritte in IndexedDB ma finora ignorate
dal motore: `setProteineLimitate`, `setPocoTempo`, `cerealiNonGraditi`,
`setVerdurePreferite`, `setVerdureDisattivate`.

**SHA iniziale:** `045f175d627ff15e6898c358c0698b3034a2f3a5`.

## 1. Commit `cd8599c` — caricamento centralizzato e collegamento ai punti reali di scelta

**Problema riscontrato:** l'interfaccia scriveva correttamente le 5
configurazioni in `impostazioni`, ma `caricaConfigurazioneNutrizionaleRisolta()`,
`configRuntime()`, `poolAmmesso()`, la costruzione settimanale e
`rigeneraPasto()` non le leggevano mai. Alcune funzioni presenti in
`index.html` (`proponiRicettaAutomatica()`, `filtraContorniPerVerdureAttive()`,
`scegliComponentiSecondo()`, `filtraContorniPerPool()`) davano
l'impressione di applicarle, ma appartengono a un percorso precedente:
operano su un campo (`ricetta.componente`) che il motore attuale non
scrive mai su nessuna ricetta compilata — verificato con ricerca
esaustiva, zero chiamanti reali raggiungibili dalla generazione
corrente. `filtraContorniPerVerdureAttive()` contiene inoltre il
fallback esplicitamente vietato (`return filtrati.length?filtrati:contorni`,
riapre il pool non filtrato) — non attivo su alcun percorso vivo, ma
segnalato come richiesto.

**Architettura implementata:** un solo punto di caricamento,
`caricaPreferenzeUtenteSet()` (nuova, in `motor-v12.js`) — un'unica
lettura di tutte e 5 le chiavi IndexedDB per operazione, mai dentro i
cicli dei candidati. Risolve `setVerdurePreferite` (nomi storici,
formato persistente invariato) verso i relativi `variantId` una sola
volta, tenendo solo le varianti che sono realmente verdura. Agganciata
a `configRuntime()` come proprietà separata `userPreferences`, stessa
cache di sessione già in uso per allergie/vincoli/tetti — nessuna
seconda configurazione nutrizionale, nessuna duplicazione tra
`index.html` e `motor-v12.js`. Invalidazione: aggiunta una chiamata a
`invalidaConfigRuntime()` in tutti e 5 i punti di scrittura del Set in
`index.html` (6 scritture totali: `setProteineLimitate` 1,
`setPocoTempo` 1, `setVerdurePreferite` 2, `setVerdureDisattivate` 1,
`cerealiNonGraditi` 1), perché la modifica diventi effettiva subito,
senza attendere un riavvio.

**Comportamento implementato per ciascuna chiave:**

1. **`setVerdureDisattivate` (esclusione hard).** Filtro aggiunto in
   `ricettaAmmessa()` — l'unico chokepoint universale del motore,
   usato da `poolAmmesso()` (settimana, rigenerazione) e già usato da
   `alternativeRollV/C/P` (Roll): un `variantId` disattivato in una
   ricetta esclude sempre la ricetta, nessun fallback, nessuna
   riapertura del pool. Coperto automaticamente: generazione
   settimanale, rigenerazione, `rigeneraPasto` (Alternativa/cambio
   piatto/Salvafrigo passano tutti da qui), Roll. Se il filtro rende
   impossibile un pasto, l'errore esplicito già esistente
   ("Nessuna composizione valida...") si propaga senza alcuna modifica
   aggiuntiva: nessun percorso genera un piano parziale.
2. **`setProteineLimitate` (preferenza negativa, al più una
   categoria).** `opzioniProteinaPerSlot()` riordina l'array `targets`
   restituito (non sgradite prima, sgradita per ultima — un pool
   ordinato, nessun peso numerico); il chiamante prova già ogni target
   in ordine fino al primo che chiude una composizione valida. La
   cella fissata a mano in tabella resta invariata, mai annullata dalla
   preferenza.
3. **`cerealiNonGraditi` (preferenza negativa, per `ingredienteId`).**
   `cercaCarboSeparato()`: per i soli candidati AUTO (mai FIXED)
   riordina sia le chiavi carboidrato (`autoCandidati`, quando *tutti*
   i candidati di una chiave contengono un cereale non gradito) sia le
   ricette all'interno di una chiave già scelta. Collegamento sempre
   tramite `ingredienteId`, mai per nome. **Limite noto e non risolto**:
   il percorso "PX+C già combinato" (proteina che incorpora già un
   carboidrato AUTO, dentro `costruisciPastoSequenziale`) non applica
   questa preferenza — resta scoperto per la sola combinazione già
   fusa in un'unica ricetta P+C, un caso strutturalmente meno comune
   del carboidrato separato. Segnalato qui invece di essere corretto
   senza autorizzazione, per restare nella correzione minima.
4. **`setVerdurePreferite` (preferenza positiva).** Nomi risolti in
   `variantId` una sola volta (vedi sopra). `ordinaVerdureProgrammazione()`
   (usata da `completaResiduoVerduraRicette()`, a sua volta usata da
   `chiudiPastoConVerdura()` e da `normalizzaRealizzazioniVerdura()`,
   sia nella costruzione sequenziale sia nel Roll) applica la
   preferenza *dopo* aver ordinato per deperibilità/programmazione
   (invariata): tra soluzioni complete e valide, quelle con una
   verdura favorita vengono provate prima; se nessuna la contiene,
   l'ordine esistente resta l'unico criterio. Mai un obbligo, mai una
   modifica alla formula/quantità V/S/G.
5. **`setPocoTempo` — condizione di arresto, non implementata.** La
   preferenza viene caricata da `caricaPreferenzeUtenteSet()` per
   trasparenza (visibile in `userPreferences.pocoTempo`), ma non
   altera alcun ordine di scelta. Verificato con ricerca esaustiva dei
   campi disponibili in `db-ricette.json` (`categoria, classe,
   composizioni, condimentiCompatibili, cotture, dose, gruppi,
   ingredienti, mostraNomi, roll, stack, stackScope, testo1, testo2`)
   e `ingredienti-new.json` (`allergeni, ancheColazione, bloccoManuale,
   carboidrati, conservazione, cooldownGiorni, deperibilita,
   fonteNutrizionale, formato, formatoRiordino, gradimento, grassi,
   gruppo, kcal, nonRichiedeInventario, notaPorzione,
   pesoPorzioneGrammi, porzione, proteine, quantificabile,
   sottoCategoriaColazione, sottotipo, stock, unitaPorzione`): **nessun
   campo strutturato distingue preparazioni fredde/rapide/compatibili
   pane-friselle**, solo nomi liberi di cottura testuali ("al forno",
   "in insalata", "sode", ecc.). L'incarico vieta esplicitamente di
   dedurre la rapidità dal nome della ricetta o della cottura, e vieta
   di inventare nuovi campi nel catalogo: condizione di arresto
   applicata, nessuna implementazione, nessuna scelta autonoma di una
   soluzione alternativa.

**Funzioni legacy lasciate presenti, non usate per la correzione (zero
chiamanti reali dimostrato, nessuna pulizia effettuata per restare
nella correzione minima):** `proponiRicettaAutomatica()`,
`filtraContorniPerVerdureAttive()` (con il fallback vietato, ma su un
percorso morto), `scegliComponentiSecondo()`, `filtraContorniPerPool()`
— tutte in `index.html`.

**Funzioni modificate:** `motor-v12.js` — nuova `caricaPreferenzeUtenteSet()`;
`configRuntime()` (nuova proprietà `userPreferences`); `ricettaAmmessa()`;
`opzioniProteinaPerSlot()`; `cercaCarboSeparato()`; `ordinaVerdureProgrammazione()`;
`completaResiduoVerduraRicette()`; `normalizzaRealizzazioniVerdura()`;
`ruotaPasto()` (propagazione preferenze al Roll). `index.html` — 6
scritture del Set (invalidazione runtime aggiunta).

**Test eseguiti ed esito:** `tests/lotto-set-preferenze-runtime.test.js`
(nuovo, unico file integrato richiesto) — 8 scenari con la pipeline
reale (`generaPianoSettimana`/`rigeneraPasto`) e casualità controllata
(tentativi limitati, mai migliaia di generazioni): tutti verdi,
verificato fallire sul codice precedente e passare dopo la correzione.
Lo scenario 6 ("poco tempo") verifica solo che impostare la preferenza
non alteri/blocchi la generazione, coerente con la condizione di
arresto — non è una prova che la preferenza "funzioni", perché non è
implementata.
```
node tests/lotto-set-preferenze-runtime.test.js  → ok
node tests/lotto-g-weekly-generation.test.js      → ok (vedi nota sotto)
node tests/lotto-e-root-user-set.test.js          → ok
node --check motor-v12.js                          → OK
validazione script index.html                      → OK
git diff --check                                    → pulito
```
**Nota su `lotto-e-root-user-set.test.js`**: è in parte un test
*statico* (verifica per sottostringa la presenza di determinati
pattern nel sorgente di `index.html`/`motor-v12.js`), in parte un test
funzionale reale sul resolver dei carboidrati — dichiarato qui come
richiesto, non presentato come prova funzionale completa.

**Nota su `lotto-g-weekly-generation.test.js`**: durante la verifica
finale è emersa una flakiness nello scenario limite "verdura ricorrente
obbligatoria per tutti e 7 i giorni di pranzo" (un vincolo già di per
sé al limite della fattibilità). Con un confronto interlacciato a
campione (20 esecuzioni per versione, codice corrente vs commit
`045f175` prima di questo intervento) il tasso di successo è stato
16/20 con questo intervento contro 18/20 senza — una differenza che
rientra nel rumore statistico atteso per un campione di questa
dimensione (il generatore non usa un seed fisso). Non è stata isolata
alcuna causa deterministica riconducibile alle modifiche di questo
intervento nonostante un'analisi mirata (bisection su
`ordinaVerdureProgrammazione`, che in assenza di `setVerdurePreferite`
configurato esegue un ritorno anticipato senza alcuna differenza di
comportamento). Il test passa in modo affidabile nella maggioranza
delle esecuzioni in entrambe le versioni.

**Non modificati:** tabelle carboidrati/proteine (logica già corretta
nei filoni precedenti, non riaperta), `db-ricette.json`,
`ingredienti-new.json`, schema IndexedDB, profili vegetariano/vegano,
`verduraRicorrente`/`verduraRicorrentePasti`/`colazionePreferita`/
`colazionePreferitaGiorni`/`colazioneIngredientiEsclusi`/
`tettiIngredienteSettimanali`/salvataggio atomico del Set/protezione
uscita con modifiche non salvate (tutti verificati invariati e
funzionanti, vedi scenario 7 del test).

**SHA finale:** `cd8599c358a553c72f45ff4c01f14566f3f1f7b2`.

---

## 2. Commit `41d2897` — correzione: Patate, cereali non graditi su P+C, propagazione completa verdure preferite, semantica definitiva poco tempo, errore verdura ricorrente/non disponibile

**SHA iniziale di questo intervento correttivo:** `076378ad183ae632f6af8abf6a29fa1c3b8027b7`.

**Difetti rimasti nel commit `cd8599c` (diagnosi ricevuta, confermata):**
1. `setPocoTempo` veniva letto da `caricaPreferenzeUtenteSet()` ma intenzionalmente ignorato — nessun effetto sulla generazione.
2. `cerealiNonGraditi` veniva applicato solo al percorso "carboidrato separato" (`cercaCarboSeparato`), mai alle ricette concrete già combinate P+C.
3. `setVerdurePreferite` influenzava solo il residuo vegetale finale (`completaResiduoVerduraRicette`), non le fasi P/G, C/S o le ricette P+C+V combinate.
4. `Patate` veniva trattata come verdura sia in `index.html` (`renderSetVerdure`, con l'eccezione esplicita `v.nome.toLowerCase()==='patate'`) sia in `motor-v12.js` (`caricaPreferenzeUtenteSet`, stessa eccezione), nonostante catalogo (`gruppo:'carboidrati'`), baseline e specifica la classifichino come carboidrato — un vecchio `variantId` Patate in `setVerdureDisattivate` poteva quindi bloccare accidentalmente il carboidrato FIXED Patate.

I test del commit `cd8599c` erano inoltre in parte probabilistici (confronto tra medie di generazioni casuali) e non dimostravano la precedenza dichiarata in modo deterministico.

**Blocco 1 — Correzione Patate:**
- `index.html:renderSetVerdure()` — rimossa l'eccezione `||v.nome.toLowerCase()==='patate'`: la lista mostra esclusivamente varianti con `base.gruppo==='verdura'`.
- `index.html:renderSetPreferenzeMenu()` — nuovo insieme `nomiVerdureReali` (da `varianti`+`ingredienti`, `base.gruppo==='verdura'`), usato per filtrare sia le verdure stagionali sia quelle in inventario prima di proporle come preferite: Patate (e ogni altro carboidrato) non può più entrare in `setVerdurePreferite`.
- `motor-v12.js:caricaPreferenzeUtenteSet()` — nuova mappa `baseById`; sia `setVerdurePreferite` sia `setVerdureDisattivate` validano ora identicamente `base.gruppo==='verdura'`, nessuna eccezione per nome. Un vecchio `variantId` Patate già salvato in `setVerdureDisattivate` viene semplicemente ignorato dal runtime (nessuna migrazione, nessuna cancellazione del dato utente): disattivare una verdura non può più bloccare accidentalmente il carboidrato Patate FIXED.
- `renderSetVerduraRicorrente()` non toccata (già corretta, usava solo `base.gruppo==='verdura'`).

**Blocco 2 — `cerealiNonGraditi` completato su P+C:**
- Nuovo helper generico `stablePartition(arr,predicate)` (due `filter`, mai un `sort` su chiave booleana, mai un punteggio).
- `motor-v12.js:costruisciPastoSequenziale()` — nel percorso P+C.AUTO (proteina già combinata con un carboidrato AUTO-ammesso), i candidati vengono partizionati: prima quelli il cui carboidrato incorporato non appartiene a `cerealiNonGraditiIds`, poi gli altri — mai eliminati. Il percorso P+C.user (FIXED) resta interamente fuori da questa partizione, invariato: una richiesta FIXED resta sempre superiore alla preferenza negativa. Collegamento sempre tramite `ingredienteId`, mai per nome. Ordine strutturale invariato: P+C.user → P libero + C.user → P+C.AUTO/P libero + C.AUTO (verificato da `tests/lotto-carboidrati-priorita-pxcuser.test.js`, 100/100 generazioni).

**Blocco 3 — `setVerdurePreferite` propagato a tutte le fasi:**
- Nuovo helper centralizzato `ordinaPerVerdurePreferite(pool,preferredVariantIds)` — riceve un pool già filtrato e valido, sposta in testa (partizione stabile, mai un'eliminazione) i candidati che contengono almeno un `variantId` preferito tra i loro ingredienti, qualunque sia il ruolo (P/G, C/S, V); accetta anche candidati-pasto composti da più ricette.
- Applicato a: pool proteico generale in `costruisciPastoSequenziale()` (copre sia P+C.user sia ogni "P con G o V", sempre dopo la priorità inventario di Salvafrigo quando presente — `applicaPrioritaInventario` restituisce già un solo livello alla volta, quindi riordinare dopo resta sempre "tra candidati dello stesso livello"); ricette P+C.AUTO (rifinisce, dopo la partizione dominante per cereali non graditi); ricette carboidrato separate in `cercaCarboSeparato()` (sia FIXED sia AUTO); `ordinaVerdureProgrammazione()` (ora delega all'helper — copre sia il residuo V di `completaResiduoVerduraRicette()` sia le ricomposizioni automatiche dopo Roll, già agganciate nel commit precedente).
- Verdura ricorrente e vincoli hard restano sempre dominanti: la preferenza opera solo tra candidati già validati da `chiudiPastoConVerdura` (che verifica `ctx.requiredVegetableVariantId` indipendentemente dall'ordine di tentativo) — nessuna modifica a questa validazione.

**Blocco 4 — `setPocoTempo` implementato (semantica applicativa, non temporale):**
- Nuovo helper puro `ordinaCarboidratiPerPocoTempo(carbCandidati,residuiFissi,pocoTempoAttivo)` — se `pocoTempoAttivo` è falso restituisce l'ordine invariato; se vero produce quattro livelli (FIXED rapidi pane/friselle, altri FIXED, AUTO rapido solo "pane", altri AUTO), ordine relativo preesistente conservato in ciascun livello. Friselle non è mai introdotta come AUTO (ha un tetto PDF, può comparire solo se già in `residuiFissi`).
- `ctx.pasto` propagato da tutti i chiamanti vivi di `costruisciPastoSequenziale()`: `risolviSettimanaSequenziale()` (tramite `ctxPasto`), `rigeneraPasto()`, `risolviSlotSingolo()`; per transitività anche `completaPastoConBloccate()` (lucchetti, non modificata direttamente — riceve `ctx.pasto` già valorizzato dal chiamante e delega a `costruisciPastoSequenziale()` per i ruoli non bloccati, comportamento preesistente). Nessuna lettura IndexedDB introdotta nei cicli: il valore arriva già risolto da `ctx.runtimeConfig.userPreferences`.
- Testo UI in `index.html` sostituito: non promette più "preparazioni fredde" (nessun metadato di catalogo lo giustifica).

**Blocco 5 — Errore esplicito per verdura ricorrente disattivata:**
- `motor-v12.js:generaPianoSettimana()` — prima di generare, se `verduraRicorrente` è selezionata per almeno uno slot (`verduraRicorrentePasti` non vuoto) e la stessa variante è tra le vere verdure disattivate (già validate `base.gruppo==='verdura'`, Patate esclusa), restituisce `{generati:[],errori:['La verdura ricorrente selezionata risulta non disponibile. Riattivala oppure modifica la programmazione ricorrente.']}` senza generare nulla — nessuna riabilitazione, nessuna scrittura parziale (verificato: zero record in `piano`).

**Test sostitutivo (unico file modificato, nessun altro creato):** `tests/lotto-set-preferenze-runtime.test.js` riscritto integralmente, eliminate tutte le verifiche probabilistiche ("compare almeno una volta entro N generazioni", confronto fra medie, verifica del solo massimo nutrizionale, test che considerava corretto `setPocoTempo` perché non alterava nulla). 13 scenari deterministici, fixture minime + helper puri esportati (`stablePartition`, `ordinaPerVerdurePreferite`, `ordinaCarboidratiPerPocoTempo`, `caricaPreferenzeUtenteSet`) per gli ordinamenti; pipeline reale solo per filtro hard, errore esplicito e assenza di scritture (scenari 2, 3, 4, 8, 12, 13 — questi ultimi tre con soglie di conteggio deterministiche, mai medie). Verificato: il file fallisce sul codice del commit `cd8599c`/`076378a` (funzione `caricaPreferenzeUtenteSet` non ancora esportata, blocchi non implementati) e passa dopo questa correzione.

**Esito reale dei test eseguiti:**
```
node --check motor-v12.js                              → OK
node tests/lotto-set-preferenze-runtime.test.js         → ok (13/13 scenari, stabile su esecuzioni ripetute)
node tests/lotto-g-weekly-generation.test.js            → esito variabile, vedi nota sotto
node tests/lotto-carboidrati-priorita-pxcuser.test.js   → ok (100/100 generazioni, priorità P+C.user intatta)
node tests/lotto-e-root-user-set.test.js                → ok
git diff --check                                        → pulito
```

**Nota su `lotto-g-weekly-generation.test.js` (registrata come richiesto, senza attribuire automaticamente il fallimento al rumore):** in una delle esecuzioni di verifica finale il test è fallito sullo stesso scenario limite già documentato nella sezione precedente di questo registro ("verdura ricorrente obbligatoria per tutti e 7 i giorni di pranzo"). Non è stato semplicemente ripetuto fino al successo: è stato eseguito un confronto controllato e interlacciato (15 esecuzioni per versione) tra il codice corrente di questo intervento e il commit di partenza `076378a` (prima di questa correzione) — esito: 13/15 (87%) con questo intervento contro 11/15 (73%) con la versione precedente. Il codice corrente non mostra quindi un peggioramento della fattibilità rispetto alla baseline; la differenza osservata rientra nel rumore statistico atteso per un campione di questa dimensione (il generatore non usa un seed fisso). Nessun ordinamento introdotto in questo intervento risulta quindi aver alterato la fattibilità di questo scenario.

**File modificati (solo quelli ammessi):** `motor-v12.js`, `index.html`, `tests/lotto-set-preferenze-runtime.test.js`, `docs/REGISTRO_MODIFICHE.md`.

**Non modificati (invarianti rispettati):** resolver nutrizionale, frequenze/quantità, tabella carboidrati, tabella proteine, algebra V/S/G, rotazione proteica giornaliera, verdura ricorrente (logica di `verduraRicorrenteRichiesta`/`chiudiPastoConVerdura` invariata), lucchetti (`completaPastoConBloccate` non modificata direttamente), snapshot delle realizzazioni, inventario e spesa, `db-ricette.json`, `ingredienti-new.json`, schema IndexedDB, profili vegetariano/vegano, restyling grafico. `ricettaAmmessa()` non toccata (il filtro hard verdure disattivate era già corretto nel commit `cd8599c`).

**SHA finale:** `41d28974290c5c4c27edc31ef7a0c537662b6396`.

---
