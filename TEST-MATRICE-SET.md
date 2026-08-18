# DietaPlanner — Matrice test Set

Aggiornamento: 18/08/2026 — motore v10, batch v40.

Questo file registra i test del motore e le anomalie trovate durante l'esplorazione delle combinazioni del Set. Le vere lacune della libreria ricette sono mantenute separatamente in `REVIEW-RICETTE-DB.md`.

## Principio verificato

Il Set può essere vuoto, parziale o quasi completo. Le scelte dell'utente occupano per prime lo spazio disponibile; il motore completa soltanto ciò che resta libero, applicando minimi/target, rotazione e varietà. Una configurazione parziale viene rifiutata soltanto quando è matematicamente impossibile completare i minimi senza modificare le scelte già fatte.

## Proteine

La distribuzione astratta con Set vuoto tende a carne 3, pesce 3, formaggi 3, uova 2, legumi 3. Scelte parziali vengono mantenute e il resto viene completato. La categoria indicata come meno gradita viene penalizzata oltre il minimo, non eliminata.

Sono stati enumerati **1481 profili proteici raggiungibili dalla UI** entro i tetti; **93** risultano incompatibili con i minimi perché occupano troppi slot. La UI ora controlla `deficitMinimi <= slotLiberi` prima di salvare una nuova selezione. Esempio bloccato: 7 legumi + 3 formaggi + 2 uova, perché i due slot residui non bastano a inserire carne 1 + pesce 2.

## Carboidrati

Stress v36: **100.000 configurazioni valide** da 0 a 14 quote senza superare i tetti. Friselle resta max 1; ciascun altro razionato rispetta il proprio limite e il gruppo razionati resta max 3.

Stress v37: **1800 combinazioni capacità/quote/poco-tempo** e **100.000 settimane casuali con 0–2 pasti speciali**. Esito OK. `Poco tempo` favorisce pane/friselle soltanto se non consuma uno slot necessario a una quota esplicita ancora da soddisfare. La ricetta mostrata viene vincolata alla famiglia contabilizzata: una quota `pane` non può materializzarsi come frisella e viceversa. Le quote che diventano oggettivamente non collocabili per slot occupati successivamente da speciali/HARD restano nel report e non generano compensazioni sugli speciali.

## Verdure

Stress v38: esito OK. Verificati filtro stagionale gennaio/agosto e priorità di consumo a quattro livelli: freschi → freschi duraturi → confezionati → surgelati, con ordine che cambia nel corso della settimana.

La verdura ricorrente resta HARD nei pasti programmati (max 5) e può derogare alla stagionalità perché è una scelta esplicita. Non può però essere contemporaneamente dichiarata non disponibile. Disponibilità verdure resta max 7 esclusioni. Le verdure preferite mantengono prevalenza e rotazione nel pool valido.

## Pasti speciali

Massimo **2 per settimana**. Occupano lo slot scelto dall'utente ma restano fuori dai conteggi ordinari e non provocano compensazioni. I test v37 includono settimane con 0, 1 e 2 speciali insieme alle quote carboidrati.

## Ricettario e marker HARD

Stress v39: esito OK. I marker vengono ora scritti direttamente alla fonte:

- primo → `hardPrimo`;
- secondo → `hardSecondo`;
- contorno → `hardContorno`;
- colazione → `hardColazione`;
- piatto unico/speciale → `hardPasto`.

Rilanciando `Genera menu`, vengono ricostruite soltanto le componenti non HARD. Passare deliberatamente da un piatto unico a una singola portata elimina lo stato HARD dell'intero pasto e il vecchio `ricettaId`, evitando stati fantasma.

## Colazione

Stress v40: esito OK. I giorni marcati nel Set ricevono esattamente la colazione configurata; negli altri giorni il motore usa la matrice di combinazioni coerenti. `colazioneIngredientiEsclusi` riguarda solo la colazione automatica e non pranzo/cena.

Il Set impedisce contraddizioni: un ingrediente non può essere contemporaneamente selezionato nella colazione predefinita ed escluso. Il Budino premio resta un ramo separato: dopo 5 colazioni regolari consecutive lo slot odierno resta disponibile per la scelta standard/Budino e il contatore viene poi azzerato.

## Piatto unico / sfiziosa

Il motore cerca prima una ricetta già presente compatibile con la struttura alimentare decisa. Se la ricetta possiede proteina + verdura ma manca soltanto il carboidrato e la funzione carboidrato è ancora libera, può completarla con pane. Se il carboidrato era già determinato, non viene sostituito per far entrare una ricetta: il motore passa alla composizione runtime con quel carboidrato.

Se non esiste un record unico idoneo, può comporre a richiesta carboidrato + secondo + contorno. Le composizioni sono lazy e deduplicate, quindi non richiedono un DB combinatorio.

Copertura rilevata nello stress v36, prima della composizione runtime:

| Macro | Unici completi | Complet. con pane | Unici senza verdura |
|---|---:|---:|---:|
| Carne | 10 | 12 | 8 |
| Pesce | 24 | 2 | 5 |
| Formaggi | 9 | 5 | 0 |
| Uova | 4 | 1 | 0 |
| Legumi | 8 | 1 | 0 |

Gli `unico` senza verdura non sono automaticamente lacune del DB: se esistono secondo/contorno modulari compatibili, la composizione funzionale completa il pasto. Solo il fallimento di ricetta, jolly e composizione viene registrato in Review.

## Report automatici validati

- `STRESS-V36-REPORT.md` — OK.
- `STRESS-V37-REPORT.md` — OK.
- `STRESS-V38-REPORT.md` — OK.
- `STRESS-V39-REPORT.md` — OK.
- `STRESS-V40-REPORT.md` — OK.

## Invariante di lavoro

Ogni nuova anomalia va classificata prima come **errore del motore**, **Set contraddittorio/impossibile** oppure **vera lacuna del database ricette**. Solo l'ultima categoria giustifica l'aggiunta di ricette; il motore non deve essere deformato per mascherare una libreria povera.
