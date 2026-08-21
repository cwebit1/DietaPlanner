# DietaPlanner — rapporto di conformità v78

## Esito

La v78 sostituisce la composizione basata su sugo e cottura aggiunti con una composizione insiemistica basata sul campo `copertura` delle ricette.

## Catalogo

- 326 ricette totali; 282 ricette per pranzo/cena.
- Ogni ricetta per pranzo/cena ha almeno un token valido tra `PC`, `PP`, `PF`, `PU`, `PL`, `C`, `V`.
- Zero componenti modulari di tipo `sugo`.
- Nomi normalizzati con iniziale maiuscola.
- Porzioni autonome dei contorni normalizzate: insalata 70 g, verdure 200 g, piselli confezionati/surgelati 120 g.
- Le ricette con due fonti proteiche a porzione piena sono speciali: Insalata di tonno, pomodoro e mozzarella; Scaloppine al taleggio; Cotoletta di pollo con emmental.
- Aggiunte Pizza Margherita e Pizza alle Verdure come piatti speciali.

## Nutrizione dei nuovi piatti speciali

- Pizza Margherita: valori medi CREA per Pizza Napoletana Margherita STG, riportati alla porzione applicativa di 300 g.
- Pizza alle Verdure: proxy prudente basato sulla voce CREA “pizza con pomodoro”, riportato alla porzione applicativa di 300 g.
- Il catalogo conserva fonte e valori per 100 g; la ricetta conserva il totale della porzione.

## Motore

- Requisito del pasto: `{proteina della macro assegnata, C, V}`.
- Risultato: un elenco senza duplicati `realizzazioni[]`; ogni elemento conserva `ricettaId` e la copertura fornita.
- Una ricetta completa può possedere più righe UI senza essere conteggiata due volte.
- I riempitivi vengono scelti soltanto per i token mancanti.
- I primi con due fonti di carboidrati restano fallback: sono scartati quando esiste un primo equivalente a fonte singola.
- Refresh e ricerca sostituiscono la ricetta proprietaria della cella e ricompletano soltanto i token mancanti.
- `primoSugoId` e `cotturaSecondo` sono sempre `null` nei nuovi pasti.

## Inventario, spesa e storico

- `scalaInventarioPerRicetta` rifiuta sempre una ricetta con `piattoSpeciale:true`.
- Il consumo automatico non scala un piatto speciale, indipendentemente dalla modalità.
- La lista spesa ignora i piatti speciali.
- Inventario, nutrizione e storico usano gli ID unici di `realizzazioni`, evitando doppi conteggi quando una ricetta copre più celle.

## Migrazione

- `ingredienti.json`: versione 6.
- `ricette.json`: versione 11.
- All'aggiornamento del catalogo vengono eliminati dal database locale i vecchi template sugo e i primi generati a runtime.
- I campi legacy restano compilati soltanto quando la sorgente è indipendente, per compatibilità con le viste non ancora migrate; `realizzazioni` è la fonte primaria.

## Verifiche automatiche

- Sintassi di `engine-core.js`, `motor.js` e dei quattro script inline di `index.html`.
- Test di conformità, dati, regole pure e contratto UI.
- Simulazione del motore sulle cinque macro proteiche con controllo dell'unione di copertura.
