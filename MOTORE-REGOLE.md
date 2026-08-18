# DietaPlanner — Regole normative del motore

Versione regole: 1.1 — 18/08/2026

Questo file è il riferimento stabile per ogni modifica futura al motore di generazione. Prima di correggere o aggiungere logica al motore, verificare che la modifica rispetti queste regole. Il motore considerato qui riguarda SOLO colazione, pranzo e cena.

## 1. Gerarchia normativa

1. Le scelte esplicite dell'utente hanno precedenza e NON vengono sovrascritte dal motore.
2. I controlli offerti dal Set devono essere trattati come scelte compatibili con il percorso alimentare.
3. La guida/PDF completa soltanto ciò che l'utente non ha definito.
4. Preferenze, esclusioni, rotazione e varietà si applicano solo agli spazi rimasti liberi e non possono cancellare una scelta esplicita dell'utente.
5. La ricetta è l'ultimo livello: prima si determina cosa deve contenere il pasto, poi si cerca come realizzarlo.

Formula: SCELTE USER -> FILTRI/PREFERENZE -> COMPLETAMENTO GUIDA -> ROTAZIONE/VARIETA -> INGREDIENTE/SOTTOCATEGORIA -> RICETTA/PREPARAZIONE.

## 2. Principi del PDF applicabili al motore

- Il percorso deve rimanere flessibile e non rigido.
- I pasti si costruiscono scegliendo alimenti appartenenti ai gruppi previsti.
- La varietà va ricercata nel tempo; non significa obbligatoriamente cambiare ogni singolo alimento ogni giorno.
- Pranzo e cena possono essere separati in portate oppure uniti in un piatto unico.
- La verdura deve essere presente a pranzo e cena. Fresca e surgelata sono nutrizionalmente equivalenti.
- Sono verdure anche fagiolini/cornetti, funghi e zucca. Patate, mais e legumi non sono verdure. I piselli freschi possono essere considerati verdura occasionalmente.
- Una fonte di carboidrati deve essere presente a pranzo e cena. La funzione nutrizionale viene prima dell'ingrediente concreto: riso, farro, orzo, pasta, pane, patate, polenta ecc. sono realizzazioni diverse della stessa funzione generale di fonte di carboidrati, salvo i limiti specifici previsti.
- È consigliabile almeno un alimento integrale in uno dei tre pasti principali, quando l'informazione è disponibile nei dati.
- Olio extravergine di oliva è il grasso di condimento preferenziale; i grassi non devono essere usati come criterio di anti-ripetizione del pasto.

## 3. Frequenze proteiche pranzo/cena

Le frequenze riguardano i pasti ordinari e vengono completate dal motore soltanto negli slot non definiti dall'utente.

- Carne: 1-3 volte/settimana; prediligere carne bianca.
- Carne rossa: massimo 1 volta/settimana.
- Affettati/insaccati: massimo 1 volta/settimana.
- Pesce, molluschi e crostacei: 2-3 volte/settimana.
- Pesce di grande taglia: massimo 1 volta/settimana.
- Pesce conservato: massimo 1 volta/settimana.
- Formaggi: 2-3 volte/settimana.
- Uova: 1-2 volte/settimana.
- Legumi e derivati: 2-3 o più volte/settimana. Il motore può usarli oltre 3 quando serve a completare la settimana senza violare gli altri tetti.
- Pasta di legumi 100%: fonte proteica, non sostituisce la fonte di carboidrati. Pasta mista non 100% legumi resta assimilabile alla pasta normale.

## 4. Carboidrati e Set

- Ogni pranzo/cena ordinario deve avere una fonte di carboidrati.
- Le caselle del Set sono QUOTE/PREFERENZE SETTIMANALI, non obbligano l'utente ad assegnare il carboidrato a un giorno preciso.
- L'utente può impostare da 0 a 14 preferenze complessive.
- Le quote esplicite vengono distribuite dal motore negli slot liberi.
- Gli slot non coperti dalle quote vengono completati automaticamente con rotazione e varietà.
- Un pasto già deciso dall'utente che contiene un carboidrato coerente consuma la corrispondente quota quando il tipo è riconoscibile.
- I carboidrati razionati mantengono il proprio tetto individuale; il gruppo razionato ha anche il limite globale stabilito dal Set.
- Friselle: massimo 1 pasto/settimana secondo la regola applicativa già confermata nell'app.
- Refresh del carboidrato: cambia la realizzazione concreta mantenendo invariati gli altri vincoli dello slot.
- Refresh del sugo: mantiene il carboidrato e cambia soltanto il condimento compatibile.

## 5. Verdure

