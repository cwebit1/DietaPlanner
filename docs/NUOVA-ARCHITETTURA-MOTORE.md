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
e, se applicabile, il cereale del giorno (dal budget carboidrati — **ma
solo come vincolo per la ricerca di un C isolato, vedi sezione 3**). La
verdura non ha un "assegnato del giorno" — è sempre un requisito aperto
(V), coerente con come funziona oggi.

### 3. L'algoritmo — una sola funzione, generalizzata su N

Non tre logiche diverse per unico/due/tre — **una funzione unica**: "trova
ricette che coprono N requisiti dei richiesti", dove N parte dal numero di
portate impostato e si adatta se non trova una combinazione esatta.

- Requisiti possibili in un pasto: proteina-del-giorno, C, V.
- **Il vincolo di compatibilità col cereale-del-giorno si applica SOLO
  quando C viene cercato da solo, isolato** (il caso "3 portate": una
  ricetta dedicata esclusivamente al carboidrato, dove ha senso
  controllare la distribuzione settimanale dei cereali). **Non si applica
  quando C viene coperto insieme ad altro** (piatto unico, o la parte "2
  requisiti insieme" del caso 2 portate): lì si accetta il carboidrato che
  la ricetta porta con sé, qualunque esso sia — non si scarta un risotto
  solo perché oggi il budget assegnava farro. La coerenza richiesta in
  quei casi è solo con la proteina-del-giorno, non col cereale. (Non
  confligge con A2/S5 — il bug del budget carboidrati non tracciato
  quando il carbo è "nascosto" dentro un secondo: quello resta un problema
  di conteggio del budget, non di ammissibilità della ricetta, e va
  risolto comunque separatamente.)
- **Piatto unico (N=1 nel senso "1 ricetta copre tutto")**: pool = ricette
  che coprono tutti e 3 i requisiti insieme, nessun vincolo cereale.
- **2 portate**: pool = ricette che coprono **esattamente 2** requisiti
  qualsiasi tra i 3 (non una coppia fissata a priori — la disponibilità
  reale nel database decide quale coppia), nessun vincolo cereale su
  questa prima scelta. Trovata la prima, resta 1 solo requisito scoperto →
  si applica lo stesso meccanismo con pool a requisito singolo per
  completarlo — **se il requisito rimasto è C isolato, lì sì scatta il
  vincolo cereale**, essendo esattamente il caso "C cercato da solo".
- **3 portate**: tre pool indipendenti, uno per requisito (C con vincolo
  cereale se assegnato — è il caso "C isolato" — proteina-del-giorno, V) —
  nessuna intersezione da cercare.

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

- **Cereale del giorno**: facoltativo. Se l'utente non lo imposta, un
  criterio in meno nella ricerca del pool C → pool più grande. Nessun
  fallback speciale necessario.
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
