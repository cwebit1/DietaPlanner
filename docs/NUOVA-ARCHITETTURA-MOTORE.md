# NUOVA ARCHITETTURA — Motore di generazione pasto (decisa, non ancora implementata)

> Questo documento fissa una decisione strategica presa da Cwe che
> **sostituisce l'intero modello di generazione pasto attuale**, non lo
> corregge. Va letto PRIMA di qualunque intervento su A4/A5, sulla
> classificazione `tipoPortata`, o sul progetto sughi/cotture — quei tre
> task confluiscono tutti in questa architettura, non sono più task
> indipendenti. Se stai riprendendo il lavoro da un'altra sessione: questo
> è lo stato più aggiornato, precede in autorità le sezioni corrispondenti
> di `AUDIT-STATO-LAVORO.md`.

Data decisione: 2026-08-23/24. Non ancora implementata: questo è il
documento tecnico di riferimento per l'implementazione, non il codice.

## Perché si cambia (non è un refactor cosmetico)

Cwe ha osservato che il motore attuale "rimbalza" tra due logiche diverse
mai riconciliate: una classificazione fissa per categoria
(primo/secondo/contorno/piatto unico, con codice scritto apposta per ogni
categoria) e un sistema più recente basato su compatibilità dichiarate
dalla ricetta stessa (`carboidratiCompatibili`, `tipiCotturaCompatibili`,
sigla `copertura`). Il codice attuale mescola le due strade a seconda del
punto della pipeline, producendo comportamento incoerente (vedi A1-A11,
S1-S13 in `AUDIT-STRUTTURA-LOGICA.md` — molte di quelle anomalie sono
sintomi di questo doppio binario, non difetti isolati).

**Decisione: una sola strada.** La ricetta descrive se stessa con dati
verificabili (copertura, compatibilità); il motore legge quei dati e
costruisce il pasto matematicamente. Non esiste più codice scritto apposta
per una categoria fissa.

## Il modello, in sintesi

### 1. Preferenza "numero di portate" — due variabili separate, non una con override

**N1 — il default di Set.** Globale e permanente, uno solo per tutta
l'app. Selettore a 4 stati: `1` (piatto unico), `2`, `3`, o `casuale`.

**N2 — il valore per singolo giorno/pasto**, opzionale. Assente di
default (nessuna collisione possibile con N1: sono due variabili
distinte, non la stessa variabile sovrascritta). Se l'utente imposta un
N2 per un giorno/pasto specifico dentro la programmazione, quel
giorno/pasto usa N2; se N2 non è impostato, si usa N1. Ogni giorno può
avere un N2 diverso dagli altri, o nessuno, senza che questo intacchi N1
o gli altri giorni.

**Risoluzione: `N_effettivo = N2 se presente, altrimenti N1`.** Punto —
non serve altro meccanismo di override/ripristino: non essendo la stessa
variabile, non c'è nulla da "annullare" per tornare al default, basta che
N2 non sia impostato per quel giorno.

Se il valore risolto (N1 o N2) è `casuale`, si applica quanto già
descritto sotto: estrazione di un N numerico (1/2/3) al momento della
generazione, indipendente per pranzo e cena, poi invariato da lì in poi
(vedi sotto).

Con `casuale`, il valore permanente memorizzato è il sentinel "casuale"
stesso (la scelta di essere in modalità casuale è ciò che è permanente),
non un numero fisso. Ad ogni pasto generato, **prima** di entrare
nell'algoritmo di ricerca pool, il sistema estrae N a caso tra 1/2/3.
L'estrazione è **indipendente per pranzo e per cena dello stesso giorno**
(confermato da Cwe).

Da lì in poi l'algoritmo (sezione 3) e la scaletta di adattamento
(sezione 4) sono **identici e invariati** rispetto al caso N fisso: la
modalità "casuale" cambia solo la provenienza del valore N iniziale, non
la logica che lo usa.

**N effettivo (risolto da N1/N2 come sopra, poi eventualmente estratto se
"casuale") si fissa al momento della generazione e si salva sul pasto**
(nuovo campo sul record piano, es. `numeroPortateEffettivo`) — da quel
momento è un dato del pasto, non un'estrazione da rifare ad ogni
interazione.

