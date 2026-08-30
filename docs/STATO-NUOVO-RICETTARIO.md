# STATO NUOVO RICETTARIO — quadro generale

> **Leggere questo file per primo** se si riprende il lavoro sul nuovo
> ricettario, anche da un altro account. Va aggiornato a ogni chiusura di
> processo. Non sostituisce `ARCHITETTURA_MOTOR_V12.md` o
> `METODOLOGIA-CONVERSIONE-RICETTE.md`: li riassume per orientarsi.

Ultimo aggiornamento: 2026-08-30.

## File del sistema nella root attiva

- `maschera-ricette.html` — lo strumento di
  composizione, unico modo per creare/modificare voci (mai scrivere
  JSON a mano).
- `db-ricette.json` v68 — ricette nel nuovo formato a gruppi: **39
  template**.
- `ingredienti-new.json` v21 — **157 ingredienti** per il nuovo
  sistema. La root è ora l'unica applicazione corrente; il catalogo 1.0 è
  archiviato. Rinomine consolidate: Sogliola/Nasello/Orata/Branzino (tolto
  surgelato/a), Fagioli borlotti/cannellini e Lenticchie (tolto "in
  barattolo", info conservata in campo `formato`), Tonno (da "in
  scatola"), Riso (da "Originario", voluto da Cwe). Nuovi ingredienti
  aggiunti: Platessa, Merluzzo, Salsiccia di maiale/tacchino, Pomodori
  gratinati (gruppo array `["carboidrati","verdura"]`), Grana, Tomino,
  Cipolla rossa, e i condimenti Semi di sesamo/Aceto balsamico/Aceto
  di mele/Arancia (questi ultimi senza dati nutrizionali — non
  servono per i condimenti).
- Il vecchio `Vecchia versione 1.0/ricette-nuovo-formato-precedente.json` (20 voci, formato
  precedente) resta **sospeso, non convertito**, solo riferimento
  storico — **non riferirsi mai alle sue voci con "id"+numero**, solo
  per nome/testo originale (regola data da Cwe dopo confusione ripetuta
  con la numerazione del nuovo db).

## Struttura di una voce (db-ricette.json)

Ogni ricetta: `id`, `classe` (stringa o array), `gruppi` (sempre 4:
massimo 3 usabili per macrocategorie + 1 dedicato ai condimenti, ma
**qualunque dei 4 può ospitare qualunque categoria**, non solo il 4°
i condimenti — verificato con "insalata fredda con uovo, emmental e
pomodoro" che usa tutti e 4 come macrocategorie).
Ogni gruppo: `testo1`, `categoria`, `ingredienti` (array di
`{nome,stack,roll,dose?}`), `cotture` (stesso formato, assente sul
gruppo condimenti), `testo2`, `mostraNomi`.

- `stack`/`roll`: ogni ingrediente e ogni cottura li ha (rotazione
  15gg / ciclo alternative), default 1.
- `dose`: grammi, opzionale, campo a destra nella lista (due colonne,
  implementato il 2026-08-26). **Usato solo per eccezioni** — il
  valore standard non si scrive mai, arriva dal setting nutrizionista
  via motore.
- La `classe` finale si costruisce dalle categorie scelte nei gruppi,
  **a prescindere da quali ingredienti sono spuntati dentro** — anche
  un gruppo con categoria attiva ma zero ingredienti conta (usato per
  "Pomodori gratinati al forno": C attivo senza ingredienti, solo la
  cottura "gratinati al forno" a testimoniarlo).
- **Espansione combinatoria (decisione 2026-08-29):** le ricette si
  ottengono tramite **prodotto cartesiano tra tutti gli slot/gruppi
  presenti**, escludendo gli slot di categoria `Condimenti`, che non
  moltiplicano le combinazioni.

## Metodo di conversione/composizione — il processo che funziona

Vedi `METODOLOGIA-CONVERSIONE-RICETTE.md` per il dettaglio (punti
4ter-4sexies sono il cuore). In sintesi:
1. Per ogni parola del testo originale: è un ingrediente reale? →
   collego con categoria. Condimento? → condimenti. Cottura? →
   cotture. Nessuna delle tre? → resta testo. Niente altre domande.
2. Mostra/nascondi nome: nascondo solo se il testo nomina già
   esplicitamente la cosa senza alternative da distinguere. Un
   ingrediente implicito da un nome di piatto riconosciuto (es.
   melanzane in "alla Norma") si estrae comunque come dato vero — la
   selezione (dato) e la visualizzazione (testo) sono separate.
3. Una ricetta alla volta: presento la forma finale già decisa
   (Classe/Slot/Testo/Condimenti/Cottura), aspetto conferma esplicita,
   solo poi compongo con la maschera vera e salvo. Mai riferirsi alle
   vecchie voci con "id"+numero.

## Regole del motore chiuse (comportamento, mai scritte nel dato)

- **Due fonti nella stessa categoria nella stessa ricetta → il motore
  dimezza la dose di ciascuna** (generalizzato il 2026-08-26 da
  "proteine" a qualunque categoria — due gruppi V, due PC, ecc. Non
  serve nessun campo dose/fattore nella ricetta, il motore rileva da
  solo la doppia categoria).
- **V/V- (decisione finale)**: puramente strutturale. V da sola nella
  ricetta → V piena di default. V insieme a C e/o proteina → V- di
  default. Selettore manuale Off/V/V- sempre disponibile per forzare
  il contrario. **Non ancora implementato nella maschera** (solo
  deciso — oggi si può selezionare solo "V", non "V-", nel tool).
- **Verdura parziale in concomitanza**: dose bassa per scelta
  (70g/1 verdura, 40g×2, 30g×3 — default da precompilare quando si
  seleziona, solo nel caso di concomitanza C/proteina, mai quando V è
  sola). Completamento sempre stesso tipo/soglia del presente.
- **Un campo `fattoreDose` (moltiplicatore) era stato proposto e
  scartato**: infilerebbe un controllo/regola dentro il dato. Se un
  dimezzamento è sempre vero per una certa condizione strutturale
  (es. due categorie uguali), è il motore a saperlo da solo, non la
  ricetta a doverlo dire.

## Report di copertura

Il vecchio conteggio di 194 combinazioni su 19 voci è soltanto storico e non
descrive i 39 template correnti. I test verificano 218 referenze ingrediente,
comprese 17 composizioni fisse, senza errori. Il test settimanale rigenera 20
settimane complete sul catalogo v68.

## Prossimi passi possibili

- Implementare il selettore Off/V/V- nella maschera (deciso, mai
  scritto nel codice).
- Eseguire il gate browser reale del Lotto H.

## Algoritmo di generazione settimanale

Il contratto corrente è consolidato in `ARCHITETTURA_MOTOR_V12.md` e nella
matrice requisiti. La v12 usa due sequenze settimanali, query di combinazioni
strutturate e salvataggio atomico dell'intera generazione.

## Ingredienti PL nel database (per riferimento rapido)

Ceci, Fagioli borlotti, Fagioli cannellini, Lenticchie, Mix cereali e
legumi (unico con gruppo doppio carboidrati+proteine), Piselli in
barattolo, Piselli surgelati, Tofu. **Solo id28 ("zuppa", Mix cereali e
legumi) ha un carboidrato nella stessa ricetta** — collo di bottiglia
noto quando la griglia P richiede più PL della settimana di quante
combinazioni C+PL dirette esistano.



## Compatibilità Condimenti per ingrediente — 2026-08-29

Aggiunto nel nuovo DB il campo opzionale `condimentiCompatibili` sugli
ingredienti dei gruppi non-`Condimenti`. Il gruppo `Condimenti` continua a
contenere il catalogo della ricetta e non moltiplica le combinazioni.
Per la migrazione iniziale, nelle 8 ricette che avevano già un gruppo
`Condimenti`, ogni ingrediente ha ricevuto l'elenco comune precedente: nessuna
compatibilità è stata inventata o rimossa. Da questo punto le liste possono
essere differenziate ingrediente per ingrediente.


## Roll C/P/V — 2026-08-29

Il vecchio roll generico fra ricette è superato. I tre roll sono locali alla
realizzazione corrente: C varia solo gli slot C, P solo la cottura proteica, V
solo il condimento compatibile. Se c'è una sola alternativa il relativo
pulsante resta disattivato. La nuova estrazione dell'intero pasto avviene solo
con **Proponi nuovo pasto**.


## Speck / affettati — 2026-08-29

`Speck` resta `sottotipo: affettati`, con `cooldownGiorni: 20`. Il conteggio del limite `affettati: 1` è ora aggregato per categoria (non per singolo nome ingrediente). Il peso probabilistico non è stato modificato perché il nuovo motore usa estrazione uniforme sul pool filtrato e non espone un peso separato.


## Sequenza automatica Condimenti — 2026-08-29

La prima variante dei Condimenti non è più fissa. `motoreNuovoTracking` conserva `condimentoCursori`, indicizzati per template + ingredienti selezionati. Ogni proposta effettivamente scelta usa la variante successiva compatibile; a fine elenco il ciclo ricomincia. Roll V non consuma né sposta questo cursore.


## Rotazione globale Condimenti — 2026-08-29

La precedente rotazione per template/ingredienti è superata. `motoreNuovoTracking.condimentoRotazione` conserva un contatore globale e l'ultimo ordine d'uso di ciascun condimento. Ogni nuova proposta sceglie, tra i condimenti compatibili, quello meno recente; quindi non riparte sempre dal primo elemento dell'array.
