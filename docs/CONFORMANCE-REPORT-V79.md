# DietaPlanner — Conformance report v79

## Ambito

- Configurazione nutrizionista spostata in una vista interna autonoma, raggiungibile da Impostazioni e predisposta per una futura protezione.
- Allergeni completi, profili onnivoro/vegetariano/vegano e vincoli ingredienti a tre stati.
- Tabelle compatte a riga singola con minimo, massimo, quantità e unità già presenti nel catalogo.
- Nessun limite numerico universale introdotto: sono verificati soltanto `min <= max` e quantità positiva.
- I massimi clinici prevalgono sui tetti utente; i minimi clinici sono prioritari nella generazione; esclusioni e allergeni attraversano il filtro centrale delle ricette.
- Parametri esistenti mantenuti senza alterarne i valori predefiniti.

## Verifiche

- Sintassi dei quattro script interni di `index.html`: valida.
- Sintassi `motor.js`: valida.
- `node --test tests/*.test.js`: 4/4 test superati.
- `git diff --check`: nessun errore di whitespace.
- Nessuna modifica v79 ai valori di `ingredienti.json` o `ricette.json`; le relative modifiche presenti nel commit appartengono ai lotti v73–v78 già documentati.
