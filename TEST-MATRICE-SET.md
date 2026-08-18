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

Sono stati enumerati i profili di conteggio possibili entro i tetti attuali del Set, considerando 14 slot pranzo/cena.

- Profili matematicamente compatibili con i minimi del percorso: **1424**.
- Profili entro i soli tetti individuali ma incompatibili con i minimi delle altre categorie: **400**.

Esempio minimo del problema trovato: **9 legumi + 0 in tutte le altre categorie**. Restano 5 slot liberi, ma servono ancora almeno 6 slot per soddisfare carne 1 + pesce 2 + formaggi 2 + uova 1. Prima della correzione il Set poteva quindi accettare una configurazione impossibile pur rispettando i singoli tetti.

**Correzione applicata:** il salvataggio della tabella proteica del Set ora verifica anche la fattibilità globale: `somma deficit dei minimi <= slot ancora liberi`. Se la nuova selezione renderebbe impossibile completare il percorso, non viene salvata e viene mostrato un avviso.

## HARD granulari — scelta diretta dal Ricettario

È stato aggiunto un livello di protezione per componente:

- ricetta assegnata come **primo** → `hardPrimo`;
- ricetta assegnata come **secondo** → `hardSecondo`;
- ricetta assegnata come **contorno** → `hardContorno`;
- piatto unico/speciale confermato dall'utente → pasto interamente HARD;
- conferma manuale della colazione → colazione HARD.

Quando `Genera menu` viene rilanciato, per un pasto a portate con marker granulari vengono eliminati solo i componenti non HARD e il motore li ricostruisce. La componente scelta dall'utente resta invariata.

## Casi da proseguire

- Tutte le combinazioni di quote carboidrati da 0 a 14, incluse famiglie limitate e friselle.
- Combinazioni proteine Set + carboidrati Set + verdura ricorrente HARD.
- Esclusioni verdure 0–7 insieme a verdure preferite.
- “Poco tempo” a pranzo, cena e entrambi.
- Uno e due pasti speciali posizionati in giorni diversi, con Set parziale e completo.
- Pasto da Ricettario fissato come solo primo, solo secondo, solo contorno, due componenti e pasto completo.
- Colazione: nessuna preferenza, preferenza su alcuni giorni, ingredienti esclusi, colazione speciale, Budino premio dopo 5 colazioni regolari.
- Piatto unico/sfiziosa con match esatto, match solo per macro e nessun match (Review).

## Invariante di lavoro

Ogni nuova anomalia viene prima classificata come **errore del motore**, **configurazione Set incompatibile** oppure **lacuna del database ricette**. Solo l'ultima categoria va rinforzata aggiungendo/modificando ricette; il motore non deve essere deformato per mascherare una libreria povera.
