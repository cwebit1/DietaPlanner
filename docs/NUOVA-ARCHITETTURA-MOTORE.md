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

### 1. Preferenza "numero di portate" — nuova, in Set, permanente

Nuovo parametro in Set, **globale e permanente** (non per singolo pasto,
non per singolo giorno): quante portate deve avere ogni pasto generato —
`1` (piatto unico), `2`, o `3`. Non esiste ancora nel sistema, va creato
(tabella `impostazioni`, nuova chiave).

### 2. Requisiti del giorno — invariato, dalle tabelle Set esistenti

Per ogni pasto, i requisiti restano quelli già derivati dalle tabelle Set
esistenti: la macrocategoria proteica del giorno (dalla griglia proteica)
e, se applicabile, il cereale del giorno (dal budget carboidrati). La
verdura non ha un "assegnato del giorno" — è sempre un requisito aperto
(V), coerente con come funziona oggi.

### 3. L'algoritmo — una sola funzione, generalizzata su N

Non tre logiche diverse per unico/due/tre — **una funzione unica**: "trova
ricette che coprono N requisiti dei richiesti", dove N parte dal numero di
portate impostato e si adatta se non trova una combinazione esatta.

- Requisiti possibili in un pasto: proteina-del-giorno, C (con vincolo di
  compatibilità cereale-del-giorno se applicabile), V.
- **Piatto unico (N=1 nel senso "1 ricetta copre tutto")**: pool = ricette
  che coprono tutti e 3 i requisiti insieme.
- **2 portate**: pool = ricette che coprono **esattamente 2** requisiti
  qualsiasi tra i 3 (non una coppia fissata a priori — la disponibilità
  reale nel database decide quale coppia). Trovata la prima, resta 1 solo
  requisito scoperto → si applica lo stesso meccanismo con pool a
  requisito singolo per completarlo.
- **3 portate**: tre pool indipendenti, uno per requisito (C con
  compatibilità cereale se assegnato, proteina-del-giorno, V) — nessuna
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
