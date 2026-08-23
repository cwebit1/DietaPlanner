# REPORT 2 — Analisi struttura logica: cosa dovrebbe fare vs cosa fa

Vedi `AUDIT-STATO-LAVORO.md` per indice e metodologia. Ogni punto qui è
riferito a file e, dove utile, a riga precisa (righe riferite allo stato
del repo al commit `4741ccf`, verificare che coincida prima di usarle come
riferimento esatto — il numero di riga si sposta ad ogni modifica).

Per ognuno: **cosa dovrebbe fare** (target dichiarato), **cosa fa
realmente** (verificato via lettura codice + esecuzione reale), **causa
precisa**, **peculiarità da rispettare se si interviene** (per non rompere
altro).

---

## §1. motor.js contiene funzioni duplicate — la prima metà del file è codice morto

**Fatto strutturale, causa radice di §3 e §4 sotto.**

motor.js dichiara con `function nome(){...}` (non `const nome = ...`) tre
funzioni **due volte ciascuna**:

| Funzione | Prima dichiarazione (morta) | Seconda dichiarazione (attiva) |
|---|---|---|
| `componiPastoModulare` | riga 66 | riga 101 |
| `generaPortateMotore` | riga 67 | riga 110 |
| `motoreV10CompletaDraftPerRealizzazione` | riga 72 | riga 111 |

In JavaScript, con `function` declarations ripetute nello stesso scope,
vale sempre l'**ultima dichiarazione testuale** (hoisting): tutte le
chiamate a questi tre nomi, da qualunque punto del codice, eseguono sempre
la versione alla riga 101/110/111, **mai** quella a 66/67/72.

La prima versione (66-72) è quella "v10 sughi modulari": usa sughi
generati (`scegliSugoMotore`), gestisce esplicitamente pane/patate come
casi speciali, produce un `classe: 'unico_completo'|'multi'` che però non
viene mai salvato/consultato da nessuna parte (verificato: nessun
riferimento a `.classe` proveniente da questo campo in tutto index.html).

La seconda versione (101-111) è quella "v78 — algebra di copertura":
lavora per token P/C/V (`completaRealizzazioniCopertura`), non ha nessuno
dei casi speciali (affettati, patate) della prima versione.

**Target di funzionamento:** o le due versioni vengono fuse (portando i
casi speciali mancanti nella versione attiva — vedi §3, §4), oppure la
prima versione va eliminata esplicitamente per chiarezza, così che chi
legge il file non trovi due implementazioni contrastanti con lo stesso nome.

