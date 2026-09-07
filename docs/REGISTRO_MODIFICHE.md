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
- L'ordine posizionale in `motor-v12.js:targetTabellaPerSlot` (primo
  elemento dell'array `giorno_N` di `tabellaGiornoCategoria` = pranzo,
  secondo = cena) non riflette un'assegnazione esplicita pranzo/cena
  nell'interfaccia Set — comportamento del formato attuale, consistente
  da sempre, non un'incompatibilità storica: solo osservazione, nessuna
  modifica.

---