- Disponibilità verdure = esclusione HARD dalle proposte automatiche; massimo 7 esclusioni configurabili.
- Verdure da favorire = priorità, non obbligo.
- Priorità temporale domestica confermata nell'app: primi giorni freschi/deperibili, poi freschi duraturi, poi confezionati/surgelati secondo la progressione definita nel Set.
- Le verdure favorite hanno prevalenza e la loro rotazione deve evitare ripetizioni inutili quando esiste un'altra favorita idonea.
- Verdura ricorrente = vincolo HARD sul singolo pranzo/cena programmato; massimo 5 pasti/settimana per la stessa verdura.
- Se uno slot ha una verdura ricorrente e non esiste un contorno compatibile, il motore non deve sostituirla silenziosamente con un'altra verdura: deve lasciare la lacuna/segnalarla.

## 6. Preferenze proteiche e tempo

- Preferenza proteica negativa: una sola categoria; è una penalizzazione, non un'esclusione assoluta. Il motore la mantiene al minimo compatibile quando esistono alternative.
- Poco tempo a pranzo/cena: aumenta con priorità obbligatoria la famiglia pane/bruschette/friselle nello slot indicato, rispettando comunque i tetti individuali (es. friselle).
- Ho tempo: nessuna forzatura di quella famiglia.

## 7. Pasti impostati direttamente dall'utente

- Un pasto confermato manualmente dal Piano è HARD.
- Una ricetta assegnata dal Ricettario a un giorno e pasto è HARD.
- Genera menu non deve sovrascrivere questi pasti nemmeno durante un refresh completo della settimana.
- Se l'utente ha assegnato soltanto una parte di un pasto a portate (primo, secondo o contorno), quella parte resta HARD e il motore completa soltanto le componenti mancanti.
- Un pasto ordinario definito dall'utente partecipa ai conteggi nutrizionali/frequenze della settimana quando la sua macrocategoria è riconoscibile.

## 8. Pasti speciali

- Massimo 2 pasti speciali per settimana, regola applicativa confermata dall'utente.
- Sono deliberati dall'utente, mai proposti automaticamente dal generatore settimanale.
- Non partecipano al conteggio settimanale delle frequenze proteiche/carboidrati e non generano compensazioni prima o dopo.
- Occupano il loro slot e non devono essere sovrascritti dal motore.
- Il motore completa il resto della settimana senza tentare di compensare il pasto speciale.
- La regola riflette il PDF: il pasto libero/speciale non deve essere bilanciato o compensato e conta l'alimentazione complessiva.

## 9. Colazione

- Il motore gestisce la colazione separatamente da pranzo/cena.
- Il Set definisce i componenti della colazione e i giorni in cui applicarli.
- Nei giorni selezionati la composizione salvata nel Set viene applicata esattamente: anche `nessuno` su un gruppo è una scelta esplicita e non viene riempita dal motore.
- Nei giorni non selezionati il motore sceglie una combinazione coerente dalla matrice automatica, con rotazione e senza usare gli ingredienti esclusi dalla sola colazione.
- Le esclusioni colazione non devono influire su pranzo/cena.
- Bibita è descrittiva e non entra nel calcolo nutrizionale.
- Le combinazioni automatiche devono essere culinarmente sensate: non pescare ingredienti indipendenti senza una combinazione validata.
- Il PDF considera grassi e carboidrati semplici facoltativi e contempla colazioni occasionalmente diverse dal solito 1-2 volte/settimana.
- Regola applicativa confermata: dopo 5 colazioni morigerate consecutive deve essere proposta all'utente la possibilità del Budino premio. Il premio è una scelta, non una sostituzione forzata. Dopo la decisione il contatore riparte da zero.
- Una colazione ordinaria già programmata non deve nascondere il premio maturato: scegliendo `standard` resta la colazione prevista; scegliendo `Budino` viene sostituita deliberatamente dall'utente.

## 10. Rotazione e storico

- La rotazione automatica usa come storico principale i pasti realmente CONSUMATI, non le sole proposte.
- Ordine concettuale di scelta: macrocategoria -> sottocategoria -> ingrediente/ricetta concreta.
- Tra alternative equivalenti prevalgono quelle usate meno nella settimana e/o meno recentemente.
- Evitare la stessa ricetta nella stessa settimana quando esistono alternative valide; una preferenza esplicita dell'utente può derogare.
- I pasti speciali non alimentano i conteggi usati per compensare/dirigere il piano ordinario.
- Le scelte già fissate dall'utente non vengono cambiate per migliorare la rotazione.

## 11. Realizzazione culinaria dopo la griglia alimentare

La domanda del motore è prima: "cosa deve esserci in questo slot?" e solo dopo "come lo preparo?".

### Portate
Modalità automatica predefinita. Deve realizzare carboidrato + proteina + verdura mantenendo i vincoli dello slot.

### Piatto unico
- Deve rappresentare la stessa struttura funzionale già determinata.
- Match in ordine: ingredienti esatti -> sottocategorie -> macrocategorie compatibili.
- Il match esatto ha priorità, ma una variante funzionalmente equivalente può essere proposta quando il vincolo non è HARD (es. altro carboidrato o altra verdura della stessa funzione).
- Una verdura ricorrente programmata è HARD e non può essere sostituita da una verdura diversa nel fallback macro.
- La macrocategoria proteica determinata dallo slot deve restare invariata.
- Se non esiste un record unico compatibile, tentare prima il completamento/composizione funzionale previsto dalla sezione v35; registrare in `reviewRicetteMancanti` soltanto se anche questo fallisce.

