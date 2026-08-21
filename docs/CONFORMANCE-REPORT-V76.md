# DietaPlanner — Conformance report v76

## Nomi delle ricette

- Tutte le 332 ricette del catalogo hanno l'iniziale maiuscola.
- La normalizzazione viene applicata anche a ogni successivo salvataggio nello store `ricette`.
- `ricette.json` passa dalla versione 9 alla versione 10 per aggiornare automaticamente i dispositivi esistenti.

## Grafici dei consumi

- Al consumo viene registrata in `consumoGiorno` una fotografia `nutrizioneTotale` completa e immutabile.
- Sono conteggiati colazione, spuntini, piatti unici e tutte le componenti dei pasti multipli.
- Se manca un `primoId`, il carboidrato modulare e l'eventuale sugo vengono calcolati separatamente.
- Se il carboidrato è già dentro il secondo, non viene duplicato.
- I record storici precedenti restano supportati dal calcolo basato su `ricettaIds`.

## Controlli

- sintassi di `motor.js` e degli script inline;
- test core, dati, contratto UI e conformità;
- verifica automatica della maiuscola iniziale su tutto il catalogo;
- controllo Git delle differenze.
