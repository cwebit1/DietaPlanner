# DietaPlanner — Lotto G: generazione, pasto odierno e UI

**Data:** 2026-08-30
**Motore:** `motor-v12.js`

## Implementazione

### Realizzazioni quantitative

Le nuove realizzazioni salvano `schemaQuantita: 1`,
`ingredientiEffettivi`, `nutrientiEffettivi` e `nomeEffettivo`. Il dato è uno
snapshot del pasto pianificato: cambi futuri del Setting non riscrivono piano,
spesa o storico. Le realizzazioni legacy prive di snapshot restano leggibili.

Lo stesso snapshot viene consumato da rendering, nutrizione, lista della spesa,
scarico inventario e storico. Gli ingredienti `nonRichiedeInventario` sono
esclusi sia dalla spesa sia dallo scarico.

### Residuo verdura

La copertura somma le frazioni reali di tutte le verdure quantificabili del
pasto. Aromatici e condimenti non coprono la porzione. Se resta una frazione
mancante, viene aggiunto o ridimensionato un contorno V e salvata soltanto la
quantità residua. Dopo un Roll la copertura viene normalizzata nuovamente; un
contorno divenuto superfluo viene rimosso.

### Programmazione

L'inventario non filtra più la generazione settimanale. Le verdure ad alta
deperibilità sono favorite a inizio settimana, quelle medie al centro e quelle
durevoli verso il fine settimana. Questa è una priorità, non un'esclusione.

Le sequenze C e P restano esatte ma vengono abbinate soltanto dove il nuovo
ricettario possiede copertura. Se, per esempio, Patate è disponibile soltanto
con una proteina compatibile, la sua posizione viene assegnata a quello slot
senza cambiare il numero settimanale richiesto. La settimana è scritta soltanto
dopo la costruzione completa.

### Pasto odierno

`Salvafrigo` genera ora una vera alternativa compatibile usando come priorità
scadenze, avanzi e freezer. La scorta non diventa un divieto: senza urgenze il
pool nutrizionalmente valido resta utilizzabile. Il pasto originariamente
programmato viene conservato in `programmatoOriginale` e mostrato come
riferimento.

### UI C/P/V

La vista Pasto v12 mostra tre righe separate Carboidrato, Proteina e Verdura.
Il Roll è collocato a destra della relativa riga ed è disabilitato senza una
variante reale. Il riepilogo della Programmazione usa la stessa separazione.
`Proponi nuovo pasto` resta distinto dai tre Roll.

## Verifiche automatiche

- `tests/lotto-g-atomic-realizations.test.js`;
- `tests/lotto-g-weekly-generation.test.js`.

Il test settimanale inizializza realmente i cataloghi v21/v68 e ripete 20
generazioni complete da 14 pasti con inventario vuoto, snapshot quantitativi e
copertura verdura completa.

## Confine Lotto H

DOM, IndexedDB, responsive Android, service worker e migrazione reale devono
ancora essere verificati in un browser. Nessuna release è autorizzata.
