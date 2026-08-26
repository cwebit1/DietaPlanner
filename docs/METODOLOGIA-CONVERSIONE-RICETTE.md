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

5. **Prima di scrivere qualunque cosa sul file reale**, mostro la
   conversione proposta per intero, con ogni punto ambiguo elencato a
   parte e ben visibile, e aspetto conferma esplicita.

6. **Solo dopo conferma**, compongo la voce usando la maschera vera
   (clic reali dentro il tool, mai uno script che scrive JSON a mano) e
   salvo.

## Cosa NON faccio mai, senza eccezioni

- Non aggiungo ingredienti, categorie, o parole di collegamento non
  presenti nell'originale né dette esplicitamente da Cwe.
- Non fondo gruppi/sughi che nel vecchio sistema erano tenuti distinti
  (es. la compatibilità carboidrato specifica di un sugo).
- Non presumo una parola di collegamento "plausibile" se non è data.
- Non salvo sul file reale prima di una revisione esplicita di Cwe sulla
  proposta di conversione.
