# DietaPlanner — Review ricette DB

Questo file è la memoria persistente delle combinazioni emerse durante i test del motore che risultano realmente scoperte o debolmente coperte nel database ricette.

## Regola di utilizzo

- Non aggiungere una ricetta solo perché manca la combinazione nominale esatta: il motore lavora prima per funzione/macrocategoria.
- Prima di dichiarare una lacuna prova, nell'ordine: ricetta compatibile → completamento con jolly pane quando il carboidrato è libero → composizione runtime carboidrato + secondo + contorno.
- **CRITICA**: non è possibile realizzare uno slot valido o rispettare un vincolo HARD.
- **ALTA**: il modulare salva lo slot ma manca completamente una realizzazione alternativa richiesta (unico/sfiziosa) per quella funzione.
- **MEDIA**: esiste un solo percorso utile e la rotazione rischia di diventare ripetitiva.
- **BASSA**: manca il match esatto ma il fallback funzionale è soddisfacente.
- Quando una lacuna viene corretta, marcarla RISOLTA invece di cancellarla.

## Evidenze attive dopo stress v36–v40

Al momento **nessuna lacuna CRITICA generale di macrocategoria** è emersa dai test automatici: tutte le macro dispongono di unici completi o completabili e, in assenza del record preciso, il motore dispone della composizione runtime.

Restano da raccogliere qui le combinazioni concrete che verranno registrate da `reviewRicetteMancanti` nell'uso reale o nei futuri test dinamici con inventario/storico specifico. Una registrazione entra in questo file solo dopo aver verificato che non sia un errore del motore o un Set contraddittorio.

## Copertura osservata degli `unico`

| Macro | Completi | Complet. con pane | Record senza verdura |
|---|---:|---:|---:|
| Carne | 10 | 12 | 8 |
| Pesce | 24 | 2 | 5 |
| Formaggi | 9 | 5 | 0 |
| Uova | 4 | 1 | 0 |
| Legumi | 8 | 1 | 0 |

I record “senza verdura” non sono automaticamente errori: possono restare preparazioni utili e diventare un piatto completo tramite contorno/composizione. Il dato serve soprattutto a individuare dove il DB potrebbe essere rinforzato in futuro per offrire maggiore varietà di ricette native.

## Candidati MEDIA da valutare quando lavoreremo sul DB

- **Carne**: è la macro con più record unici che necessitano completamento funzionale; utile aumentare la varietà di unici nativi completi, ma non blocca il motore.
- **Pesce**: copertura nativa completa già ampia; i pochi record senza verdura possono restare preparazioni parziali.
- **Uova**: copertura numericamente più piccola delle altre macro (4 unici completi + 1 completabile con pane); è una buona candidata per aumentare la varietà, senza urgenza funzionale.
- **Legumi**: copertura sufficiente ma concentrata su alcune famiglie di carboidrati; da osservare nel log Review prima di aggiungere combinazioni.

## Riclassificazioni risolte dal motore

Le seguenti non sono più considerate lacune DB solo perché mancava il carboidrato:

- `Uova strapazzate con zucchine e parmigiano`;
- `Insalata di tonno, pomodoro e mozzarella`;
- `Petto di pollo con zucchine e insalata`;
- `Melanzane alla parmigiana leggera`.

Proteina + verdura possono essere completate con pane quando la funzione carboidrato è libera. Se invece il layer aveva già determinato riso/farro/pasta/etc., quel carboidrato viene mantenuto e si usa la composizione runtime: il pane non può sovrascrivere una scelta già determinata.

`Filetto di nasello con patate al forno`, che non contiene una verdura riconosciuta, resta una preparazione utilizzabile ma non un pasto completo autonomo; può essere completato da un contorno. Non è quindi classificato CRITICO.

## Storico risoluzioni

- **v35** — carboidrato mancante riclassificato come completabile con jolly/composizione.
- **v36** — carboidrato già determinato dal layer protetto dal fallback pane.
- **v37** — eliminato falso conteggio Friselle/Panificati nel ramo `Poco tempo`; la ricetta visualizzata ora corrisponde alla famiglia contabilizzata.
- **v38** — filtro stagionale e coerenza disponibilità/verdura ricorrente ripristinati.
- **v39** — assegnazioni Ricettario HARD rese esplicite alla fonte.
- **v40** — eliminati Set colazione contraddittori tra componente scelta ed esclusione.