### Ricetta sfiziosa
Stessa logica del piatto unico: compatibilità per macro/sottocategorie, non enumerazione di ogni combinazione possibile.

### Speciale
Ramo deliberato dall'utente e fuori dai conteggi ordinari.

### Salvafrigo
Resta una modalità di scelta del pasto/portata guidata da inventario e scadenze, ma deve rispettare la macrocategoria già fissata quando sostituisce una sola componente.

## 12. Invarianti da testare dopo ogni modifica motore

1. Nessuna scelta HARD user viene sovrascritta da Genera menu.
2. Ogni pranzo/cena ordinario generato contiene carboidrato + proteina + verdura.
3. Pasti speciali <= 2/settimana e fuori dai conteggi.
4. Friselle <= 1/settimana.
5. Carne rossa <= 1, affettati/insaccati <= 1, pesce grande <= 1, pesce conservato <= 1 nei pasti ordinari automatici.
6. Frequenze macro proteiche rispettate sugli slot ordinari disponibili.
7. Verdure disattivate mai proposte automaticamente.
8. Verdura ricorrente rispettata negli slot programmati.
9. Preferenze verdure e deperibilità influenzano la priorità senza violare i vincoli HARD.
10. Ingredienti esclusi dalla colazione non compaiono nelle colazioni automatiche e restano disponibili a pranzo/cena.
11. Budino premio disponibile dopo 5 colazioni morigerate consecutive anche se esiste già una colazione ordinaria programmata per quel giorno.
12. Refresh di una componente non cambia le altre macrocategorie/vincoli dello slot.
13. Piatto unico/sfiziosa non alterano la struttura funzionale della griglia; se manca match, registrazione Review.
14. Rigenerare la settimana cambia solo gli elementi generati dal motore, non quelli scelti/programmati dall'utente.

## Piatto unico per composizione funzionale (v35)

- Una ricetta con proteina + verdura che manca soltanto della quota carboidrati non è una lacuna: il motore aggiunge **pane** come jolly assoluto nella dose prevista.
- Se non esiste un record `unico` adatto ma i layer hanno già definito **carboidrato + secondo + contorno**, il motore può comporli in un unico piatto. Se manca il carboidrato concreto prova prima **cous cous**, poi **pane** come fallback universale.
- La composizione non modifica i vincoli HARD già definiti.
- Le composizioni sono create solo quando servono e deduplicate (`fonte=composta_runtime`, `chiaveComposta`): non si pre-genera un database combinatorio.
- Si registra una lacuna in Review solo quando non esiste né ricetta compatibile, né completamento con pane, né composizione funzionale valida.

### Vincolo sul carboidrato già determinato (v36)

- Quando il layer alimentare ha già assegnato un carboidrato allo slot, la realizzazione `unico/sfiziosa` non può sostituirlo con pane solo per adattarsi a una ricetta del DB.
- Un primo HARD assegnato dal Ricettario deve essere analizzato per inferirne la famiglia di carboidrato anche quando non possiede `primoCereale`.
- Il jolly pane è universale solo quando la funzione carboidrato è ancora libera oppure quando il pane è già la funzione scelta; altrimenti si usa la composizione runtime con il carboidrato determinato dal layer.

### Fattibilità Set proteico parziale (v36)

- Ogni nuova scelta proteica nel Set viene accettata soltanto se, dopo averla inserita, il numero di slot pranzo/cena ancora liberi è almeno uguale alla somma dei deficit verso i minimi delle macro non ancora soddisfatte.
- Questo controllo non completa il piano e non sovrascrive scelte user: impedisce soltanto di creare un Set parziale matematicamente impossibile da completare.

### Poco tempo e quote carboidrati (v37)

- `Poco tempo` favorisce pane/bruschette/friselle senza consumare gli slot che sono matematicamente necessari per soddisfare quote carboidrati esplicite già scelte nel Set.
- Il motore mantiene un conteggio degli slot in cui deve ancora scegliere il carboidrato: usa il jolly rapido soltanto quando gli slot residui sono più numerosi delle quote esplicite residue.
- Se le quote residue occupano tutta la capacità rimasta, prevalgono le quote user; `Poco tempo` non può cancellarle.
- Una ricetta rapida visualizzata deve corrispondere alla famiglia realmente contabilizzata: se il motore ha scelto `friselle`, mostra una ricetta di friselle; se ha scelto `pane`, non può mostrare friselle. Questo mantiene reale il tetto Friselle <= 1/settimana.
- Eventuali quote rimaste impossibili da collocare perché l'utente ha successivamente occupato slot con pasti speciali/HARD vengono riportate nel report motore e non producono compensazioni sui pasti speciali.
