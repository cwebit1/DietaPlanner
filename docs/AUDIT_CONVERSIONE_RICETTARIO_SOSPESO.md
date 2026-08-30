# DietaPlanner — confronto ricettario sospeso e catalogo attivo

**Data:** 2026-08-30
**Sorgente attiva:** `db-ricette.json` v68, 39 template
**Sorgente confrontata:** archivio
`Vecchia versione 1.0/ricette-nuovo-formato-precedente.json`, 20 voci
**Esito tecnico:** conversioni approvate applicate e validate

Il confronto usa esclusivamente nomi e contenuto strutturale. In coerenza con
la regola di Cwe, le voci archiviate non vengono identificate tramite i loro
vecchi ID.

## Esito sintetico

- 10 voci risultano già rappresentate in modo equivalente o più ampio nel
  catalogo attivo;
- tutte le voci non equivalenti hanno ora una destinazione definita;
- la ricetta a doppia proteina con uovo ed emmental è stata scartata da Cwe e
  non deve essere convertita;
- il pasto con formaggio, crackers/gallette/taralli e verdura è coperto dalla
  composizione automatica C/P/V e non deve diventare un template duplicato;
- la polenta con parmigiano è stata esclusa intenzionalmente per preferenza
  utente: la polenta resta abbinata ai formaggi a pasta molle;
- le insalate fredde di cereali mantengono i pomodorini e usano tre coppie di
  verdure estraibili a porzione piena: pomodorini+cetriolo,
  pomodorini+carote e pomodorini+peperoni;
- le proteine ammesse per questa famiglia fredda sono tonno conservato,
  salmone affumicato, emmental, mozzarella, feta e tofu; il salmone generico
  senza cottura non è valido;
- le verdure cotte o saltate non vanno associate ai cereali freddi: melanzane
  e zucchine restano contorni per secondi di carne o pesce; risotto di zucca e
  zucca al forno sono rinviati a una futura definizione di Cwe;
- i cereali in bianco con 5–6 g di parmigiano sono scartati: quella quantità è
  un condimento, non una fonte PF, il parmigiano non è gradito e le ricette con
  verdura fresca sono già disponibili;
- la ricetta generica "con verdure" mantiene pasta, cereali, ravioli e gnocchi
  e conserva gli otto sughi originari come alternative fisse. Gli ingredienti
  di sughi diversi non si incrociano fra loro; ogni sugo usa la dose parziale
  da sugo e attiva il completamento del solo residuo V;
- la ricetta con piselli diventa cereale + 1 uovo strapazzato + 60 g di piselli
  come sugo. Uovo e piselli formano insieme una quota proteica; i piselli
  contribuiscono parzialmente a V e il motore completa il residuo;
- per i sughi caldi viene usato soltanto `Piselli surgelati`; `Piselli in
  barattolo` resta riservato alle future ricette di pasta fredda;
- la zuppa mantiene il solo `Mix cereali e legumi`, acquistato già completo;
  non vengono create combinazioni modulari di orzo/farro con singoli legumi;
- nessuna voce deve essere importata in blocco e nessuna può usare come
  fallback il vecchio database.

## Voci già coperte

| Contenuto archivio | Template attivo | Esito |
|---|---|---|
| Pasta al pomodoro | Pasta al pomodoro | coperta |
| Cereale con taleggio e speck | Cereale con taleggio e speck | coperta |
| Pasta alla Norma | Pasta alla Norma | coperta |
| Pesce bianco con cotture | Pesce bianco con cotture | coperta e ampliata |
| Salsiccia al forno | Salsiccia al forno | coperta con classificazioni correnti |
| Uova con diverse cotture | Uova con diverse cotture | coperta e ampliata |
| Legumi/tofu con condimenti | Legumi e tofu con condimenti | coperta |
| Carne con diverse cotture | Carne con diverse cotture | coperta e ampliata |
| Insalate a foglia | Insalate a foglia e miste | coperta e ampliata |
| Insalate di ortaggi | Insalate e contorni di ortaggi | coperta e ampliata |

Queste dieci voci non vanno riconvertite: produrrebbero duplicati o una seconda
definizione concorrente dello stesso pasto.

## Decisioni aperte

Nessuna. Le modifiche approvate sono applicate nel catalogo v68 e coperte da
`tests/lotto-h-approved-recipe-conversion.test.js`.

## Decisioni concluse

| Contenuto originario | Decisione Cwe | Effetto |
|---|---|---|
| Cereale freddo con uovo, emmental e pomodoro | scartare la versione a doppia proteina | non convertire; restano le due ricette separate già attive |
| Formaggio + crackers/gallette/taralli + verdura | usare la composizione automatica del pasto | non convertire; il template C+PF attivo viene completato con una V coerente |
| Polenta con parmigiano | escludere per preferenza utente | non convertire; mantenere polenta con taleggio o gorgonzola |
| Cereale freddo con verdure crude | mantenere pomodorini come base e combinarli con cetriolo, carote o peperoni | tre combinazioni estraibili; ogni coppia vale 225 g totali, 112,5 g per verdura, e copre interamente V |
| Proteine delle insalate fredde di cereali | usare soltanto proteine adatte senza ulteriore cottura | PP: tonno conservato e salmone affumicato; PF: emmental, mozzarella e feta; PL: tofu; sostituire il salmone generico |
| Cereale freddo con verdure cotte | escludere questa associazione | melanzane e zucchine restano contorni per carne/pesce; risotto di zucca e zucca al forno sono ricette future, non definite né convertite ora |
| Riso/pasta/orzo/farro in bianco con parmigiano | scartare | 5–6 g sono solo condimento, il parmigiano non è gradito e restano le ricette con verdura fresca |
| Pasta, cereali, ravioli o gnocchi "con verdure" | convertire conservando gli otto sughi originari come opzioni fisse | nessun prodotto cartesiano fra sughi; dose parziale da sugo, stack sugli ingredienti effettivi e completamento quantitativo del residuo V |
| Riso/orzo/farro/cous cous con piselli | convertire cambiando il sugo | 1 uovo strapazzato + 60 g di piselli; quota proteica combinata e completamento del residuo V |
| Zuppa di cereali e legumi modulare | non convertire | mantenere soltanto `Mix cereali e legumi`, acquistato già completo |

## Regola per il passo successivo

Le destinazioni sono state tutte definite e applicate. Le destinazioni usate
nel confronto sono state:

1. convertire come nuovo template;
2. integrare un template attivo già esistente;
3. considerare sufficiente la composizione automatica del pasto;
4. scartare perché non interessa.

Le modifiche devono preservare lo schema gestito da `maschera-ricette.html`,
essere validate contro `ingredienti-new.json` e coperte da test del catalogo.
Non si copiano automaticamente dosi, nomi o ingredienti non più presenti nel
catalogo corrente.
