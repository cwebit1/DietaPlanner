# DietaPlanner — Conformance report v75

## Ambito

- visualizzazione corretta del condimento dei primi;
- rimozione del simbolo `+` dalla composizione mostrata;
- controllo delle cotture assegnate ai secondi.

## Correzioni

- Quando `primoId` identifica un primo reale, il pannello mostra ora il nome completo della ricetta anziché la sola famiglia di carboidrato.
- Per un primo modulare, carboidrato e sugo sono separati da `·`, senza simboli `+`.
- Le ricette proteiche con una cottura già esplicita nel nome non ricevono una seconda cottura casuale e non espongono il comando di cambio cottura.
- Le proteine dal nome generico continuano a ricevere una cottura ammessa dal proprio gruppo proteico.

## Verifiche

- sintassi JavaScript di `motor.js` e degli script inline;
- test core, dati, contratto UI e conformità;
- controllo differenze Git senza errori di whitespace.
