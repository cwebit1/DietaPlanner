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