**Peculiarità da rispettare se si interviene:**
- Rimuovere la prima versione è **sicuro dal punto di vista del
  comportamento a runtime** (è già irraggiungibile), ma va fatto con
  attenzione perché usa funzioni di supporto (`scegliSugoMotore`,
  `motoreV10ScegliPrimoReale`, `componiNomePrimoModulare`,
  `componiNomeSecondoModulare`, `scegliCotturaStandard` — quest'ultima
  ridefinita anch'essa più avanti come `function scegliCotturaStandard(){
  return null; }`, quindi **anche le "cotture" sono disattivate nella
  versione attiva**) che potrebbero diventare a loro volta codice morto se
  rimosse insieme: **verificare prima, funzione per funzione, se sono
  richiamate anche da altro** (es. da index.html) prima di cancellarle.
- Se invece si sceglie di portare i casi "affettati"/"patate" nella
  versione attiva (101+), **non riportare la logica dei sughi modulari**
  insieme: la versione attiva usa un modello concettualmente diverso
  (algebra di copertura a token, non composizione primo+sugo+secondo per
  nome) — mescolare i due modelli rischia di reintrodurre la stessa
  incoerenza vista nella nota "22.2 Modello senza eccezioni" di
  `REGOLE_FLUSSO_LOGICO.md`.

---

## §2. `automaticDayAllowed` blocca la generazione senza avviso quando "oggi" è nella settimana visualizzata

**File:** `engine-core.js`, funzione `automaticDayAllowed(day,today){return
String(day)>String(today);}` — usata in `motor.js`, dentro
`generaPianoSettimana`: `for(const day of days){if(!E.automaticDayAllowed
(day,today))continue;...}`.

**Cosa dovrebbe fare (target dichiarato):** `REGOLE_FLUSSO_LOGICO.md` §8,
regola 6.6: *"Generazione menù solo da domani in poi (giorno > oggi)."*
La funzione stessa implementa correttamente questa regola — **non è un bug
di logica**, è la regola richiesta.

**Cosa fa realmente (il problema):** quando TUTTI i giorni della settimana
attualmente mostrata sono `<= oggi` (caso concreto: si apre l'app un
qualunque giorno diverso da lunedì, o si preme "Genera menù" sulla
settimana corrente invece che sulla prossima), il ciclo salta ogni giorno
con un semplice `continue` — **non è trattato come errore**, quindi
`errors` resta vuoto e non scatta nessun `avviso()`. L'utente non riceve
alcun feedback.

Verificato empiricamente: `generaMenuDaConfigSet(0)` sulla settimana
17-23 agosto (oggi = 23) restituisce `{generati: [], errori: []}` mentre la
griglia proteica interna (`griglia.celle`) viene comunque calcolata
correttamente per tutti i 7 giorni — la regola "griglia" e la regola
"filtro giorni" sono disaccoppiate, e solo la seconda blocca silenziosamente.

**Target di funzionamento per un'eventuale correzione:** quando
`generati.length===0` per assenza di giorni futuri nella settimana
richiesta (non per un errore vero), l'utente dovrebbe ricevere un messaggio
esplicito tipo "Nessun giorno futuro in questa settimana: passa alla
settimana successiva per generare il menù", invece di silenzio totale.

**Peculiarità da rispettare se si interviene:**
- **Non cambiare la regola "giorno > oggi"** in sé: è una decisione
  esplicita e vincolante di Cwe (rule 6.5-6.6, "giorni passati: sola
  lettura, mai generati, mai presupposti"). L'intervento corretto è
  aggiungere un messaggio, non aggirare il filtro.
- Attenzione a **non generare un falso avviso** quando invece la settimana
  ha davvero già tutto programmato/bloccato (altro motivo legittimo per cui
  `generati` può restare vuoto: pasti già `consumato` o `bloccata` vengono
  correttamente saltati con `continue` più avanti nello stesso ciclo — va
  distinto il caso "niente da fare perché già tutto pieno/passato" dal
  caso "niente da fare perché non ci sono giorni generabili").

---

## §3. Regola "affettati → pane" assente nel codice attivo

**Target di funzionamento:** `REGOLE_FLUSSO_LOGICO.md` §4: proteina
affettati ⇒ carboidrato forzato a pane, sempre, senza eccezioni.

**Cosa fa il codice attivo:** `completaRealizzazioniCopertura` (motor.js,
riga ~103-109, versione vincente) sceglie il carboidrato **solo se manca**
il token `C` nella copertura delle ricette già scelte
(`missing.includes('C')` → `scegliRiempitivoCarbo`). Se la ricetta scelta
come proteina per il sottotipo "affettati" ha già `copertura` con `C` al
suo interno (es. "Risotto ... e pancetta", copertura `PC+C` — un risotto
contiene già riso), il ramo "riempitivo carboidrato" **non viene mai
eseguito**, quindi non c'è nessun punto in cui forzare "pane". La regola
esiste solo nella funzione morta (§1, riga 66: `subtype==='affettati'?
'pane':...`).

Verificato empiricamente: unico pasto affettati della settimana test
("Risotto piselli e pancetta", 24 agosto cena) → carboidrato **riso**, non
pane.

**Peculiarità da rispettare se si interviene:**
- La correzione va inserita **nel punto giusto della pipeline a token**,
  non riportando la vecchia logica "if hasPotato/if affettati" com'era: la
  versione attiva ragiona per copertura (P/C/V), quindi la scelta più
  coerente con l'architettura attuale è probabilmente **escludere a monte
  le ricette-proteina "affettati" che si autocoprono già il carboidrato con
  qualcosa che non sia pane** (o comunque intercettare il caso prima che
  `missing` risulti già "C soddisfatto"), non aggiungere un patch dopo.
- Attenzione: **non tutte le ricette "affettati" hanno necessariamente un
  C interno** — molte saranno probabilmente "solo P" (es. "Prosciutto
  crudo e melone" tipo). La correzione deve funzionare in ENTRAMBI i casi
  (quando manca C e quando C è già presente ma non è pane), non solo nel
  caso "manca C" già gestito.
- Verificare se questa regola deve valere anche quando l'affettato compare
  come **fallback "unico" senza carb** (`scegliProteinaModulareMotore` ha
  un ramo fallback che pesca da `tipoPortata==='unico'`) — capire se in
  quel ramo il comportamento atteso cambia.

---

## §4. Regola "patate nel secondo → piatto unico" assente nel codice attivo

**Target di funzionamento:** `REGOLE_FLUSSO_LOGICO.md` §4: patate come
ingrediente del secondo ⇒ sovrascrivono sia il carboidrato sia la verdura
richiesti, pasto diventa piatto unico.

**Cosa fa il codice attivo:** stessa causa di §3 — nessun controllo
esplicito "hasPotato" nella versione vincente. In più, un problema di dati
collegato: `REGOLE_FLUSSO_LOGICO.md` (nota "Correzione bug di calcolo
copertura") dichiara che le patate "sono già gruppo:carboidrati in
ingredienti.json, contribuiscono naturalmente a C" — cioè ci si aspetta che
la sigla `copertura` calcolata su una ricetta con patate includa già `C`.
**Verificato sui dati reali (`ricette.json`) che non è sempre così:**
tra le ricette `tipoPortata:'unico'` con patate come ingrediente, molte
hanno `copertura` che **non include `C`**, ad esempio:
```
"Branzino al forno con patate"        → copertura = "PP"      (manca C e V)
"Sovracosce di pollo al forno con patate" → copertura = "PC"  (manca C e V)
"Filetto di nasello con patate"       → copertura = "PP+C"    (manca V)
```
Su 93 ricette `tipoPortata:'unico'` **nessuna ha contemporaneamente C e V**
nella sigla — quindi anche a prescindere dalla regola patate, oggi nessuna
ricetta "unico" può mai risolvere da sola un intero pasto.

Verificato empiricamente sul piano generato: "Costine di maiale con patate
al forno" (30 agosto pranzo) compare insieme a un primo separato ("Farro
con verdure miste") e un contorno separato ("Zucchine grigliate").

**Peculiarità da rispettare se si interviene — questo è il punto più
delicato di tutto l'audit, leggere con attenzione:**
- Ci sono **due livelli distinti** da correggere, non uno solo:
  1. Un livello **di dati**: la sigla `copertura` statica delle ricette con
     patate dovrebbe includere `C` (coerente con "patate sono
     gruppo:carboidrati") — questo tocca `ricette.json`, non il motore.
  2. Un livello **di regola runtime**: anche con `copertura` corretta a
     `PX+C`, la regola dice che le patate sovrascrivono **anche la
     verdura**, quindi servirebbe che la sigla includa pure `V` per queste
     ricette — ma attenzione, `REGOLE_FLUSSO_LOGICO.md` è esplicito che le
     patate **non vanno mai forzate come "V presente"** nella sigla
     ("bug di calcolo copertura", già corretto in passato in senso
     opposto). Quindi il modo corretto di implementare "patate
     sovrascrivono anche la verdura" **non può** essere "aggiungere V alla
     sigla" — deve essere un caso speciale runtime separato dall'algebra di
     copertura generica (esattamente come faceva la versione morta con
     `hasPotato`), da reintrodurre nella pipeline attiva senza toccare il
     dato statico `copertura` in modo scorretto.
- **Non confondere questo caso con "patate scelte come cereale del budget
  settimanale"** (un'altra situazione, quando l'utente/motore sceglie
  "patate" come tipo di carboidrato per il pasto in generale) — sono due
  trigger distinti già distinti esplicitamente in `REGOLE_FLUSSO_LOGICO.md`
  §4: qui si parla solo del caso "patate dentro la ricetta del secondo".
- Prima di correggere in **massa** tutte le ricette con patate, verificare
  con Cwe se davvero **ogni** occorrenza di patate nel secondo deve
  diventare piatto unico, o se alcune ricette (es. "Branzino al forno con
  patate", dove le patate potrebbero essere una porzione ridotta di
  contorno più che un piatto unico "pieno") vanno guardate caso per caso —
  il PDF originale delle porzioni ("il PDF è la bibbia", già citato in
  REGOLE_FLUSSO_LOGICO) è la fonte da consultare, non un'assunzione
  automatica.

---

## §5. Il budget carboidrati (14 caselle) non copre i carboidrati "incorporati" in un secondo

**Target di funzionamento:** Set → Impostazioni Carboidrati promette un
controllo preciso e vincolante sulla distribuzione settimanale per tipo
(totale 14, un numero per tipo).

**Cosa fa il codice attivo:** il tracking del budget (`state.carbRemaining`,
`state.carbsUsed`) avviene **esclusivamente dentro `chooseCarb()`**
(engine-core.js), che è invocata **solo** da `scegliRiempitivoCarbo()`
(motor.js), che a sua volta viene chiamata da
`completaRealizzazioniCopertura` **solo se il token `C` risulta ancora
mancante** dopo aver scelto la proteina:
```js
if(missing.includes('C')){const c=await scegliRiempitivoCarbo(state,quick,excluded.carb);...}
```
Se la ricetta-proteina scelta **copre già `C` da sola** (es. "Cous cous con
sgombro e verdure", copertura `PP+C` — il cous cous è già dentro la
ricetta), questo ramo non viene mai eseguito: **il tipo di carboidrato
usato da quella ricetta non passa mai da `chooseCarb()`, quindi non
decrementa mai `state.carbRemaining`**. Il valore mostrato all'utente
(`primoCereale` sul pasto salvato) viene comunque calcolato — ma solo per
etichettare cosa si vede a schermo, tramite `chiaveCarboRicetta()`
(motor.js), **senza alcun collegamento al budget**.

Verificato empiricamente: nella settimana generata, **6 pasti su 14**
avevano `primoId: null` (cioè il carboidrato era già incorporato nel
secondo/proteina, non un "riempitivo" separato) — per questi 6, il tipo di
carboidrato non ha mai toccato il budget. Il conto quadra esattamente:
riso "in eccesso" di 2 unità e pane di 1 unità corrispondono proprio ai
pasti con `primoId: null` che casualmente usano riso/pane come ingrediente
del secondo.

**Target di funzionamento per una correzione:** il budget dovrebbe contare
**ogni** unità di carboidrato effettivamente servita nella settimana,
incorporata o no, non solo quelle scelte come "riempitivo" esplicito.

**Peculiarità da rispettare se si interviene:**
- Attenzione all'**ordine delle operazioni**: oggi il motore sceglie prima
  la proteina (che può già "portarsi dietro" un carboidrato), e solo dopo
  guarda cosa manca. Per far contare anche i carboidrati incorporati nel
  budget, serve o (a) decrementare il budget anche quando si sceglie una
  proteina la cui `copertura` include già `C` (leggendo il carboidrato
  reale dalla ricetta stessa, tramite `chiaveCarboRicetta`), oppure (b)
  **escludere a monte**, nel pool delle proteine papabili, quelle il cui
  carboidrato incorporato farebbe sforare un budget già esaurito per quel
  tipo. La opzione (a) è più semplice ma **rischia di creare vicoli
  ciechi**: se il budget per un tipo si esaurisce a metà settimana per
  colpa di un uso "incorporato" imprevisto, le richieste successive di
  quel tipo (dal budget) potrebbero non trovare più margine — bisogna
  decidere con Cwe cosa deve succedere in quel caso (tollerare lo
  sforamento? far fallire il pasto? penalizzare ma non escludere?).
- Non toccare la logica dei carboidrati "limitati" (`friselle`, `gnocchi`,
  `pasta_ripiena`, `taralli`, `piadina`, `pasta_sfoglia` — quelli con
  `limitato:true, tettoSettimanale:2` in `CARBOIDRATI_PASTO`, index.html):
  quel meccanismo di tetto è separato dal budget per-tipo di Set e sembra
  funzionare in modo indipendente (non ancora testato empiricamente in
  questa sessione, però — vedi "ancora da testare" in
  `AUDIT-STATO-LAVORO.md`).

---

## §6. "Pasta" e "pasta fresca" sono indistinguibili per `chiaveCarboRicetta()`

**File:** `index.html`, definizione `CARBOIDRATI_PASTO` (righe ~2205-2224):
```js
pasta:        { label:'Pasta',        ingrediente:'Pasta corta', ... }
pasta_fresca: { label:'Pasta fresca', ingrediente:'Pasta corta', ... }
```
Le due voci condividono **lo stesso ingrediente di riferimento** ("Pasta
corta"). La funzione `chiaveCarboRicetta()` (motor.js) fa:
```js
async function chiaveCarboRicetta(r){
  ...
  for(const k of Object.keys(CARBOIDRATI_PASTO)) if(carbInRecipe(r,k,vBy)) return k;
  return null;
}
```
Cioè scorre le chiavi **nell'ordine in cui sono dichiarate nell'oggetto**
e ritorna la prima che trova compatibile. Siccome `pasta` è dichiarata
prima di `pasta_fresca` e usano lo stesso ingrediente per il match,
**qualunque ricetta con "Pasta corta" risulterà sempre etichettata
"pasta"**, mai "pasta fresca", indipendentemente da quale delle due chiavi
fosse stata effettivamente scelta/budgetata da `chooseCarb()`.

**Target di funzionamento:** ogni tipo di carboidrato configurabile in Set
dovrebbe poter comparire ed essere riconosciuto correttamente nel piano
generato.

**Peculiarità da rispettare se si interviene:**
- La correzione più diretta è dare a `pasta` e `pasta_fresca` un
  **ingrediente distinguibile** nei dati (es. varianti/ingredienti diversi
  in `ingredienti.json`/`ricette.json` per "pasta secca" vs "pasta
  fresca"), non solo nel testo etichetta. **Questo tocca la libreria
  ricette/ingredienti**, quindi ha effetti a cascata su tutte le ricette
  esistenti che usano "Pasta corta" — serve capire con Cwe quali ricette
  sono concettualmente "pasta fresca" (es. tagliatelle, ravioli non
  ripieni) e quali "pasta secca", perché oggi probabilmente **nessuna
  ricetta nel database usa davvero un ingrediente "pasta fresca"
  distinto** (va verificato — non ancora controllato in questa sessione se
  esiste già un ingrediente "Pasta fresca" separato in `ingredienti.json`
  inutilizzato, o se manca del tutto).
- Alternativa più leggera (solo software, senza toccare i dati): far sì che
  `chiaveCarboRicetta()` **non riscriva** la chiave se quella
  originariamente scelta da `chooseCarb()` era già compatibile con la
  ricetta trovata — cioè, passare "quale chiave era stata richiesta" fino a
  `scegliRiempitivoCarbo` e preferirla se ancora valida, invece di
  ri-derivarla sempre da zero per prima-corrispondenza. Questo risolverebbe
  l'etichetta ma **non risolverebbe l'ambiguità di fondo** che pasta e
  pasta fresca sono davvero la stessa identica ricetta/ingrediente nel
  database — quindi il motore continuerebbe a non poter davvero
  "scegliere" una pasta fresca reale (con le sue ricette proprie) invece
  che una pasta secca.

---

## §7. I tetti per sottotipo proteico (`CAP_SOTTOTIPI_MOTORE`) si basano solo sullo storico passato, mai sulla generazione in corso

**File:** `motor.js`, `scegliSottotipoMotore()`:
```js
async function scegliSottotipoMotore(macro,state){
  const [all,rec]=await Promise.all([...]),
  caps=Object.assign({},CAP_SOTTOTIPI_MOTORE, rec...subtypeCaps||{}),
  counts=state.storico.sottotipiTotali||{};
  ...
  const under=pool.filter(s=>caps[s]===undefined||(counts[s]||0)<caps[s]);
  ...
}
```
`counts` viene da `state.storico`, che è il risultato di
`costruisciStoricoConsumatiMotore()` — **calcolato una sola volta all'inizio
della generazione settimanale**, leggendo `consumoGiorno` (i pasti
**consumati in passato**). Durante il ciclo `for(const day of days){for(const
meal of [...]){...scegliSottotipoMotore...}}` in `generaPianoSettimana`,
questo `counts` **non viene mai aggiornato** man mano che nuovi pasti
vengono generati nella stessa passata. Risultato: il tetto "carne rossa ≤1"
protegge solo *tra una settimana e l'altra* (basandosi sul consumo storico
già registrato), **non protegge affatto dentro la stessa generazione**: se
il caso vuole che "carne_rossa" venga scelta due volte nella stessa
settimana appena generata (possibile perché a parità di conteggio storico
zero, la scelta tra i sottotipi ammessi è casuale/`shuffle`), il tetto non
se ne accorge.

Verificato empiricamente: 2 occorrenze di "carne_rossa" nella stessa
settimana generata (30 agosto pranzo e cena).

**Target di funzionamento:** il tetto dovrebbe valere sulla settimana nel
suo complesso, quindi deve contare anche le scelte già fatte **nella stessa
generazione in corso**, non solo quelle già consumate in passato.

**Peculiarità da rispettare se si interviene:**
- La correzione naturale è **incrementare un contatore in `state`** (non in
  `state.storico`, che rappresenta il passato) ogni volta che
  `scegliSottotipoMotore` assegna un sottotipo, e sommarlo a
  `counts` nel controllo `under`. Attenzione: **serve sommare, non
  sostituire** — il tetto deve tenere conto sia di quanto già consumato
  in passato nella stessa settimana solare (se rilevante) sia di quanto
  appena scelto in questa generazione, altrimenti si rischia di introdurre
  l'errore opposto (bloccare scelte legittime perché si conta due volte lo
  stesso pasto, o non contare affatto lo storico).
- Verificare bene la semantica esistente prima di cambiarla: capire se
  "tetto ≤1 a settimana" è inteso come *settimana solare* (fissa,
  lunedì-domenica) o come *finestra di 7 giorni generata* — dal codice
  attuale sembra riferirsi implicitamente alla singola passata di
  `generaPianoSettimana` più lo storico dei consumi, ma andrebbe confermato
  con Cwe cosa intende davvero la regola.
- Occhio a **`scegliMenoRecenteMotore`** (usata subito dopo per scegliere
  tra il pool `under`): usa `oldest()` con shuffle sui pari merito — se si
  aggiunge un contatore "di sessione", va passato correttamente anche a
  questa funzione per evitare che scelga comunque, per puro shuffle
  casuale, un sottotipo già al tetto ma rimasto nel pool per un bug di
  aggiornamento del contatore.

---

## §8. Parametri di configurazione definiti ma mai letti dal motore (dead config)

Verificato via ricerca esaustiva (`grep`) su `engine-core.js` e `motor.js`
per ciascun parametro presente in `DEFAULTS`/`CONFIG_AVANZATA_DEFAULT`
(index.html, riga 1893) e nella UI di Configurazione avanzata nutrizionista
(index.html, righe 1905-1945):

| Parametro | Definito in DEFAULTS | Editabile in UI | Letto dal motore (engine-core.js/motor.js) |
|---|---|---|---|
| `cooldownDays.carboidrati` / `.verdure` | ✅ | ✅ (righe 1919-1920) | ❌ **mai** |
| `maxProteinSourcesPerDay` | ✅ | ✅ (riga 1915) | ❌ **mai** |
| `fruit.min/max/portionMin/portionMax` | ✅ | ✅ (righe 1913-1914) | ❌ **mai** |
| `deadlines.pranzo/.cena` | ✅ | ✅ (riga 1920) | usato da una logica di scadenza **separata e indipendente**, non da questi valori (vedi nota sotto) |
| `oilGramsPerMeal` | ✅ | ✅ (riga 1915) | non risulta usato in generazione (probabile solo per calcolo nutrizionale display, non verificato a fondo) |

Nota sui "deadlines": esiste una logica reale di scadenza pasto/consumo
automatico in index.html (funzione che usa `FASCE_ORARIE_PASTO`, righe
~4760+), **ma non legge il valore configurato in `cfg.deadlines`** — usa
una propria costante `FASCE_ORARIE_PASTO` indipendente. Quindi anche questo
campo, pur avendo *una* logica di scadenza reale nell'app, non è collegato
al valore che l'utente crede di poter modificare in Configurazione
avanzata.

In aggiunta, **la funzione motore `E.automaticConsumptionAllowed`**
(engine-core.js, pensata esplicitamente per questo scopo, con tanto di
parametro `deadlineMs`) **non viene mai chiamata da nessuna parte
dell'app** — la logica reale di auto-consumo in index.html è stata
scritta in modo indipendente e duplicato, senza riusare questa funzione.

Altre funzioni pubbliche di `engine-core.js` risultate **mai chiamate**
fuori dal proprio file (verificato via grep su index.html + motor.js,
zero occorrenze oltre alla definizione stessa):
`hasMealContent`, `countSpecialMeals`, `withinWeeklyCap`,
`profileAllowsRecipe`, `automaticConsumptionAllowed`, `buildCarbGrid`,
`validateCarbBudget`, `shoppingDeficits`, `seeded`, `composeMeal`.

**Perché è rilevante:** sono tutte funzioni **testate** da
`tests/engine-core.test.js` (presumibilmente — da verificare quali test
coprono cosa), quindi "i test passano" può dare una falsa sicurezza:
testano funzioni che il prodotto reale non usa mai, mentre il
comportamento realmente eseguito (dentro motor.js/index.html) può avere
bug propri non coperti da alcun test unitario su queste funzioni.

**Target di funzionamento:** o questi parametri/funzioni vengono
effettivamente collegati alla generazione reale, oppure — se sono
volutamente feature "predisposte per il futuro" — andrebbero segnalati
come tali nell'interfaccia, per non far credere a Cwe (o a un futuro
utente con permessi da nutrizionista) che stiano già facendo effetto.

**Peculiarità da rispettare se si interviene:**
- Prima di "attivare" un parametro morto (es. far leggere `cooldownDays`
  al motore), verificare che il suo **significato inteso** sia ancora
  quello originale: sono passate diverse iterazioni di sviluppo (v78,
  v79...) da quando probabilmente questi valori sono stati introdotti;
  confermare con Cwe la semantica esatta attesa oggi prima di cablarli,
  invece di dedurla a posteriori dal solo nome del campo.
- Se si decide di **rimuovere** invece che collegare (per ridurre
  confusione), attenzione: `cooldownDays`, `maxProteinSourcesPerDay` e
  `fruit` sono referenziati anche da `REGOLE_FLUSSO_LOGICO.md` come regole
  dichiarate valide — rimuoverli dall'interfaccia senza prima chiarire con
  Cwe se la regola stessa va abbandonata o solo l'esposizione UI andrebbe
  ristrutturata.
- Collegare `E.automaticConsumptionAllowed` alla vera logica di consumo in
  index.html **rischia di duplicare/confliggere** con la logica esistente
  già funzionante (quella con `FASCE_ORARIE_PASTO`) — se si interviene qui,
  l'opzione più sicura è probabilmente far convergere la logica esistente
  verso l'uso della funzione motore (sostituzione), non affiancarle.

---

## §9. Verifica funzioni pubbliche non richiamate — tabella completa

Elenco di verifica (comando `grep -c` sul nome, sommando index.html +
motor.js, escludendo la definizione in engine-core.js stesso):

```
hasMealContent              -> 0 occorrenze
countSpecialMeals           -> 0 occorrenze
withinWeeklyCap              -> 0 occorrenze
profileAllowsRecipe         -> 0 occorrenze
automaticConsumptionAllowed -> 0 occorrenze
buildCarbGrid                -> 0 occorrenze
validateCarbBudget          -> 0 occorrenze
shoppingDeficits             -> 0 occorrenze
seeded                       -> 0 occorrenze
composeMeal                  -> 0 occorrenze
automaticDayAllowed          -> 1 occorrenza (usata, vedi §2)
```

Non ripetuto oltre rispetto a §8 (stesso elenco), riportato qui come
riferimento a sé stante per chi cerca solo "quali funzioni del motore sono
morte" senza dover leggere tutto §8.

---

## §11. Selezione contorno: il filtro "fresco prioritario" collassa a un solo candidato quando gli altri articoli "fresco" scarseggiano o sono esclusi — causa dominante di A7

**Questa è la causa radice più precisa e dominante dell'anomalia A7** (più
specifica di quanto scritto in §8, che resta comunque valida come causa
concorrente per la parte "cooldown mai letto").

**File:** `engine-core.js`, `vegetableTier()` e `chooseVegetable()`.

`vegetableTier(meta)` classifica ogni variante verdura in 4 livelli, in
base a due soli campi (`categoria` e `deperibilita` sulla variante/base
ingrediente):
```js
function vegetableTier(meta){
  if(!meta)return 'surgelato';
  if(meta.categoria==='surgelato'||meta.zona==='freezer')return 'surgelato';
  if(meta.categoria==='fresco'&&meta.deperibilita==='alta')return 'fresco';
  if(meta.categoria==='fresco'||meta.deperibilita==='media')return 'fresco_duraturo';
  return 'confezionato';
}
```
`chooseVegetable()` poi **impone una precedenza assoluta e non sfumata** al
tier più alto disponibile con scorta sufficiente:
```js
const stockedFresh=pool.filter(x=>x.inStock&&x.tier==='fresco');
if(stockedFresh.length)pool=stockedFresh;   // <-- se anche 1 solo elemento, diventa TUTTO il pool
else{ ... }
```
Se in un dato momento **un solo** articolo soddisfa `tier==='fresco' &&
scorta≥porzione`, quell'articolo diventa l'**intero pool di scelta**, anche
se altri 10+ articoli con tier più basso hanno scorte abbondanti. Non è un
bug di "rotazione" mancante — è un filtro a cascata che, quando il livello
più alto si restringe a 1, **elimina ogni alternativa dal pool prima
ancora che la rotazione/`oldest()` entri in gioco**.

**Verificato empiricamente il perché questo si verifica facilmente con i
dati di partenza:** su 26 varianti "verdura" nel database, solo 11 sono
classificate `categoria:'fresco'` (le altre 15 sono `'conf'`, anche quando
si tratta di verdure fresche generiche come Broccoli, Carote, Peperoni,
Melanzane, Cavolfiore — finiscono nel tier `fresco_duraturo`, un gradino
sotto). Delle 11 in tier "fresco", **le scorte di default sono quasi
sempre uguali o inferiori alla singola porzione richiesta** (200g per la
maggior parte, 70g per le insalate):
```
Spinaci freschi:  200g in scorta, porzione 200g → esattamente al limite (inStock true)
Zucchine:         200g in scorta, porzione 200g → esattamente al limite (inStock true)
Insalata mista:    80g in scorta, porzione  70g → di poco sopra (inStock true)
Pomodoro fresco:  150g in scorta, porzione 200g → SOTTO soglia (inStock false)
Radicchio:        100g in scorta, porzione 200g → SOTTO soglia (inStock false)
Funghi champignon: non presente in inventario di default → inStock false
```
Con un margine così risicato, basta che **un solo** articolo del tier
"fresco" venga escluso (verdura disattivata dall'utente) o esaurito (uso
precedente nella stessa finestra, o mai rifornito abbastanza) perché il
pool `stockedFresh` collassi a **un singolo elemento rimasto**, che a
quel punto viene riproposto ad ogni chiamata successiva **senza eccezioni**,
per l'intera durata della finestra di scorte (l'inventario non viene mai
decrementato durante la sola "generazione" — solo al consumo reale, quindi
lo stesso identico stato di magazzino vale per tutti e 14 gli slot della
settimana generata in un colpo solo).

**Riprodotto live, deterministicamente:** disattivando le due verdure più
usate ("Zucchine" già esaurita da un test precedente, "Insalata mista"
disattivata a mano) e rigenerando una settimana pulita, il contorno
proposto è risultato **"Spinaci saltati" in 13 casi su 13** (100%), perché
era rimasto l'unico articolo del tier "fresco" ancora con scorta
sufficiente — nonostante altri 15+ contorni con verdure ben rifornite
(Broccoli 300g, Carote 200g, Melanzane 200g, Peperoni 150g) fossero
disponibili un gradino sotto.

**Target di funzionamento:** `REGOLE_FLUSSO_LOGICO.md` §6 dice: *"Finché
c'è verdura fresca con quantità ≥ porzione, niente verdure cotte di
default; il fresco **si alterna** per non ripetere lo stesso contorno."*
La parola chiave è "si alterna": la regola presuppone che ci sia più di
un'opzione fresca tra cui alternare. Il codice fa esattamente ciò che dice
la regola quando c'è più di un'opzione — il problema è che, con i dati di
partenza attuali, spesso non c'è.

**Peculiarità da rispettare se si interviene — due livelli distinti, come
già visto per §4:**
1. **Livello dati**: rivedere la classificazione `categoria` delle 15
   varianti verdura oggi marcate `'conf'` (specialmente quelle
   genuinamente fresche come Broccoli, Carote, Peperoni, Melanzane,
   Cavolfiore) e/o alzare le scorte di default per lasciare margine reale
   sopra la porzione richiesta — **da concordare con Cwe voce per voce**,
   perché "conf" potrebbe essere una scelta consapevole per alcune (es.
   Carote "conf" può riflettere davvero l'abitudine di comprarle
   confezionate) e non va cambiata in blocco senza conferma.
2. **Livello codice**: valutare se il salto "fresco → fresco_duraturo →
   confezionato" debba restare un cut-off assoluto (`if(stockedFresh.length)
   pool=stockedFresh`) o diventare più permissivo quando il tier più alto
   ha **pochissime alternative** (es. includere anche il tier successivo
   quando il pool si riduce sotto una soglia minima di varietà, non solo
   quando è a zero). Qualunque soglia si scelga, **va decisa con Cwe** (non
   è specificata da nessuna parte in `REGOLE_FLUSSO_LOGICO.md`) e poi
   documentata lì, perché tocca una regola di business, non solo
   l'implementazione.
- **Non toccare la logica del tier "surgelato"/fallback stagionale** senza
  verificare anche quella: usa lo stesso pool `c` e le stesse
  `disabledVariantIds`, un cambiamento alla soglia "fresco" può avere
  effetti a cascata anche lì.
- Questa causa è **indipendente** da quella già in §8 (cooldown mai letto):
  anche implementando un vero cooldown a livello di `usedWeek`/`lastVegetable`,
  se il pool "fresco" resta a 1 solo elemento il cooldown non avrebbe
  comunque nulla su cui operare. Vanno risolte entrambe per una vera
  varietà di contorni.

---

## §12. Deadline di consumo automatico: valore mostrato in UI diverso da quello realmente applicato

**File:** `index.html`. Due costanti indipendenti, mai collegate tra loro:

```js
// riga ~1893, mostrata e modificabile in Configurazione avanzata nutrizionista:
deadlines:{pranzo:'15:00',cena:'22:00'}

