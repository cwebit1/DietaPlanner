# METODOLOGIA DI CONVERSIONE RICETTE — vecchio formato → nuovo formato a gruppi

> Regola data da Cwe il 2026-08-25/26, dopo errori ripetuti di Claude nella
> conversione manuale (parole di collegamento dimenticate, gruppi separati
> confusi tra loro). Leggere **sempre** prima di convertire qualunque
> ricetta dal vecchio `ricette.json` / `nuovo-ricettario/ricette.json` al
> nuovo `nuovo-ricettario/db-ricette.json` (formato a gruppi, gestito dalla
> maschera).

## Principio assoluto

**Non decido nulla di ambiguo da solo.** Se un aspetto della conversione
non è chiaramente derivabile dal dato vecchio così com'è, o da
un'istruzione esplicita già data da Cwe, **lo segnalo e aspetto — non
scelgo per lui, non presumo, non completo con una scelta "plausibile"**.
Questo vale anche per dettagli che sembrano piccoli (una parola di
collegamento tipo "con"/"e") — sono stati proprio quelli a causare errori.

## Passo per passo, per ogni ricetta da convertire

1. **Estraggo la ricetta originale per intero** (dal vecchio file) e la
   mostro senza omissioni, prima di proporre qualunque conversione.

2. **Mappo i campi vecchi nel nuovo formato solo dove la mappatura è
   diretta e non ambigua**:
   - `classe` → resta identica.
   - `carboidratiCompatibili` → gruppo `categoria: "C"`, **esattamente
     gli stessi ingredienti**, mai aggiunti né tolti.
   - `proteineCompatibili` → gruppo con la categoria proteica giusta
     (PC/PP/PF/PU/PL), stessi ingredienti.
   - `verdureCompatibili` → gruppo `categoria: "V"`, stessi ingredienti.
   - `nome` fisso che nasconde un ingrediente reale non ancora modellato
     come array (es. una proteina scritta nel nome invece che in un
     array) → **segnalo il problema**, non decido da solo se
     trasformarlo in un gruppo categoria o lasciarlo testo fisso.

3. **Non tocco mai la compatibilità già esistente.** Se nel vecchio
   sistema un sugo/condimento era compatibile solo con certi carboidrati
   (non tutti quelli esistenti), quella stessa lista esatta resta —
   **non la allargo né la restringo** di mia iniziativa. I gruppi già
   definiti nel vecchio sistema (quali carboidrati vanno con quale sugo)
   sono un dato, non un'opinione mia da rivedere.

4. **Le parole di collegamento testuale (testo1/testo2, "con"/"e"/"al")
   non si inventano.** Se il vecchio formato non le specificava
   esplicitamente (perché il vecchio formato non le aveva come concetto),
   le segnalo come scelta aperta e la chiedo — non ne scelgo una
   plausibile in autonomia.

4bis. **Considero TUTTE le parole del nome/testo originale, una per
   una, non solo gli ingredienti/array evidenti.** L'errore già commesso
   (dimenticare "con" tra due gruppi) è nato da questo: guardavo solo
   "quali ingredienti", non "cosa c'è scritto per intero, parola per
   parola". Prima di proporre una conversione, rileggo il nome/testo
   originale e verifico che ogni singola parola (articoli, preposizioni,
   congiunzioni comprese) abbia un posto nella struttura nuova — o segnalo
   esplicitamente quella che non ce l'ha, invece di ometterla in
   silenzio.

4ter. **Il metodo meccanico che funziona davvero (confermato il
   2026-08-26, dopo molti giri a vuoto)**: per ogni parola/elemento del
   testo originale, in sequenza, senza deliberare oltre:
   1. Corrisponde a un ingrediente reale nel database? → collego come
      ingrediente in uno slot, con la sua categoria.
   2. No, ma è un condimento (erba, spezia, aromatizzante)? → slot
      condimenti.
   3. No, ma è una tecnica di cottura (al forno, saltati, in bianco,
      cotte)? → array cotture.
   4. Nessuna delle tre? → resta testo di collegamento (testo1/testo2).
   Fine. Non ci sono altre domande da porsi (niente "è abbastanza
   specifico da meritare un ingrediente", niente "serve un campo
   nuovo") — sono elaborazioni inutili che allungano il processo senza
   motivo.

4quater. **Mostra/nascondi nome è una scelta separata e semplice, non
   il centro dell'analisi**: nascondo solo quando il testo/nome **nomina
   già esplicitamente quella cosa senza alternative reali da
   distinguere** (es. "con taleggio" → Taleggio nascosto, il testo lo
   dice già). Mostro quando più opzioni diverse potrebbero riempire lo
   stesso slot e serve sapere quale è stata usata (es. "al pomodoro" →
   Pomodoro fresco mostrato, perché in astratto ci potrebbero essere più
   pomodori diversi). **Caso speciale — nome di piatto riconosciuto**
   (es. "alla Norma"): l'ingrediente implicito (melanzane) **va comunque
   estratto come slot vero** (serve per spesa/scarico/nutrizione, non è
   opzionale), ma resta **nascosto**, perché il nome del piatto lo
   implica già per chi lo conosce — mostrarlo sarebbe ridondante. La
   selezione (dato) e la visualizzazione (testo finale) sono due cose
   separate: la prima non si salta mai, la seconda è solo estetica.

4quinquies. **Non riferirsi mai alle vecchie ricette con "id" + numero.**
   Il nuovo db ha una sua numerazione id propria (es. id1, id2...) — usare
   lo stesso schema per le vecchie voci crea confusione su quale "id1" si
   intende. Le vecchie voci si citano solo per nome/testo originale
   (es. "alla Norma", "con taleggio e speck"), mai con un numero id.

4sexies. **Un flusso, una ricetta alla volta**: per ognuna, presento la
   composizione finale già decisa (non una domanda) nella forma:
   `Classe: ... / Slot: [...] / Testo: "..." / Condimenti: [...] /
   Cottura: [...]`, ripetuto per ogni gruppo. Aspetto conferma esplicita
   ("salva", "corretta così", o una correzione puntuale). Se arriva una
   correzione, la applico esattamente e ripresento aggiornata — non
   rimetto in discussione l'intero approccio ogni volta. **Nessun
   inserimento nel db finché non arriva un ok esplicito su quella
   specifica ricetta.**

5. **Prima di scrivere qualunque cosa sul file reale**, mostro la
   conversione proposta per intero, con ogni punto ambiguo elencato a
   parte e ben visibile, e aspetto conferma esplicita.

6. **Solo dopo conferma**, compongo la voce usando la maschera vera
   (clic reali dentro il tool, mai uno script che scrive JSON a mano) e
   salvo. **Verifico ogni nome ingrediente contro `ingredienti-new.json`
   reale prima di proporlo** — se manca, lo segnalo (o lo cerco e lo
   aggiungo con dati nutrizionali reali, se esplicitamente richiesto),
   mai un nome a caso o un sostituto plausibile non verificato.

## Cosa NON faccio mai, senza eccezioni

- Non aggiungo ingredienti, categorie, o parole di collegamento non
  presenti nell'originale né dette esplicitamente da Cwe.
- Non fondo gruppi/sughi che nel vecchio sistema erano tenuti distinti
  (es. la compatibilità carboidrato specifica di un sugo).
- Non presumo una parola di collegamento "plausibile" se non è data.
- Non salvo sul file reale prima di una revisione esplicita di Cwe sulla
  proposta di conversione.
