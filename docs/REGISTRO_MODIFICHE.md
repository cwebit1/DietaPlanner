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
