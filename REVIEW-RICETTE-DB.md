# DietaPlanner — Review ricette DB

Questo file è la memoria persistente delle combinazioni emerse durante i test del motore che risultano scoperte o debolmente coperte nel database ricette.

## Regola di utilizzo

- Non aggiungere ricette solo perché manca la combinazione ingredienti esatta: il motore lavora prima per funzione/macrocategoria e poi cerca una realizzazione culinaria compatibile.
- Registrare come **CRITICA** una lacuna che impedisce di realizzare uno slot valido (carboidrato + proteina + verdura) oppure un vincolo HARD.
- Registrare come **ALTA** una macrocategoria/carboidrato/verdura con nessuna ricetta unica compatibile ma con percorso modulare ancora disponibile.
- Registrare come **MEDIA** una copertura molto sottile (un solo candidato), perché la rotazione rischia ripetizioni.
- Registrare come **BASSA** una combinazione esatta assente ma coperta correttamente tramite fallback di macro/sottocategorie.
- Le nuove evidenze vengono aggiunte dai test senza cancellare le precedenti; quando una lacuna viene corretta in `ricette.json`, marcarla RISOLTA invece di rimuoverla.

## Evidenze attive

_Nessuna evidenza ancora registrata dal nuovo test automatico._

## Storico risoluzioni

_Nessuna._
