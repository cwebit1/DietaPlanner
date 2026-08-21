# DietaPlanner v72 — rapporto di conformità

## Fonti

1. `REGOLE_FLUSSO_LOGICO.md` — comportamento dominante.
2. Valori nutrizionali già recepiti nella configurazione canonica.
3. `REQUIREMENTS-MATRIX.md` — collegamento tra regola, responsabile e controllo.

## Correzioni chiuse in v72

- Menu vuoto renderizzabile senza generare implicitamente colazioni o pasti.
- Slot vuoti non diventano “consumati” soltanto perché la fascia oraria è trascorsa.
- Consumo automatico ammesso soltanto per voci con contenuto e `programmatoIl` antecedente alla scadenza.
- Tabelle Set carboidrati e proteine con Pulisci, Completa, Casuale e Salva.
- Gallette e crackers non limitati; friselle con massimo individuale 2; totale 14, max 6 per tipo e max 3 limitati.
- Origine utente/sistema visibile nelle celle carboidrati generate.
- Cereali non graditi con salvaguardia di almeno un’alternativa.
- Tetti settimanali per singolo ingrediente, trasversali e con fallback segnalato.
- Ricerca diretta “Cosa ti va di mangiare oggi?” per Carbo/Prot/Verdura, comprendente le ricette `soloManuale` ma rispettosa dei vincoli hard nutrizionista.
- Profili onnivoro/vegetariano/vegano, allergeni combinabili e ingredienti esclusi restano nell’area nutrizionista e vengono applicati a cascata.
- Configurazione nutrizionista estesa a spuntini e cooldown; i valori vengono applicati al runtime.
- Priorità Salvafrigo automatica collegata all’inventario reale.
- Lista spesa verificata come deficit cumulativo con arrotondamento al formato.
- Bozza Menù separata dal piano e commit IndexedDB atomico.
- Storico `consumoGiorno` indipendente dal reset piano e cancellato esclusivamente dai reset storico espliciti.
- Correzione generica mobile tramite `visualViewport` e centratura del campo attivo.

## Evidenze automatiche

- Sintassi: `engine-core.js`, `motor.js` e tutti i blocchi script di `index.html` validi.
- Dati: 137 ingredienti e 332 ricette referenzialmente coerenti.
- Allergeni: campo esplicito e derivazione verificata per ogni ricetta; esclusione testata per ogni coppia ricetta/allergene.
- Blocchi ingredienti: esclusione testata per ogni ingrediente di ogni ricetta.
- Motore: 100 settimane deterministiche generate rispettando frequenze e 14 slot.
- Test funzionali puri: proteina-first, affettati→pane, patate→unico completo, budget carboidrati, anti-ripetizione, verdure, urgenze inventario, poco tempo, tetti ingredienti, profili, lista spesa e consumo.
- Contratto UI: viste separate, tab Pasto/Speciale, tre righe macro, controlli Set, ricerca diretta, bozza e tastiera mobile.

## Comandi di collaudo

```sh
node --check engine-core.js
node --check motor.js
node tests/engine-core.test.js
node tests/data.test.js
node tests/ui-contract.test.js
node tests/conformance.test.js
```

La verifica browser sulla build GitHub Pages viene eseguita dopo il push, perché il browser cloud non può raggiungere il server locale del workspace.
