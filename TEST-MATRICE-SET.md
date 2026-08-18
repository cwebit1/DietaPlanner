# DietaPlanner — Matrice test Set

Aggiornamento: 18/08/2026.

Questo file registra i test del motore e le anomalie trovate durante l'esplorazione delle combinazioni del Set. Le lacune ricette vengono riportate separatamente in `REVIEW-RICETTE-DB.md`.

## Test già eseguiti

### Distribuzione proteica astratta

Con gli slot non definiti completati secondo minimi/target del percorso, i seguenti casi arrivano a una settimana completa coerente:

| Configurazione | Risultato finale |
|---|---|
| Set proteico vuoto | carne 3, pesce 3, formaggi 3, uova 2, legumi 3 |
| 1 scelta user: carne | carne 3, pesce 3, formaggi 3, uova 2, legumi 3 |
| 5 scelte parziali miste | carne 3, pesce 3, formaggi 3, uova 2, legumi 3 |
| una categoria indicata come “gradita meno” | i minimi vengono comunque preservati; la penalizzazione agisce solo oltre il minimo |
| 2 pasti speciali fuori conteggio | sugli altri 12 slot: carne 3, pesce 3, formaggi 2, uova 2, legumi 2; nessuna compensazione dei due speciali |
| Set quasi completo (12 scelte) | i 2 slot liberi vengono completati senza cambiare le 12 scelte |

### Esplorazione combinatoria dei conteggi del Set

La tabella Set permette una stessa categoria al massimo una volta per giorno; quindi i massimi realmente raggiungibili sono carne 3, pesce 3, formaggi 3, uova 2 e legumi 7.

Sono stati enumerati tutti i profili di conteggio raggiungibili entro questi tetti e con non più di 14 slot pranzo/cena:

- Profili matematicamente compatibili con i minimi del percorso: **1388**.
- Profili entro i tetti della UI ma incompatibili con i minimi delle altre categorie: **93**.

Esempio realmente ottenibile: **7 legumi + 3 formaggi + 2 uova** = 12 slot già fissati. Restano soltanto 2 slot, mentre per rispettare i minimi mancano ancora carne 1 + pesce 2 = 3 slot. Prima della correzione questa configurazione poteva essere salvata pur rendendo impossibile il completamento della settimana.

**Correzione applicata:** il salvataggio della tabella proteica del Set verifica ora anche la fattibilità globale: `somma deficit dei minimi <= slot ancora liberi`. Se una nuova selezione renderebbe impossibile completare il percorso, non viene persistita e viene mostrato un avviso.

### Quote carboidrati Set

Il Set carboidrati è stato sottoposto a uno stress test astratto con **50.000 configurazioni valide casuali**, da configurazione vuota fino a 14 quote, rispettando i tetti della UI:

- normali: pasta, pasta fresca, riso, farro, orzo, cous cous, pane, patate, polenta;
- limitati: friselle max 1; gnocchi, pasta ripiena, gallette, crackers, taralli/grissini/crostini, piadina e pasta sfoglia max 2;
- gruppo dei limitati: massimo 3 quote complessive nel Set.

Esito del passaggio attuale: **nessuna quota esplicita è rimasta inutilizzata nei 14 slot ordinari e nessun tetto individuale è stato superato**. Questo test riguarda la distribuzione pura; restano da incrociare quote carboidrati con pasti speciali, “poco tempo” e componenti HARD impostate dal Ricettario.

## HARD granulari — scelta diretta dal Ricettario

È stato aggiunto un livello di protezione per componente:

- ricetta assegnata come **primo** → `hardPrimo`;
- ricetta assegnata come **secondo** → `hardSecondo`;
- ricetta assegnata come **contorno** → `hardContorno`;
- piatto unico/speciale confermato dall'utente → pasto interamente HARD;
- conferma manuale della colazione → colazione HARD.

Quando `Genera menu` viene rilanciato, per un pasto a portate con marker granulari vengono eliminate solo le componenti non HARD e il motore le ricostruisce. La componente scelta dall'utente resta invariata.

Test locale eseguito: fissando soltanto il secondo, il secondo resta invariato mentre primo e contorno vengono ricostruiti; con un pasto interamente HARD non viene sostituita alcuna componente.

## Casi da proseguire

- Quote carboidrati + 1 o 2 pasti speciali: le quote eventualmente non realizzabili non devono provocare compensazioni sui pasti speciali.
- Quote carboidrati + “poco tempo” a pranzo, cena e entrambi: verificare la precedenza della famiglia pane/friselle rispetto alla quota settimanale e il tetto friselle.
- Combinazioni proteine Set + carboidrati Set + verdura ricorrente HARD.
- Esclusioni verdure 0–7 insieme a verdure preferite.
- Uno e due pasti speciali posizionati in giorni diversi, con Set parziale e completo.
- Pasto da Ricettario fissato come solo primo, solo secondo, solo contorno, due componenti e pasto completo.
- Colazione: nessuna preferenza, preferenza su alcuni giorni, ingredienti esclusi, colazione speciale, Budino premio dopo 5 colazioni regolari.
- Piatto unico/sfiziosa con match esatto, match solo per macro e nessun match (Review).

## Invariante di lavoro

Ogni nuova anomalia viene prima classificata come **errore del motore**, **configurazione Set incompatibile** oppure **lacuna del database ricette**. Solo l'ultima categoria va rinforzata aggiungendo/modificando ricette; il motore non deve essere deformato per mascherare una libreria povera.
