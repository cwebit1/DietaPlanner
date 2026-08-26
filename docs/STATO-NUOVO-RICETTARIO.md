# STATO NUOVO RICETTARIO — quadro generale

> **Leggere questo file per primo** se si riprende il lavoro sul nuovo
> ricettario, anche da un altro account. Aggiornato ad ogni chiusura di
> processo (regola 8 in `METODOLOGIA-LAVORO.md`). Non sostituisce i
> documenti di dettaglio (`NUOVA-ARCHITETTURA-MOTORE.md`,
> `METODOLOGIA-CONVERSIONE-RICETTE.md`) — li riassume per orientarsi
> velocemente.

Ultimo aggiornamento: 2026-08-26.

## File del sistema (tutti separati dal vecchio, mai mescolati)

- `nuovo-ricettario/maschera-ricette.html` — lo strumento di
  composizione, unico modo per creare/modificare voci (mai scrivere
  JSON a mano).
- `nuovo-ricettario/db-ricette.json` — le ricette nel nuovo formato a
  gruppi. **5 voci** ad oggi (id1-id5).
- `nuovo-ricettario/ingredienti-new.json` — ingredienti per il nuovo
  sistema, copia separata del vecchio `ingredienti.json` (quello resta
  intatto per l'app in uso).
- Il vecchio `nuovo-ricettario/ricette.json` (20 voci, formato
  precedente) resta **sospeso, non convertito**, solo riferimento
  storico da cui si estrae una voce alla volta per convertirla.

## Struttura di una voce (db-ricette.json)

Ogni ricetta: `id`, `classe` (stringa o array), `gruppi` (sempre 4:
massimo 3 usabili per macrocategorie + 1 dedicato ai condimenti).
Ogni gruppo: `testo1`, `categoria`, `ingredienti` (array di
`{nome,stack,roll,dose?}`), `cotture` (stesso formato, assente sul
gruppo condimenti), `testo2`, `mostraNomi`.

- `stack`/`roll`: ogni ingrediente e ogni cottura li ha (rotazione
  15gg / ciclo alternative), default 1.
- `dose`: grammi, opzionale, campo a destra nella lista (due colonne,
  implementato il 2026-08-26).
- La `classe` finale si costruisce dalle categorie scelte nei gruppi,
  **a prescindere da quali ingredienti sono spuntati dentro** — anche
  un gruppo con categoria attiva ma zero ingredienti conta.

## Ricette già composte (id1-id5)

1. **Farro/Orzo/Riso/Polenta con Gorgonzola/Taleggio** — C+PF
2. **Pesce (6 tipi) con 4 cotture** — PP, include Platessa e Merluzzo
   aggiunti apposta
3. **Salsiccia di maiale/tacchino al forno** — PC
4. **Pomodori gratinati al forno** — C+V (C senza ingredienti tracciati,
   solo cottura "gratinati al forno"; V = Pomodoro fresco)
5. **Pomodori (con ingrediente "Pomodori gratinati")** — V+C, usa il
   nuovo ingrediente cumulativo, dose 12 (pezzi)

## Regole chiuse, valgono per ogni conversione futura

- **V/V- (decisione finale, sostituisce ogni versione precedente basata
  su grammi/soglie)**: puramente strutturale. V da sola nella ricetta →
  V piena di default. V insieme a C e/o proteina → V- di default.
  Selettore manuale Off/V/V- sempre disponibile per forzare il
  contrario. **Non ancora implementato nella maschera** (solo deciso).
- **Verdura parziale in un primo/secondo**: dose bassa **per scelta**
  (50-70g con 1 verdura, 40g×2, 30g×3 — default precompilato quando si
  seleziona, sempre modificabile), per lasciare un residuo sostanzioso
  al contorno di completamento. Completamento sempre stesso
  tipo/soglia del presente (mai cambiare scala con una proporzione,
  produce quantità insignificanti tipo 24g di insalata).
- **Due proteine nella stessa ricetta**: il motore dimezza la dose
  (regola separata da quella della verdura).
- **`gruppo` di un ingrediente può essere un array** (es. "Pomodori
  gratinati" → `["carboidrati","verdura"]`), stesso pattern già usato
  per `classe`. Il filtro (`gruppoContiene`) e il salvataggio (sezione
  5 gestione ingredienti) supportano entrambi i formati.
- **Ingredienti quantificati a pezzi**: campi `unitaPorzione: "pezzi"`,
  `pesoPorzioneGrammi`, `notaPorzione` (visto su Friselle, riusato per
  Pomodori gratinati).
- **Ricette "solo manuali" (richiedono preparazione anticipata, mai
  proposte in automatico)**: non impostare nessuna categoria sui
  gruppi (restano "Nessuno") → classe vuota → invisibile alle query
  del motore, recuperabile solo sfogliando a mano. Non serve un campo
  dedicato, si riusa un comportamento già esistente.

## Decisioni prese ma NON ancora implementate nel codice

- Stadio 1/Stadio 2 per V/V- (label automatica + 3 pulsanti Off/V/V-)
  — solo Stadio 2 sarebbe da fare, Stadio 1 non serve più (non è più
  su dose/quantità, vedi sopra).
- Nessun'altra decisione risulta in sospeso ad oggi.

## Prossimi passi possibili

- Continuare la conversione delle voci rimaste nel vecchio
  `ricette.json` (id 6,7,8,9,10,12-20), una alla volta, seguendo
  `METODOLOGIA-CONVERSIONE-RICETTE.md`.
- Implementare il selettore Off/V/V- nella maschera.
