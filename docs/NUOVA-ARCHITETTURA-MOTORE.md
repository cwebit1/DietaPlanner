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
  filtro/fallback sul cereale quando la coppia include C. Trovata la
  prima, resta 1 solo requisito scoperto → si applica lo stesso meccanismo
  con pool a requisito singolo per completarlo.
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

## Meccanica di roll — flag 0/1 per candidato nel pool

Quando si genera o si rigenera un componente del pasto (in programmazione
per rifinire, o in manuale per il pasto del giorno), il pool di ricette
candidate per quel requisito porta con sé uno stato "roll" **per
candidato**, scoped alla sessione di modifica di quello specifico slot:

- `0` = non ancora mostrato in questo ciclo.
- `1` = già mostrato.

Il candidato attualmente visualizzato è marcato `1`. Click su "cambia" →
la nuova estrazione avviene **solo** tra i candidati ancora a `0`. Quando
l'utente ha visto l'ultimo candidato disponibile (tutti a `1`), i flag si
azzerano tutti e il ciclo riparte da capo. Garantisce che, cliccando
ripetutamente "cambia", l'utente veda ogni alternativa del pool prima di
rivedere la stessa una seconda volta.

**Il lucchetto per fissare la scelta finale è quello già esistente**,
verificato robusto durante l'audit (`AUDIT-STATO-LAVORO.md` → sezione
lucchetto) — nessuna modifica necessaria lì, si riusa così com'è.

Questa meccanica di roll è la stessa sia in programmazione (per rifinire
un piano già generato) sia nel pasto del giorno (manuale) — un solo
meccanismo, due punti d'uso.

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

**Regole emerse finora, valide per ogni ricetta salvata nel nuovo
ricettario:**

- Le dosi finali (quanto pesa una porzione di ciascun ingrediente) non si
  scrivono nella ricetta: dipendono da un setting nutrizionista in
  Impostazioni, quindi sono scalabili/modificabili senza toccare le
  ricette.
- **Due fonti proteiche nella stessa ricetta**: il motore dimezza la dose
  di ciascuna per ottenere lo stesso apporto proteico complessivo di una
  sola. Non si scrive nella ricetta, è comportamento del motore.
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

## Domande ancora aperte (non bloccanti per iniziare il documento tecnico, ma da chiudere prima del codice)

- Dettaglio esatto della nuova preferenza "numero di portate" in Set: UI,
  default, come si integra visivamente con la griglia proteica/carboidrati
  già esistente.
- Elenco preciso, ricetta per ricetta, delle 44 "primo" da valutare per il
  progetto sughi (chi diventa modulare/sugo, chi resta unico).
