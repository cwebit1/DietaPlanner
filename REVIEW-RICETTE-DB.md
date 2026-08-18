# DietaPlanner — Review ricette DB

Questo file è la memoria persistente delle combinazioni emerse durante i test del motore che risultano scoperte o debolmente coperte nel database ricette.

## Regola di utilizzo

- Non aggiungere ricette solo perché manca la combinazione ingredienti esatta: il motore lavora prima per funzione/macrocategoria e poi cerca una realizzazione culinaria compatibile.
- Registrare come **CRITICA** una lacuna che impedisce di realizzare uno slot valido (carboidrato + proteina + verdura) oppure un vincolo HARD.
- Registrare come **ALTA** una macrocategoria/carboidrato/verdura con nessuna ricetta unica compatibile ma con percorso modulare ancora disponibile.
- Registrare come **MEDIA** una copertura molto sottile (un solo candidato), perché la rotazione rischia ripetizioni.
- Registrare come **BASSA** una combinazione esatta assente ma coperta correttamente tramite fallback di macro/sottocategorie.
- Le nuove evidenze vengono aggiunte senza cancellare le precedenti; quando una lacuna viene corretta in `ricette.json`, marcarla RISOLTA invece di rimuoverla.

## Evidenze attive

### ALTA — piatti `unico` presenti ma non completi secondo il motore

- **uova / zucchine / carboidrato mancante** — `Uova strapazzate con zucchine e parmigiano` contiene proteina + verdura ma nessuna fonte di carboidrati. Non può rappresentare da sola un pranzo/cena ordinario; va mantenuta come componente/ricetta parziale oppure affiancata da nuove varianti complete.
- **pesce conservato / pomodoro-insalata / carboidrato mancante** — `Insalata di tonno, pomodoro e mozzarella` contiene proteina + verdura ma nessuna fonte di carboidrati. Serve rinforzare il DB con almeno una realizzazione completa della stessa famiglia.
- **carne bianca / zucchine-insalata / carboidrato mancante** — `Petto di pollo con zucchine e insalata` non contiene una fonte di carboidrati. La famiglia carne bianca ha comunque almeno una realizzazione completa (`Pollo al limone e rosmarino con verdura e pane`), quindi la lacuna è di varietà/rotazione e non blocca l'intera macro.
- **pesce bianco / patate / verdura mancante** — `Filetto di nasello con patate al forno` ha proteina + carboidrato ma non una verdura riconosciuta dal percorso. Va affiancata da una versione completa o trattata come preparazione parziale.
- **formaggio fresco / melanzane-pomodoro / carboidrato mancante** — `Melanzane alla parmigiana leggera` ha proteina + verdura ma non una fonte di carboidrati. La macro formaggi dispone di altri unici completi (es. polenta/stracchino/radicchio, pasta/brie/verdure), quindi qui serve soprattutto rinforzo di varietà.

### MEDIA — copertura presente, da rinforzare per evitare ripetizioni

- **carne bianca / pane / insalata** — almeno una ricetta completa verificata (`Pollo al limone e rosmarino con verdura e pane`); verificare quanti candidati equivalenti restano dopo esclusioni/preferenze.
- **uova / patate o pane / verdura** — presenti `Frittata con zucchine e patate`, `Frittata con spinaci, verdura e pane`, `Insalata mista con uova sode e pane`; copertura buona ma da verificare sulle altre famiglie di carboidrati del Set.
- **legumi / pasta-riso-cous cous / verdura** — presenti più combinazioni complete (`Pasta con ceci e pomodoro`, `Riso e lenticchie con carote`, `Pasta e fagioli`, `Cous cous con zucchine e ceci e menta`, `Ramen con tofu e verdura`). Al momento non emerge una carenza generale della macro; restano da verificare le singole famiglie del Set.
- **crostacei / riso-farro / verdura** — presenti almeno `Gamberetti saltati con peperoni e riso` e `Farro con zucchine e gamberetti`; copertura iniziale discreta, da verificare sulle altre fonti di carboidrati.
- **formaggio fresco / polenta-pasta-farro / verdura** — presenti più unici completi; resta da controllare la distribuzione sulle fonti di carboidrati meno rappresentate.

## Combinazioni da scandire sistematicamente

Il test automatico `test_set_matrix.py` mantiene l'elenco macchina in `review-ricette-db.json` quando viene eseguito. La matrice da coprire è:

- ogni macrocategoria proteica × ogni famiglia di carboidrati disponibile nel Set;
- ogni macrocategoria proteica × verdura ricorrente HARD;
- sottotipi limitati (carne rossa, affettati, pesce grande, pesce conservato) × realizzazioni complete;
- configurazioni con esclusioni verdure e con verdure preferite;
- combinazioni `piatto unico`/`sfiziosa` dopo che lo slot alimentare è già stato deciso dal motore.

## Storico risoluzioni

_Nessuna._

## Riclassificazione v35 — carboidrato mancante

Non sono più considerate lacune DB le ricette che hanno già **proteina + verdura** e mancano soltanto del carboidrato: vengono completate con il jolly pane. Se non esiste un `unico` adatto ma esistono secondo e contorno coerenti, il motore prova la composizione funzionale con il carboidrato già deciso; in assenza di uno specifico usa cous cous e infine pane.

Casi precedentemente sospetti come *Uova strapazzate con zucchine e parmigiano*, *Insalata di tonno, pomodoro e mozzarella*, *Petto di pollo con zucchine e insalata* e *Melanzane alla parmigiana leggera* sono quindi **COPERTI PER COMPOSIZIONE/JOLLY** e non richiedono una nuova ricetta solo per aggiungere il carboidrato.