// riga ~4712, REALMENTE usata per decidere quando un pasto passa a "consumato"
// e scala l'inventario:
const FASCE_ORARIE_PASTO = {
  colazione: [6,9], spuntino1: [9,12], pranzo: [12,14],
  spuntino2: [14,18], cena: [18,20], spuntino3: [20,24]
};
```

**Verificato dal vivo:** un pasto "pranzo" di oggi, con contenuto reale,
programmato la mattina, viene marcato `consumato:true` e scala
l'inventario **appena passano le 14:00**, non le 15:00 mostrate/modificabili
in Configurazione avanzata. Stesso discorso per la cena: taglio reale alle
20:00, non 22:00. Il commento nel codice sorgente stesso chiarisce che
questi orari sono stati **"definiti da Enrico"** come fasce fisse
copri-giornata, indipendenti dal campo `deadlines` esposto in UI.

**Impatto pratico:** se Cwe (o un futuro nutrizionista) imposta "Scadenza
pranzo: 15:00" pensando di posticipare la finestra entro cui un pranzo può
ancora essere modificato/consumato manualmente, **non succede nulla**: lo
scalo automatico dell'inventario e la marcatura "consumato" scattano comunque
alle 14:00 in punto, un'ora prima di quanto l'interfaccia fa credere.

**Target di funzionamento:** il valore mostrato/modificabile in
Configurazione avanzata dovrebbe essere l'unica fonte di verità per la
fascia oraria, oppure — se `FASCE_ORARIE_PASTO` deve restare fissa per
scelta di design (coprire l'intera giornata senza buchi, come dice il
commento) — il campo "Scadenza pranzo/cena" andrebbe tolto dall'interfaccia
modificabile per non promettere un controllo che non esiste.

**Peculiarità da rispettare se si interviene:**
- `FASCE_ORARIE_PASTO` copre **l'intera giornata senza sovrapposizioni né
  buchi** (6-9-12-14-18-20-24): se si rende configurabile il taglio di
  pranzo/cena, bisogna decidere cosa succede alle fasce adiacenti
  (spuntino1 e spuntino2) per non lasciare buchi orari scoperti — non è
  banale come spostare due sole cifre.
- Il commento nel codice segnala esplicitamente che questi orari sono un
  requisito di **Enrico** (presumibilmente il nutrizionista/consulente
  esterno del progetto, non Cwe): prima di cambiare i valori, confermare
  con Cwe se è ancora un vincolo esterno da rispettare così com'è.

---

## §13. `E.buildProteinGrid` può concentrare la stessa macro su un solo giorno

**File:** `engine-core.js`, `buildProteinGrid()`. Riempie le celle
giorno×pasto in ordine fisso (lunedì→domenica, pranzo poi cena),
rispettando prima i minimi, poi i target, poi restando sotto i massimi, con
una preferenza (soft, non vincolante) a non ripetere la macro del pasto
immediatamente precedente:
```js
const alt=pool.filter(m=>m!==previous);if(alt.length)pool=alt;
```
Se all'ultimo giorno rimane **una sola macrocategoria ancora sotto il
proprio target/massimo** (perché tutte le altre hanno già raggiunto il
loro target nei giorni precedenti), `alt` risulta vuoto e la preferenza
"evita ripetizione" viene ignorata — la stessa macro finisce sia a pranzo
che a cena dello stesso giorno.

Verificato empiricamente: `giorno_6` (domenica) risultato `[carne, carne]`
con "Completa" nel test, con i totali settimanali comunque perfettamente in
target (carne 3, pesce 3, formaggi 3, uova 2, legumi 3 = 14).

**Target di funzionamento:** non è chiarissimo se sia un difetto o un
comportamento accettato — `REGOLE_FLUSSO_LOGICO.md` non specifica un
vincolo esplicito "categorie diverse tra pranzo e cena dello stesso
giorno" (parla solo di "max 2 categorie diverse per giorno", che tecnicamente
ammette anche 1 sola categoria ripetuta). **Da chiarire con Cwe se questo è
un comportamento accettabile o da correggere.**

**Peculiarità da rispettare se si interviene:**
- Se si decide di vietare la ripetizione stessa-macro-stesso-giorno anche
  quando è l'unica opzione rimasta, bisogna decidere cosa succede quando
  davvero non c'è alternativa aritmetica (e.g. distribuzioni con target che
  non si dividono in modo pulito su 14 slot): fallire con errore visibile?
  Sforare un target di +1 su un'altra macro pur di avere varietà? Va
  deciso a livello di regola prima di codificarlo, non lasciato
  all'implementazione.
- Questa funzione (`buildProteinGrid`) è condivisa sia dal pulsante
  "Completa"/"Casuale" in Set (tramite `costruisciGrigliaBase`) sia dalla
  vera generazione settimanale (tramite `costruisciGrigliaConfigurata`) —
  **qualunque correzione qui si riflette su entrambi i punti d'uso**,
  quindi va testata in entrambi i contesti, non solo in uno.