**Due modi distinti di cambiare l'N effettivo di un pasto già generato, da
non confondere:**
- **Roll di un singolo componente** (es. cambio solo il contorno): non
  tocca mai N1 né N2. Cerca un'alternativa nello stesso pool/stesso ruolo
  che quel pezzo stava già coprendo, lascia invariati gli altri pezzi e il
  numero di portate. Coerente con la regola già esistente ("i vincoli
  automatici valgono solo per la generazione automatica, il roll manuale
  tocca solo il pezzo specifico").
- **Impostare N2 per quel giorno/pasto** (ambiente manuale, vedi esempio
  più sotto): l'utente imposta un N2 per quel pasto specifico → si
  rinterroga da capo con la fonte proteica del giorno ferma, ma con N2 al
  posto di N1. Nessun "ripristino" da fare per tornare al default: basta
  non impostare N2 la volta successiva.

**Deciso**: un pulsante "rigenera tutto il pasto" (diverso dal roll di un
singolo componente e diverso dall'impostare N2), quando l'N effettivo
risolto è `casuale`, **ri-estrae sempre un nuovo N** ad ogni rigenerazione
— è la slot machine che l'utente ha scelto impostando "casuale", non ha
senso congelarla al primo risultato. Se invece l'N effettivo è un valore
fisso (1/2/3, da N1 o N2), "rigenera tutto" mantiene quello stesso N e
ripete solo la ricerca del pool.

### 2. Requisiti del giorno — invariato, dalle tabelle Set esistenti

Per ogni pasto, i requisiti restano quelli già derivati dalle tabelle Set
esistenti: la macrocategoria proteica del giorno (dalla griglia proteica)
e la verdura, sempre un requisito aperto (V), coerente con come funziona
oggi.

**Il cereale è un vincolo reale ma "leggero", non una preferenza
cosmetica, e non è un vincolo nutrizionale.** La tabella Set carboidrati
esiste per motivi organizzativi e di gusto (es. programmare riso martedì
e giovedì per cucinarlo una volta sola e riusarlo) — violarla non rompe
nessun criterio nutrizionale (i cereali non hanno un "budget" in senso
dietetico, si può mangiare pane a ogni pasto restando pienamente dentro i
criteri). Il meccanismo esatto:

- **Se la tabella ha un valore impostato per quel giorno/pasto**: è un
  **vincolo reale** — il pool si filtra per compatibilità col cereale di
  quel giorno (`carboidratiCompatibili` della ricetta). È "leggero" in un
  senso preciso, non nel senso di "facoltativo": se il filtro produce un
  pool vuoto, si allarga automaticamente alla categoria intera (mai un
  fallimento silenzioso o un pool vuoto per questo motivo) — con l'ordine
  di grandezza di ricette che si sta classificando (~400) questo fallback
  scatterà raramente in pratica; se scatta spesso in futuro, si
  interverrà con simulazioni dedicate per colmare le carenze, non è un
  problema da risolvere ora.
- **Se la tabella NON ha un valore impostato per quel giorno/pasto**:
  nessun filtro, nessuna preferenza guidata — scelta casuale ("slot
  machine") tra tutti i cereali/ricette ammissibili per quel requisito C.

Questo comportamento è **uniforme**: si applica identico indipendentemente
da quanti altri requisiti la ricetta copre insieme a C (piatto unico, 2
portate, 3 portate — nessuna distinzione tra "C isolato" e "C combinato"),
e identico in programmazione e in manuale.

### 2bis. Ricette "solo preparazione" (es. "alla mugnaia") — serve una compatibilità anche per la proteina

Alcune ricette sono solo un nome di preparazione con un codice proteico
sotto (es. "alla mugnaia" → `PP`). Il codice da solo non basta: `PP`
prenderebbe qualsiasi pesce, anche uno che con quella preparazione non ha
senso (es. tonno in scatola "alla mugnaia").

Serve quindi un campo nuovo, stesso principio di `carboidratiCompatibili`
ma per la proteina: una lista di proteine/ingredienti compatibili con
quella preparazione (es. "alla mugnaia" → sogliola, nasello, platessa...).
Nome provvisorio: `proteineCompatibili`.

Meccanismo finale: il sistema pesca a caso una proteina compatibile,
mette il suo nome davanti, aggiunge il nome della preparazione dopo.
Esempio: pesca "sogliola" → "Sogliola alla mugnaia". Stesso meccanismo già
deciso per i cereali/sughi, applicato ora anche alle proteine.

### 3. L'algoritmo — una sola funzione, generalizzata su N

Non tre logiche diverse per unico/due/tre — **una funzione unica**: "trova
ricette che coprono N requisiti dei richiesti", dove N parte dal numero di
portate impostato e si adatta se non trova una combinazione esatta.

- Requisiti di ammissibilità in un pasto (definiscono se una ricetta entra
  o no nel pool): proteina-del-giorno, C, V. **Il cereale segue il
  meccanismo descritto in sezione 2** (vincolo reale con fallback se
  impostato, slot machine se non impostato) — uniforme in piatto unico, 2
  portate e 3 portate, nessuna differenza tra "C isolato" e "C combinato".
- **Piatto unico (N=1 nel senso "1 ricetta copre tutto")**: pool = ricette
  ammissibili per proteina-del-giorno + coprono anche C e V da sole,
  filtrate per cereale-di-oggi se impostato (con fallback a categoria
  intera se il filtro svuota il pool).
- **2 portate**: pool = ricette ammissibili che coprono **esattamente 2**
  requisiti qualsiasi tra i 3 (non una coppia fissata a priori — la
  disponibilità reale nel database decide quale coppia), con lo stesso
  filtro/fallback sul cereale quando la coppia include C. **Attenzione a
  non implementarlo come "proteina sempre obbligatoria"**: C+V insieme,
  senza nessuna proteina, è una coppia valida quanto proteina+C o
  proteina+V — la proteina mancante si completa dopo, come le altre.
  L'unico caso da escludere è una **proteina sbagliata** (presente ma
  diversa da quella del giorno) — quello sì non è mai ammissibile, a
  nessun livello. Trovata la prima, resta 1 solo requisito scoperto → si
  applica lo stesso meccanismo con pool a requisito singolo per
  completarlo (che può essere la proteina stessa, non solo C o V).
- **3 portate**: tre pool indipendenti, uno per requisito (C con
  filtro/fallback su cereale-di-oggi; proteina-del-giorno; V) — nessuna
  intersezione da cercare.

### 4. Priorità/scaletta di adattamento quando la combinazione esatta non esiste

**Ordine fisso, sempre lo stesso, indipendente dal setting scelto e da cosa
succede pasto per pasto**:

```
unico → due piatti → tre piatti → tabella user → riscontro
```

Se il numero di portate impostato da Cwe non produce una combinazione
esatta per il pasto del giorno, il sistema scala lungo questa sequenza
fissa (partendo da "due piatti" come punto di adattamento, per poi provare
unico e infine tre) finché non trova una combinazione soddisfacibile. Le
combinazioni trovate lungo la scala che non sono al 100% compatibili con
il setting originale **non vengono scartate**: diventano le alternative
proposte per il roll manuale, non un fallback silenzioso.

"Tabella user" e "riscontro" sono gli ultimi due passi della scaletta:
tabella user = i vincoli/preferenze utente (allergie, esclusioni, tetti
ingrediente, verdure disattivate — tutto quello che già esiste come
filtro), riscontro = verifica finale prima di scrivere il pasto nel piano.

### 5. Rete di sicurezza finale (regola esplicita, per non ripetere l'errore di A1)

Anche dopo l'intera scaletta di adattamento, se **nessun** pool a nessun
livello produce una combinazione valida: **avviso esplicito all'utente,
mai un pasto scritto a metà o un fallimento silenzioso.** Non si ripete
l'errore di A1 (silenzio totale quando la generazione non produce nulla).

L'aspettativa primaria resta però prevenire il caso, non gestirlo a
runtime: **"faremo dei check e implementiamo coperture"** — cioè i dati
(sigla `copertura`, `carboidratiCompatibili`, `tipiCotturaCompatibili`)
vanno verificati e completati abbastanza da rendere i pool vuoti un caso
raro/limite, non un evento normale. L'avviso di cui sopra è la rete di
sicurezza sopra a questo lavoro sui dati, non un sostituto.

## Cosa sparisce (cancellato, non riusato con cautela)

Decisione esplicita di Cwe: non si "eredita con cautela" la pipeline
vecchia — si cancella e si scrive pulito.

- L'intera prima definizione (morta) di `componiPastoModulare` /
  `generaPortateMotore` / `motoreV10CompletaDraftPerRealizzazione` in
  motor.js (righe indicative 66-116 allo stato del commit `22fe067` — **da
  riverificare la riga esatta al momento dell'implementazione**, il file è
  cambiato da allora).
- `motoreV10ScegliPrimoReale`.
- `COTTURE_STANDARD` / `COTTURE_PER_PROTEINA_V10` (tabella fissa per
  gruppoProteico) — sostituita da `tipiCotturaCompatibili` per-ricetta.
- La classificazione `tipoPortata` a valori `primo`/`secondo`/`contorno`
  per pranzo/cena (vedi sezione dedicata sotto). Restano solo `unico` e
  `modulare` (+ `colazione`/`spuntino`, mondo separato non toccato da
  questa decisione).

## Migrazione `tipoPortata` — cosa entra in questa architettura

- **`secondo` (80 ricette) → `modulare` + `sottoCategoriaModulare:'proteina'`.**
  Il codice attuale le tratta già come equivalenti ovunque
  (`(modulare&&proteina)||secondo` in ogni punto che le usa) — rietichettatura
  a basso rischio.
- **`contorno` non-modulare (23 ricette) → `modulare` +
  `sottoCategoriaModulare:'contorno'`.** Oggi queste 23 sono invisibili
  alla generazione automatica (che filtra solo `modulare+contorno`) — la
  migrazione le rende utilizzabili E aiuta A7/S11 (verdura ripetuta) come
  effetto collaterale.
- **`primo` (44 ricette) → valutate una per una**, non rietichettate in
  massa: fanno parte del progetto sughi (scorporo cereale/condimento), non
  di questa migrazione meccanica. Alcune resteranno `unico` se il cereale è
  parte dell'identità del piatto (es. "Pasta e patate cremosa").

## Cosa NON cambia (asse diverso, non tocca questa decisione)

`gruppoProteico` e i tetti per sottotipo (carne_rossa≤1, affettati≤1,
pesce_grande≤1, pesce_conservato≤1 — l'anomalia A6/S7) restano invariati:
sono un dato nutrizionale/di frequenza, non una classificazione di ruolo.
La correzione di A6 (il contatore che non si aggiorna durante la
generazione in corso, S7) resta un intervento a parte, indipendente da
questa architettura.

## Due ambienti, due livelli di rigore

- **Programmazione** (generazione settimanale, automatica): rispetta
  scrupolosamente **tutti** i parametri di setting, senza eccezioni.
- **Manuale** (l'utente tocca un pasto del giorno, roll/cambia): l'unico
  vincolo che resta fisso è la **fonte proteica del giorno** (quella già
  assegnata dalla griglia proteica per quel pasto) — tutto il resto
  (portate, cereale, ecc.) è negoziabile lì per lì, per quel singolo pasto,
  senza alterare la programmazione salvata degli altri giorni.

## Parametri di Set — quali sono obbligatori e quali no

- **Cereale del giorno**: facoltativo — l'utente può non impostarlo per un
  dato giorno/pasto. Se impostato: vincolo reale con fallback (vedi
  sezione 2/3). Se non impostato: nessun filtro, scelta casuale tra i C
  ammissibili ("slot machine").
- **Fonte proteica del giorno**: facoltativo lato utente, ma **mai assente
  nei fatti**: se l'utente non personalizza la griglia proteica, resta
  comunque attivo il meccanismo automatico già esistente
  (`E.buildProteinGrid`, target/min/max settimanali per macrocategoria) che
  assegna comunque qualcosa per mantenere il piano entro i criteri
  nutrizionali. Nessuna modifica a questo meccanismo — resta quello di
  oggi.
- **Verdure preferite**: indicate dall'utente (meccanismo già esistente,
  invariato).
- **Portate (1/2/3/Casuale)**: è il default generale che l'utente
  preferisce "di solito" (es. 2), impostato in Set — **ma va esposto anche
  giorno per giorno dentro la vista di programmazione settimanale**
  (Menù), con la stessa logica della griglia proteica che già oggi si può
  sovrascrivere giorno per giorno/pasto per pasto. Non è quindi solo un
  default globale: è anche un override puntuale disponibile in
  programmazione.

## Meccanica stack + roll — due variabili binarie sulla ricetta, due scopi diversi

**Precisazione importante (2026-08-24, dopo un errore di Claude scoperto
testando lo script di prova): lo stack non vive sul nome finale composto
(ricetta+cereale+tutto insieme) — vive sul `condimento`/protagonista.**
Il cereale scelto per accompagnarlo è indipendente e non deve diluire il
conteggio. Esempio concreto che ha fatto emergere l'errore: "Farro con
taleggio e speck" e "Orzo con taleggio e speck" **sono lo stesso
condimento** (taleggio e speck) con due cereali diversi — devono
condividere **un solo** stack, non uno ciascuno. Se stack fosse tenuto sul
nome finale completo, il condimento "taleggio e speck" potrebbe ripresentarsi
più volte nella stessa settimana semplicemente cambiando il cereale
abbinato — esattamente il bug trovato.

**La ricetta-template resta sempre valida** (es. "con taleggio e speck"
come contenitore, o il template con un qualunque array-protagonista
C/PC/PP/PL ecc.) — è la **combinazione specifica di condimento/proteina/
verdura scelta dall'array**, indipendente dal cereale abbinato, che va a
stack quando selezionata, e non ricompare per 15 giorni.

Per gestire la rotazione in modo matematico servono **due variabili
binarie**, entrambe legate al condimento/protagonista selezionato (non al
nome finale composto col cereale): `stack` e `roll`. Fanno cose diverse,
su scale di tempo diverse.

### Sequenza completa, dalla query al pasto scritto

1. **Query candidati vivi**: dal pool grezzo si filtra per — ingredienti
   proibiti (allergie/esclusioni), limitazioni raggiunte (tetti
   settimanali), e **`stack == 0`** (ricette già usate di recente,
   escluse). Quello che resta è il pool vivo.
2. **Roll** (esclusione temporanea, per la UX del "cambia"): tra i
   candidati vivi, quello mostrato ha `roll` a un valore, gli altri
   restano disponibili. Click su "cambia" → esclude temporaneamente
   l'estratto corrente, mostra il prossimo tra quelli non ancora visti.
   Arrivati all'ultimo, **tutti i `roll` si ripristinano a 1** e il ciclo
   riparte da capo. Il roll **non tocca mai lo stack** — è solo
   visualizzazione, non consumo.
3. **Stack** (esclusione reale, per la rotazione): quando una ricetta
   viene **effettivamente selezionata** per un pasto (non solo mostrata —
   confermata), il suo `stack` passa a **0** e la ricetta **esce dal pool
   di estrazione futuro** finché non si ripristina. Il ripristino
   (`stack` torna a 1) avviene dopo un periodo configurabile — non ancora
   deciso il valore esatto (giorni? settimane? dipende dalla categoria?),
   ma il meccanismo è: più ricette esistono in una classe, più raramente
   serve aspettare perché il pool si esaurisca, quindi il periodo di
   ripristino può essere regolato in base a quante alternative ci sono
   già.

### Riepilogo differenze

| | `stack` | `roll` |
|---|---|---|
| Scatta quando | la ricetta è **selezionata/confermata** per un pasto | la ricetta è solo **mostrata** come candidato/alternativa |
| Effetto | esce dal pool di estrazione **futuro** (rotazione reale) | esclusa solo **temporaneamente** dal ciclo di visualizzazione in corso |
| Si ripristina | dopo un periodo configurabile (da decidere) | appena si arriva in fondo al ciclo delle alternative, subito |
| Dove vive | sulla ricetta, persistente tra le generazioni | sulla ricetta, scoped alla sessione di un singolo slot in modifica |

**Il lucchetto per fissare la scelta finale è quello già esistente**,
verificato robusto durante l'audit (`AUDIT-STATO-LAVORO.md` → sezione
lucchetto) — nessuna modifica necessaria lì, si riusa così com'è.

Questa meccanica (stack + roll) è la stessa sia in programmazione (per
rifinire un piano già generato) sia nel pasto del giorno (manuale) — un
solo meccanismo, due punti d'uso.

**Deciso**: il periodo di ripristino per `stack` è **15 giorni** dalla
selezione. Più una seconda condizione di ripristino, indipendente dal
tempo: se un condimento/protagonista è l'**ultimo rimasto a `stack=1`**
nel suo array condiviso (tutti gli altri già a 0) e viene selezionato, a
quel punto **tutto quell'array si ripristina a 1** (stessa logica del
ciclo di reset già usata per il roll — il pool non deve mai restare
completamente vuoto per le estrazioni future). I due meccanismi di reset
(tempo/15gg e array-esaurito) convivono: vale il primo dei due che scatta.

**Nota sul reset array-esaurito**: siccome uno stesso condimento/array può
essere condiviso da più ricette-template (es. lo stesso array verdure
usato sia in "con verdure saltate" sia altrove), **finché esistono altre
ricette che attingono allo stesso array con alternative ancora a
`stack=1`, quell'array non si esaurisce e non scatta il reset** — più
ricette condividono un array, più raramente il reset-per-esaurimento
interviene, e il periodo di 15 giorni resta il meccanismo dominante.

## Esempio concreto (per riferimento futuro, dal flusso descritto da Cwe)

Mercoledì la programmazione ha assegnato "Pasta con cozze e vongole"
(pesce, 2 portate, combinazione che copre PP+C in un piatto solo).
L'utente non lo vuole, preferisce un secondo di pesce puro. Imposta N2=3
**per quel giorno/pasto** → si rinterroga con la fonte proteica del giorno
ferma (pesce) e N2 al posto di N1 → pool "solo PP" per il ruolo secondo,
con flag roll come sopra → l'utente cicla con "cambia" finché non trova
quello che vuole → lucchetto per fissarlo. N1 resta 2 per tutti gli altri
giorni, invariato.

## Nuovo ricettario — lavoro in corso, file separato

Dal 2026-08-24 si costruisce un ricettario nuovo da zero, insieme, passo
per passo (non conversione automatica del vecchio): `nuovo-ricettario/ricette.json`
nella repo. Cwe guida ogni ricetta, Claude estrae uno spunto dal vecchio
`ricette.json` come riferimento, la modella con la nuova logica, la salva,
Cwe corregge se serve. Il vecchio `ricette.json` resta intatto e l'app
continua a funzionare con quello finché non si fa lo swap con il motore
nuovo.

**Meccanismo di tracciamento — `nuovo-ricettario/ricettecavia.json`**:
copia di lavoro del vecchio `ricette.json` (326 voci all'inizio), che si
consuma mano a mano. Ogni volta che una ricetta viene esaminata, si
rimuove dalla cavia — **sia se viene sviluppata come nuovo template, sia
se si scopre che è già coperta da uno sviluppo esistente** (in quel caso
non si sviluppa di nuovo, si toglie e basta). Il numero di voci rimaste in
`ricettecavia.json` è la misura diretta di quanto lavoro resta. Non è
un elenco di "cose da fare" nell'ordine — è solo il conteggio di cosa non
è stato ancora toccato.

**Regole emerse finora, valide per ogni ricetta salvata nel nuovo
ricettario:**

- **Ogni voce di un array che rappresenta più di un ingrediente insieme
  deve usare `composizioneFissa` (scomposta ingrediente per ingrediente,
  ciascuno col suo procedimento), mai una frase unica con un procedimento
  generico.** Es. dentro `verdureCompatibili`, una voce come "radicchio,
  pomodori e cipolle" non si scrive come un nome + un procedimento
  riassuntivo: si scompone in tre ingredienti separati (ciascuno con la
  propria preparazione) dentro `composizioneFissa`, più un
  `procedimentoComune` per il passaggio finale di unione. Stesso principio
  già usato per ricette intere come "insalata fredda con uovo, emmental e
  pomodoro" — vale identico anche quando la combinazione è solo una voce
  dentro un array più grande, non l'intera ricetta.
- **Nella maschera a gruppi: una coppia fissa di ingredienti reali (es.
  "cozze e vongole" insieme, non uno o l'altro) non si rappresenta MAI
  con un ingrediente nuovo inventato dai dati medi.** Si scompone voce
  per voce con ingredienti reali già esistenti (stesso principio di
  `composizioneFissa` sopra, applicato alla struttura a gruppi): se la
  ricetta ha bisogno di quella coppia sempre insieme, **si crea una
  ricetta separata** dove quello slot ha solo quei due ingredienti
  selezionati (nessun terzo, nessuna alternativa) — distinta dalla
  ricetta "sorella" che invece li tratta come alternative singole (uno
  slot con tutte le opzioni, incluse quelle due separatamente). Deciso
  il 2026-08-26 dopo un errore (creato un ingrediente fittizio "Cozze e
  vongole" con valori medi, sbagliato — tolto e sostituito con questa
  soluzione).

- **`classe` deve sempre contenere anche le classi dei pool allegati
  obbligatori**, non solo la classe "principale" della ricetta. Se una
  ricetta richiede sempre un carboidrato e una verdura per essere completa
  (anche se scelti da un array, non fissi), quelle classi (C, V) vanno
  incluse in `classe` insieme a quella di partenza — altrimenti il motore
  non troverebbe mai quella ricetta quando cerca un pool che deve coprire
  anche C o V. Non conta se il pool è obbligatorio ma variabile (scelto da
  un array) o fisso (`composizioneFissa`): se è obbligatorio, la sua
  classe entra in `classe`. Non entrano invece le classi di pool
  puramente facoltativi (se la ricetta resta valida anche senza quella
  scelta).

- Le dosi finali (quanto pesa una porzione di ciascun ingrediente) non si
  scrivono nella ricetta: dipendono da un setting nutrizionista in
  Impostazioni, quindi sono scalabili/modificabili senza toccare le
  ricette.
- **Due fonti nella stessa categoria nella stessa ricetta (non solo
  proteine — generalizzato il 2026-08-26)**: il motore dimezza la dose
  di ciascuna per ottenere lo stesso apporto complessivo di una sola
  fonte. Vale per qualunque categoria che compare due volte in una
  ricetta (due gruppi V, due gruppi PC/PF, ecc.), non solo le proteine
  come originariamente formulato. Esempio: una ricetta con due gruppi V
  (uno di foglie/insalata, uno di altri ortaggi) — il motore attribuisce
  metà della dose piena V a ciascun gruppo. **Non si scrive nella
  ricetta, è comportamento del motore** — nessun campo dose/fattore
  aggiuntivo serve nel dato, il motore rileva da solo che la stessa
  categoria compare due volte e dimezza di conseguenza.
- **Verdura già presente in una ricetta C (es. melanzane in "alla
  Norma")**: il pool contorno, quando serve completare V, eroga **per
  differenza**: `residuo = porzione piena V − quanto già presente nella
  ricetta`, minimo zero. Non una frazione fissa — la formula generale
  funziona per qualunque quantità già presente (0g → contorno intero, un
  valore intermedio → contorno parziale, ≥ porzione piena → contorno
  azzerato). La ricetta registra solo il dato grezzo (grammi di verdura
  già inclusi), il calcolo del residuo è responsabilità del motore al
  momento della generazione. **Risolve alla radice il problema delle
  soglie V trovato nell'audit** (STRUTTURA §11): non serve più decidere se
  una quantità "conta" o no come V, ogni quantità contribuisce
  proporzionalmente.
  **Precisato il 2026-08-26**: questa regola vale **solo per le verdure**
  (le proteine hanno la loro regola separata, il dimezzamento sopra — non
  uno storno/completamento). Quando la verdura in una ricetta combinata
  non copre la dose piena, lo storno **non è facoltativo**: si forza
  sempre un'estrazione V a completamento della dose indicata dal
  nutrizionista, mai lasciata a metà. Quella V allegata come completamento
  va marcata con **un asterisco prima del nome**, per segnalare che è uno
  storno di dose (verdura già in parte coperta da un'altra ricetta) e non
  una V piena a sé stante — distinzione visiva/dati da mantenere ovunque
  venga mostrata.
  **Notazione confermata il 2026-08-26**: invece di tracciare grammi
  esatti nella ricetta, si usa un segno diretto sul token di classe —
  `V` (verdura piena, nessun completamento) contro `V-` (verdura
  insufficiente/parziale, completamento sempre forzato). Una ricetta come
  "alla Norma" ha quindi classe `[C, V-]`, non `[C, V]`. Il motore, quando
  vede `V-` in una classe, sa già — senza bisogno di leggere una quantità
  in grammi — che deve forzare l'estrazione di una V a completamento,
  marcata con l'asterisco come sopra.

  **Meccanismo a due stadi per decidere V vs V- su un gruppo, deciso il
  2026-08-26**:
  - **Stadio 1 — label di sola lettura**, mostra cosa il sistema
    determina in automatico per quel gruppo: "V" oppure "V-". Non è un
    pulsante, solo un'indicazione.
  - **Stadio 2 — 3 pulsanti sotto la label: Off / V / V-.**
    - **Off** → vale quello che dice la label (il sistema decide).
    - **V** → forza V, anche se la label diceva V-.
    - **V-** → forza V-, anche se la label diceva V.
  - Il "-" non si scrive mai a mano da nessuna parte: è sempre l'esito di
    quale dei 3 stati è stato scelto (o della label, se Off).

  **Versione finale, 2026-08-26 (sostituisce la versione precedente basata
  su dose/grammi)**: lo Stadio 1 **non calcola più su una quantità** — è
  puramente strutturale, guarda solo se ci sono altri gruppi attivi nella
  stessa ricetta:
  - **V da sola nel gruppo** (nessun C né proteina attivi nella stessa
    ricetta, es. "Insalata di") → default **V piena**.
  - **V insieme a qualcos'altro** (C e/o proteina presenti nella stessa
    ricetta) → default **V-**.
  - Il selettore manuale (Off/V/V-) resta sempre sopra, per forzare il
    contrario quando serve.

  **Perché non più su grammi**: ricercando dosi reali (alla Norma, pasta
  con pomodoro e melanzane, pasta all'ortolana — 3 fonti indipendenti)
  la verdura in un primo resta sempre 130-150g, mai vicina ai 200g di
  soglia — ma le dosi da dieta si scostano apposta da quelle delle
  ricette comuni: **conviene fissare la verdura in un primo bassa di
  proposito (50-70g)**, cosicché il residuo per il contorno resti una
  porzione vera e sostanziosa (130-150g), invece di rincorrere quanto
  "assomiglia a una ricetta vera". Un campo dose avrebbe richiesto di
  scegliere ogni volta il numero giusto; la regola strutturale (V sola
  vs V insieme a qualcosa) ottiene lo stesso risultato senza bisogno di
  nessun calcolo né di nessun dato quantità nella ricetta.

  **Nota residua sulla formula di completamento (resta valida se serve
  cambiare tipo di verdura tra presente e completamento)**: il
  completamento di default resta **stesso tipo/stessa soglia** di quello
  già presente (sottrazione diretta: `residuo = soglia − presente`) — mai
  cambiare scala (es. da "altro tipo" a "insalata") senza un motivo
  esplicito, perché convertire tra soglie diverse con una proporzione
  (`soglia_A : presente = soglia_B : x`) può produrre quantità
  psicologicamente insignificanti (es. 24,5g di insalata), tecnicamente
  corrette ma inutili in cucina.

## Dose per ingrediente nella lista — due colonne, vale ovunque

**Decisione data da Cwe, salvata solo ora dopo essere andata persa una
volta** (stesso problema già capitato con "nuovo db separato" — detta a
voce, mai scritta subito). **Non è legata al calcolo V/V-** (quello non
usa più dosi, vedi sopra) — è una regola di struttura/UI a sé, generale:

- La lista ingredienti di ogni gruppo (checkbox + nome) va **divisa in
  due colonne**: a sinistra checkbox+nome come oggi, a destra un **campo
  dose in grammi**.
- Vale **sia per i primi (gruppo categoria C) sia per i secondi** (gruppo
  categoria PC/PP/PF/PU/PL) — stessa struttura a due colonne ovunque,
  nessuna eccezione di categoria.
- Serve a registrare il dato quantità per ogni ingrediente scelto,
  indipendentemente da come/se quel dato viene poi usato dal motore per
  altri calcoli (es. non serve più per V/V-, ma resta comunque un dato
  utile da avere — inventario, nutrizione).

**Default precompilato quando si seleziona una verdura**, deciso il
2026-08-26 — si applica **solo nel caso di concomitanza** (V insieme a C
e/o proteina nella stessa ricetta, il caso V-): il default dipende da
quante verdure sono selezionate insieme nello stesso gruppo:
- 1 verdura selezionata → **70g**
- 2 verdure selezionate → **40g** ciascuna
- 3 verdure selezionate → **30g** ciascuna

**Quando V è da sola** nella ricetta (nessun C/proteina concomitante,
caso V piena — es. "Insalata di"), il default resta la soglia intera del
tipo (200g altro / 70g insalata), non questo schema decrescente. Il
campo resta comunque modificabile a mano in entrambi i casi, è solo un
punto di partenza.

**Non ancora implementato nella maschera** — da fare quando si riprende
il lavoro sulla UI.
- **Ogni array che compone una ricetta (`carboidratiCompatibili`,
  `proteineCompatibili`, `tipiCotturaCompatibili`) deve avere un
  procedimento per ogni singola voce**, non solo il nome — altrimenti non
  è definito come usare quell'ingrediente/variante nella descrizione della
  ricetta finale mostrata all'utente. Es. non basta
  `"carboidratiCompatibili": ["p.dura", "orzo"]`, serve
  `[{"nome":"p.dura","procedimento":[...]}, {"nome":"orzo","procedimento":[...]}]`.
  **Quello che conta ora è la struttura/logica, non il contenuto esatto
  dei singoli procedimenti** — i testi si smussano e correggono strada
  facendo (stesso principio già valido per copertura/nomi nel vecchio
  ricettario), non serve che siano perfetti al primo giro.
- **`classe` con più valori (es. `["PF","PC"]`) NON significa che la
  ricetta fonde o copre entrambe le classi contemporaneamente in un solo
  pasto.** Significa che la ricetta **appartiene** a più classi come
  membro valido di ciascuna, separatamente: se il motore cerca "chi copre
  PF" (giorno formaggi) la trova, se cerca "chi copre PC" (giorno carne)
  la trova anche lì. Non serve né implica un giorno che sia
  contemporaneamente formaggi-e-carne, e non conta doppio sulle quote
  settimanali di entrambe le macrocategorie — è appartenenza a due pool
  distinti, non fusione. (Chiarito su "con taleggio e speck", che aveva
  `classe:["C","PF","PC"]` — resta valida come scritta, era solo la
  lettura di Claude ad essere ambigua, non la struttura dati.)

## Ricette a template — la ricetta diventa una combinazione di array, non un testo fisso

**Decisione grossa, presa il 2026-08-24, che generalizza e sostituisce
l'idea di correggere 400 ricette una per una.** `carboidratiCompatibili`
(sezione sughi), `proteineCompatibili` (sezione 2bis) e
`tipiCotturaCompatibili` non sono tre eccezioni isolate — sono i primi tre
casi di **un solo principio**, che ora si applica a ogni ricetta, non solo
a sughi e preparazioni.

Una ricetta diventa un **template**: un nome-base più una o più "caselle"
che si riempiono da array condivisi (vocabolari), invece di un testo
fisso e completo. Esempi dati da Cwe:

```
"Uova" + [array: tipo di cottura uova]      + [array: verdure compatibili con le uova]
"in bianco" + [array: cereali compatibili]  + [array: formaggi compatibili]
"polenta"   + [array: formaggi compatibili]
```

**Perché conviene**: pochi array condivisi, riusati da tante ricette
diverse, generano combinatoriamente migliaia di combinazioni sensate — non
serve più scrivere/correggere una voce per ogni variante possibile (es.
non serve più "Frittata con zucchine", "Frittata con peperoni", "Frittata
con zucchine e formaggio" come voci separate: basta un template Frittata +
verdure compatibili + eventuale formaggio compatibile). Le ricette
esistenti che sono già "complete e fisse" (es. un risotto specifico,
dove il cereale è parte dell'identità del piatto) restano ricette normali,
non tutto deve diventare template.

**Il vero lavoro da fare non è più "correggere 400 ricette"**: è definire
bene gli array/vocabolari condivisi (cereali compatibili, formaggi
compatibili, verdure compatibili per ogni contesto, proteine compatibili,
cotture compatibili, ecc.) — fatto quello, il pool di ricette disponibili
si moltiplica da solo.

**Non ancora deciso, da chiarire prima del documento tecnico**:
- Quanti e quali array/vocabolari servono in totale (cereali, formaggi,
  verdure — forse più di uno a seconda del contesto, proteine, cotture...).
- Come si distingue nei dati una ricetta-template da una ricetta fissa
  (nuovo campo? convenzione sul nome? tipoPortata dedicato?).
- Come si compone il nome finale a video quando più caselle sono
  template contemporaneamente (es. "Uova" + cottura + verdura — che ordine,
  che punteggiatura).

## Stato: da implementare

Nessuna riga di codice scritta ancora per questa architettura. Prossimo
passo: struttura dati e funzioni concrete (forma dei pool, firma delle
nuove funzioni, dove si innesta `carboidratiCompatibili`/
`tipiCotturaCompatibili`, quali file/righe esatte vengono cancellate) —
documento tecnico separato, da produrre e sottoporre a revisione di Cwe
prima di toccare motor.js.

## Priorità nei giorni della settimana — deperibilità ingredienti

**Deciso il 2026-08-24.** Scopo: evitare che verdure molto deperibili
comprate a inizio settimana (es. insalata, radicchio) restino in
frigo fino a marcire perché il piano le programma tardi, mentre
ingredienti che si conservano bene (finocchi, carote, zucchine,
melanzane) finiscono usati prima per puro caso.

**Non serve un campo nuovo**: si riusa `deperibilita` (alta/media/bassa),
già presente su ogni ingrediente in `ingredienti.json`.

**Regola**: la priorità di collocazione nei primi giorni della settimana
di una ricetta è determinata dall'ingrediente **più deperibile** tra i
suoi (non una somma/media — basta un solo ingrediente ad alta
deperibilità per spingere avanti tutta la ricetta). Ricette con solo
ingredienti a bassa deperibilità possono slittare più avanti nella
settimana senza rischio.

Questo è un criterio **distinto** da stack/roll (quello è rotazione nel
tempo tra settimane diverse, questo è ordine **dentro** la stessa
settimana) e distinto dalla preferenza cereale (quello è su cosa scegliere,
questo è su quando collocarlo).

## Peso ingrediente "concesso ma non ideale" — riduce la probabilità di estrazione, non la esclude

**Deciso il 2026-08-24.** Distinto da `deperibilita` (quello decide
*quando* nella settimana) e da `stack`/`roll` (quelli decidono
esclusione/rotazione binaria). Questo è un terzo criterio, per
ingredienti che la nutrizionista ha concesso ma che è meglio non
compaiano spesso — es. concessi ma non ideali per il piano.

**Meccanismo**: un peso sull'ingrediente che **riduce la probabilità**
che una ricetta contenente quell'ingrediente venga estratta, senza mai
escluderla del tutto dal pool — resta candidata, perde più spesso il
sorteggio. Quando viene comunque selezionata, **lo stack si comporta
normalmente**: si ripristina dopo gli stessi 15 giorni di tutte le altre
ricette, nessun periodo più lungo. La difficoltà è solo *in entrata*
(probabilità di essere scelta), non *in uscita* (tempo prima di
ripresentarsi).

Non ancora deciso: nome esatto del campo e scala del peso (es. un
moltiplicatore 0-1 sulla probabilità, o un valore intero comparato agli
altri candidati) — dettaglio da chiudere nel documento tecnico.

## Promemoria aperto — lavoro di Claude su nuovo-ricettario/maschera-ricette.html

Cwe ha detto (2026-08-25) che c'è un lavoro aggiuntivo da fare su
`nuovo-ricettario/maschera-ricette.html`, a carico di Claude, **non ancora
specificato**. Da chiedere/riprendere appena Cwe lo definisce — non
inventare di cosa si tratta nel frattempo.

## Il vecchio nuovo-ricettario/ricette.json (20 voci) è sospeso, non convertito

**Decisione data da Cwe, salvata solo ora (2026-08-25) dopo essere andata persa
una volta perché non era stata scritta subito — vedi regola 5 in
METODOLOGIA-LAVORO.md.** Le 20 voci create prima della maschera a 3+1 gruppi
(id 1-20, formato `nome`/`classe`/array `*Compatibili` piatti) **non vengono
convertite** nel nuovo formato a gruppi. Restano dov'erano, intatte, come
riferimento storico — non si toccano più con la maschera nuova.

**Tutto il lavoro nuovo tramite maschera va in un file separato**:
`nuovo-ricettario/db-ricette.json`, formato a gruppi
(`{id, gruppi:[{testo1,categoria,ingredienti,testo2,mostraNomi}], classe}`).
La maschera (`maschera-ricette.html`) legge/scrive solo questo file, mai più
il vecchio `ricette.json`.

### Regola di espansione delle ricette a gruppi — prodotto cartesiano

**Decisione esplicita 2026-08-29:** ogni ricetta del nuovo db si espande
mediante **prodotto cartesiano tra tutti gli slot/gruppi presenti**, con
una sola esclusione: gli slot di categoria `Condimenti` **non partecipano
al prodotto cartesiano** e quindi non moltiplicano il numero delle
combinazioni generate.

## Domande ancora aperte (non bloccanti per iniziare il documento tecnico, ma da chiudere prima del codice)

- Dettaglio esatto della nuova preferenza "numero di portate" in Set: UI,
  default, come si integra visivamente con la griglia proteica/carboidrati
  già esistente.
- Elenco preciso, ricetta per ricetta, delle 44 "primo" da valutare per il
  progetto sughi (chi diventa modulare/sugo, chi resta unico).

## Algoritmo di generazione settimanale — versione definitiva (2026-08-26)

**Scritto qui perché era rimasto solo negli script Python temporanei di
sessione, mai salvato — causa concreta di molte correzioni ripetute sullo
stesso errore.** Sequenza esatta, data da Cwe, da seguire senza
deviazioni:

### 1. Due griglie fisse a 14 caselle (7 giorni × 2 pasti)

- **Griglia P**: una macrocategoria proteica (PC/PP/PF/PU/PL) per
  casella, generata rispettando le frequenze settimanali della guida
  (carne 1-3, pesce 2-3, formaggi 2-3, uova 1-2, legumi 2-3+ — i legumi
  assorbono il resto fino a 14, essendo l'unica categoria senza tetto
  esplicito). Generata **una volta, fissa per tutta la settimana**.
- **Griglia C**: un tipo di carboidrato specifico per casella, scelto
  casualmente (indipendente dalla griglia P). Anche questa fissa.

### 2. Per ogni casella, in ordine, sequenza esatta

1. **Filtro fisico per P**: tra le ricette che coprono la macrocategoria
   P richiesta per quella casella, **preferisco quelle che hanno anche
   il carboidrato della griglia C per quella casella**; se nessuna
   combacia su entrambi, uso il filtro sulla sola P.
2. **Piazzo fisicamente** quella ricetta nella casella (scelta casuale
   dentro il pool filtrato).
3. **Controllo cosa manca**: la ricetta appena piazzata copre già C?
   Copre già V? Segno i buchi (nessuno, C, V, o entrambi).
4. **Se c'è almeno un buco**: cerco un candidato che copra **tutti i
   buchi rimasti insieme** (un solo controllo combinato — non una
   ricerca per C e una per V separate). Se lo trovo, lo piazzo e la
   casella è completa.
5. **Se non esiste un candidato che copra tutto insieme**: piazzo un
   candidato che copra almeno il **primo** buco, poi ripeto il punto 4
   per il/i buco/i ancora rimasto/i (nuova query, stesso principio).

### 3. Esclusione tra caselle

La ricetta appena piazzata è esclusa **solo dal pasto immediatamente
successivo**, non da tutta la settimana — è una rotazione leggera
(coerente con stack/roll), non un vincolo di unicità totale sui 14
pasti. Una stessa ricetta può quindi comparire più volte nella
settimana, anche non consecutive.

### 4. Presentazione del risultato

**Mai un ingrediente isolato.** Ogni pezzo mostrato (C, P, V) va sempre
accompagnato dal testo/cottura/condimento della ricetta reale a cui
appartiene, ricostruendo il testo così come la ricetta lo prevede
(testo1 + nome se mostraNomi + cottura/condimento + testo2) — mai il
solo nome nudo dell'ingrediente estratto dai dati.

### 5. Principio generale sotteso a tutto questo

**L'algoritmo esegue il dato così com'è scritto, matematicamente —
non giudica se il risultato "sembra strano" o ridondante.** Se una
ricetta ha un testo composto che pare ripetitivo (es. "Pomodori
Pomodori gratinati gratinati"), non è un errore da segnalare o
correggere di iniziativa: è il dato, e l'algoritmo lo applica com'è.

