# DietaPlanner v73 — rapporto UI pasti

## Ambito

- Vista compatta per Colazione, Pranzo e Cena.
- Pranzo/Cena ordinati come Carboidrato, Proteine, Verdure.
- Refresh e informazioni nutrizionali affiancati a ogni componente.
- Switch unico e stabile tra Pasto e Pasto speciale.
- Pannello secondario già presente nel DOM, mostrato/nascosto esclusivamente tramite espansione visiva `⌄` / `⌃`.
- Area dinamica condivisa per Carboidrati, Proteine e Verdure, con comandi contestuali e ricerca limitata ai primi cinque risultati.
- Rimozione del vecchio pulsante generale di conferma dal pannello attivo.
- Eliminazione del reload automatico su `controllerchange`, causa del doppio loading consecutivo.
- Patate escluse dal ramo sughi; riconoscimento corretto anche nelle ricette proteiche già complete e filtro Verdure ristretto ai contorni modulari reali.

## Verifiche

- Sintassi di `engine-core.js`, `motor.js` e di tutti gli script inline di `index.html`.
- Test motore su 100 settimane.
- Validazione dati: 137 ingredienti, 332 ricette, allergeni ed esclusioni rigide.
- Contratto UI aggiornato alla struttura compatta/espandibile.
- Controllo conformità e `git diff --check`.
