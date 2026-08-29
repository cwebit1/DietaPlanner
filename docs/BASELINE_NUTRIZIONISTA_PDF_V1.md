# DietaPlanner — Baseline nutrizionista PDF V1.2

**Data baseline:** 2026-08-29  
**Fonte nutrizionale primaria:** `PERCORSO ALIMENTARE MIRIA SPILLER.pdf` (22 pagine, letto integralmente e verificato visivamente nelle tabelle principali).  
**Scopo:** documento di riferimento anti-regressione per tutti gli interventi su Setting nutrizionista, Set utente, `motor.js`, `engine-core.js`, `ingredienti.json` e `ricette.json`.

> Questo file NON applica ancora le correzioni al codice. Congela ciò che deve essere corretto, ciò che va preservato e l'ordine di intervento.

## 0. Gerarchia delle fonti

1. L'ultima istruzione esplicita di Cwe prevale sulle decisioni precedenti.
2. Per quantità, frequenze e indicazioni alimentari, comanda il PDF del nutrizionista.
3. Le regole applicative esplicitamente decise da Cwe ma non presenti nel PDF restano valide come **APP-CWE**, purché non vengano spacciate per prescrizioni del PDF.
4. Le regole tecniche necessarie al funzionamento dell'app restano **APP-TECH** e non possono alterare silenziosamente una prescrizione nutrizionale.
5. Costanti legacy, commenti e default del codice non sono fonti normative.
6. Prima di cambiare una regola si deve distinguere sempre tra: **hard exclusion**, **minimo**, **massimo**, **range consigliato**, **default prudente**, **preferenza soft**, **regola applicativa**.

## 1. Semantica dei range

Quando il PDF esprime un range, vanno conservati separatamente:
- limite/riferimento inferiore del PDF;
- limite/riferimento superiore del PDF;
- eventuale valore di default scelto dall'app.

Decisione applicativa già consolidata: quando serve un singolo valore iniziale configurabile, il default parte normalmente dal **valore inferiore del range**. Questo NON trasforma il valore inferiore nel massimo clinico.

Esempi:
- Colazione speciale PDF 1-2/settimana -> default applicativo 1, massimo PDF 2.
- Spuntino granita PDF 2-3/settimana -> default applicativo 2, massimo PDF 3.
- Olio EVO PDF 2-3 cucchiaini -> default applicativo 2 cucchiaini (~10 g), range PDF fino a 3 cucchiaini (~15 g).

## 2. Valori PDF consolidati

### 2.1 Proteine — frequenze
- Carne: 1-3/settimana.
- Pesce, molluschi e crostacei: 2-3/settimana.
- Formaggi: 2-3/settimana.
- Uova: 1-2/settimana.
- Legumi e derivati: 2-3 o più/settimana; **nessun massimo superiore esplicito nel PDF**.

### 2.2 Sottotipi da limitare
- Carne rossa: 0-1/settimana.
- Affettati/salumi/insaccati: 0-1/settimana.
- Pesce di grande taglia: 0-1/settimana.
- Pesce conservato, incluso salmone affumicato: 0-1/settimana.
- Lo speck appartiene alla famiglia affettati/salumi e deve contribuire al relativo conteggio.

### 2.3 Porzioni proteiche pranzo/cena
- Carne bianca: 100-150 g.
- Carne rossa: 100-150 g.
- Affettati: ~60 g.
- Insaccati: ~60 g.
- Pesce bianco: 150-180 g.
- Pesce azzurro: 100-150 g.
- Pesce di grande taglia: 100-150 g.
- Molluschi: ~250 g.
- Crostacei: 150-200 g.
- Tonno/sgombro conservato: ~100 g sgocciolato.
- Salmone affumicato: ~100 g.
- Formaggi freschi: 80-100 g.
- Formaggi stagionati: ~40 g.
- Ricotta: ~100 g.
- Fiocchi di latte: 100-130 g.
- Uova: 2 pezzi.
- Legumi cotti: 120-150 g.
- Legumi secchi: 40-50 g.
- Pasta/farina di legumi 100%: 40-50 g.
- Tofu: 180-200 g.
- Tempeh: 75-100 g.

### 2.4 Carboidrati pranzo/cena
- Pasta: 70-80 g.
- Pasta fresca: ~90 g.
- Cereali in chicco: 70-80 g.
- Gnocchi: 150-200 g, 0-2/settimana.
- Pasta ripiena: ~125 g, 0-2/settimana.
- Pane: ~100 g.
- Gallette: 6-8 pezzi, 0-2/settimana.
- Crackers: 1 pacchetto, 0-2/settimana.
- Friselle: 2 piccole / 1 grande, 0-2/settimana.
- Taralli/Grissini/Crostini: 60-70 g, 0-2/settimana.
- Piadina: 1 pezzo, 0-2/settimana.
- **Correzione V1.1 dopo verifica visiva della pagina 14:** la nota viola «da consumare con minore frequenza [0-2 volte a settimana]» è in una cella unica che copre il blocco Gallette → Piadina. Quindi Gallette, Crackers, Friselle, Taralli/Grissini/Crostini e Piadina appartengono tutti al blocco 0-2. Non si deduce dal PDF un tetto cumulativo unico fra queste voci.
- Patate: 300-350 g.
- Polenta: 70-80 g.
- Pasta sfoglia/brisée: 60-70 g, 0-2/settimana.
- Il PDF non definisce un tetto globale cumulativo "tutti i carboidrati limitati max 3". Se tale tetto viene mantenuto, deve essere etichettato APP-CWE e non PDF.

### 2.5 Verdura e frutta
- Verdura a pranzo e cena.
- Ortaggi: 200-250 g circa.
- Insalata: 70-80 g circa.
- Patate, mais e legumi non sono verdura.
- Taccole/fagiolini, funghi e zucca sono verdura.
- Piselli freschi possono essere considerati verdura occasionalmente.
- Frutta: 2-3 porzioni/giorno, 150-200 g per porzione.
- La copertura della verdura è **quantitativa**, non soltanto booleana: ogni quantità di verdura già presente nel pasto (anche dentro un primo o un sugo) contribuisce alla porzione richiesta.
- Se la verdura presente copre solo una parte della porzione, il motore deve aggiungere **solo il residuo necessario** per completarla, non una seconda porzione intera. Per ortaggi il riferimento PDF è 200-250 g; per insalata 70-80 g. Se si combinano più alimenti dello stesso gruppo, le quantità contribuiscono per frazione di porzione.

### 2.6 Colazione
Composizione ordinaria:
- carboidrato complesso: richiesto;
- proteina: richiesta;
- grassi: facoltativi;
- carboidrati semplici: facoltativi;
- frutta/piccole aggiunte: facoltative.

Limiti contestuali:
- crema yogurt Müller: 0-2/settimana;
- yogurt aromatizzato: 0-2/settimana;
- uova a colazione: 0-2/settimana;
- burro: 0-2/settimana;
- crema cacao/nocciole: 0-2/settimana;
- colazione diversa/speciale: 1-2/settimana.

Quantità colazione rilevanti:
- latte: ~200 ml;
- yogurt bianco: 125 g;
- ricotta: 50-60 g;
- uova: 1-2 pezzi;
- affettato: ~40 g;
- salmone affumicato: ~40 g;
- formaggio: ~30 g.

Queste quantità dimostrano che lo stesso ingrediente può avere una dose diversa per contesto.

### 2.7 Spuntini
- Frutta: fino a 2-3 volte/giorno.
- Granita: fino a 2-3/settimana.
- Grana/Parmigiano: fino a 2-3/settimana.
- Crackers: fino a 2-3/settimana.
- Pane+marmellata: fino a 2-3/settimana.
- Frutta secca: fino a 1/giorno.
- Patatine o Grisbi: fino a 1-2/settimana.
Default prudente applicativo già coerente col criterio minimo-del-range:
- 2 per i range 2-3;
- 1 per il range 1-2;
- 1/giorno per frutta secca.

### 2.8 Grassi e condimenti
- Olio EVO: 2-3 cucchiaini come porzione per cucinare/condire.
- Conversione applicativa prudente: ~5 g/cucchiaino -> 10-15 g.
- Default 10 g è compatibile con il limite inferiore.
- Qualunque commento legacy che dica "2-3 cucchiai al giorno" è errato.
- Salsa di soia: circa 1 cucchiaino per porzione; massimo 1 cucchiaio solo se il resto della giornata è povero di sodio.

### 2.9 Indicazioni soft/personali del PDF
Da trattare come "limitare"/penalità o preferenza, non come esclusione hard automatica:
- cipolla;
- porri;
- aglio;
- crucifere;
- bevande gassate/zuccherate/dolcificate;
- caramelle/gomme;
- dolcificanti artificiali;
- alimenti molto elaborati/ricchi di grassi.

Legumi: introduzione graduale, inizialmente 2 volte/settimana distanziate, eventualmente mezza porzione. È una fase/prescrizione temporanea, non un massimo permanente generale.

## 3. Parametri APP non attribuibili al PDF

Questi possono restare se approvati, ma devono essere distinti:
- allergeni UE;
- profili onnivoro/vegetariano/vegano;
- max fonti proteiche/giorno = 2;
- specialMealsMax;
- cooldown carboidrati/verdure;
- deadline pranzo/cena;
- target interni;
- tetto globale carboidrati limitati;
- totale obbligatorio 14 slot carboidrato;
- preferenze tempo, verdure preferite, cereali non graditi, ricorrenti, ecc.

## 4. Interventi numerati da eseguire

1. **Creare una sorgente unica di configurazione risolta** usata da UI, Set, `motor.js` ed `engine-core.js`; niente più costanti concorrenti.
2. **Separare i metadati del PDF dai default applicativi**: `pdfMin/pdfMax` o equivalente non devono essere confusi con il valore iniziale configurato.
3. **Eliminare la duplicazione delle frequenze proteiche** tra `CONFIG_AVANZATA_DEFAULT`, `FREQUENZE_CONSIGLIATE`, `CONFIG_PROTEINE_DEFAULT`, default engine e override motore.
4. **Correggere legumi**: minimo 2, massimo clinico non definito; non imporre `max:3` come regola PDF.
5. **Rendere il Set proteine derivato dalla configurazione nutrizionista**, non da `FREQUENZE_CONSIGLIATE` hardcoded.
6. **Comporre profilo alimentare e config nutrizionista senza sovrascrivere numeri arbitrariamente**: gli override hardcoded vegetariano/vegano del motore vanno sostituiti da una composizione esplicita di vincoli.
7. **Centralizzare i sottotipi proteici** e verificare che carne rossa, affettati/salumi/insaccati, pesce grande e pesce conservato usino un solo contatore coerente per famiglia.
8. **Classificare Speck come affettato/salume** in ogni percorso di conteggio e selezione.
9. **Verificare la classificazione di tutti gli affettati/insaccati** perché il limite 0-1 non venga aggirato da nomi/varianti differenti.
10. **Verificare la classificazione del pesce conservato**, includendo tonno/sgombro conservati e salmone affumicato.
11. **Spostare la quantità primaria dal macro-gruppo al singolo alimento/variante**: una quantità unica per `pesce`, `formaggi`, `legumi`, ecc. non è sufficiente.
12. **Aggiungere quantità per contesto** almeno per `colazione`, `pastoPrincipale`, `spuntino` quando lo stesso alimento cambia dose.
13. **Eliminare la mutazione globale delle ricette da `applicaQuantitaNutrizionistaAlleRicette()`** o limitarla a una migrazione controllata: salvare un Setting non deve riscrivere indiscriminatamente il catalogo ricette.
14. **Calcolare la quantità effettiva a runtime** in base a ingrediente, contesto e configurazione; la ricetta deve restare stabile salvo modifica esplicita del catalogo.
15. **Uniformare unità pezzi/grammi/ml** e conversioni; il motore converte solo quando necessario per nutrizione/inventario.
16. **Correggere la classificazione dei carboidrati limitati secondo pagina 14 (verifica visiva V1.1)**: sono 0-2/settimana gnocchi, pasta ripiena, gallette, crackers, friselle, taralli/grissini/crostini, piadina e sfoglia/brisée.
17. **Non attribuire al PDF il tetto cumulativo `CONFIG_CARB_TETTO_LIMITATI=3`**. Prima di rimuoverlo va trattato come regola APP-CWE preesistente e verificato con Cwe.
18. **Propagare i vincoli carboidrati nutrizionista al Set e al generatore**, non limitarli alla validazione del salvataggio UI.
19. **Garantire una fonte di carboidrati a pranzo e cena** nel percorso automatico, salvo pasto speciale/override esplicito.
20. **Aggiungere/verificare il requisito integrale**: almeno uno tra colazione, pranzo e cena dovrebbe essere integrale; serve un metadato dati, non analisi del nome.
21. **Garantire verdura a pranzo e cena** secondo l'algebra di copertura già esistente, senza duplicarla se la ricetta la copre.
22. **Distinguere porzione ortaggi 200-250 g e insalata 70-80 g** tramite dati strutturati.
23. **Audit classificazione verdure**: patate/mais/legumi non verdura; fagiolini/taccole, funghi, zucca sì; piselli freschi occasionali.
24. **Correggere l'incoerenza chiavi verdure** `setVerdureDisattivate` vs `verdureDisattivate` e scegliere una sola sorgente con migrazione/fallback.
25. **Mantenere frutta 2-3/die e 150-200 g** e verificare che il generatore/contatori la usino realmente, non solo la UI.
26. **Applicare la struttura colazione corretta**: carboidrato complesso + proteina; grassi e carboidrati semplici facoltativi.
27. **Implementare i limiti specifici della colazione** (Müller, yogurt aromatizzato, uova, burro, crema cacao/nocciole) come limiti contestuali, non globali.
28. **Mantenere `specialBreakfastMax=1` solo come default prudente**, distinguendolo dal massimo PDF pari a 2; la nutrizionista deve poterlo portare a 2.
29. **Mantenere i default spuntini 2/1 come default prudente**, ma memorizzare anche il limite superiore PDF 3/2 per non confondere default con hard max.
30. **Gestire Patatine/Grisbi come famiglia coerente di spuntino** e verificare se il contatore attuale è condiviso in tutti i percorsi.
31. **Correggere il significato dell'olio**: 2-3 cucchiaini, default 10 g, range fino a circa 15 g; eliminare/commentare riferimenti errati a cucchiai/giorno.
32. **Gestire salsa di soia come condimento ad alto sodio** con porzione specifica; non usarla come condimento generico senza limite.
33. **Introdurre uno stato soft "da limitare" distinto da `limitato` numerico ed `escluso`** per indicazioni senza frequenza numerica del PDF.
34. **Modellare l'introduzione graduale dei legumi come fase opzionale/temporanea**, non come regola permanente del motore.
35. **Separare esplicitamente parametri PDF e parametri APP** nella vista nutrizionista, almeno a livello dati/documentazione, per evitare che una scelta tecnica venga scambiata per prescrizione.
36. **Non dichiarare `maxProteinSourcesPerDay=2` come proveniente dal PDF**; conservarlo solo come APP-CWE se ancora desiderato.
37. **Non dichiarare cooldown, deadline e `specialMealsMax` come provenienti dal PDF**; preservarli come regole applicative indipendenti.
38. **Ripristinare/implementare il livello di cap utente per ingrediente richiesto nella conversazione corrente**, senza permettere all'utente di allargare il limite clinico. Il vecchio V80 che rimuoveva la UI dei tetti personali è superato da questa nuova richiesta per questo specifico punto.
39. **Definire la combinazione Nutrizionista/User**: esclusione clinica vince; minimo clinico resta requisito; massimo effettivo = minimo tra massimo clinico e massimo utente quando entrambi esistono; preferenze utente non possono violare minimi/esclusioni.
40. **Applicare la configurazione risolta sia al Genera menù sia alle modifiche manuali/ricerca ricette**, con hard block solo per sicurezza/clinica e avviso per preferenze/soft quando previsto.
41. **Contare i limiti settimanali sull'intera settimana pianificata**, includendo slot già bloccati/manuali durante una rigenerazione; non rigenerare ignorando ciò che è già presente.
42. **Conservare lo storico consumato separato dal piano futuro**: un consumo reale non deve essere riscritto dalla rigenerazione né cambiare se cambiano ricette/quantità dopo.
43. **Definire una migrazione compatibile delle chiavi IndexedDB**: vecchi dati restano leggibili; nuove chiavi diventano canoniche senza reset distruttivi.
44. **Aggiungere test automatici specifici di risoluzione vincoli** prima di toccare l'algoritmo di scelta ricette.
45. **Aggiungere test di non-regressione del Set**: una modifica nutrizionista deve riflettersi nei controlli utente senza cambiare impostazioni non correlate.
46. **Aggiungere test di non-regressione del motore**: la stessa config risolta deve essere usata da engine-core e motor, senza due interpretazioni.
47. **Aggiungere test dei contatori per variante/famiglia**: Speck/affettati, carne rossa, pesce grande, pesce conservato, colazioni limitate, spuntini limitati, carboidrati 0-2.
48. **Aggiungere test quantità per contesto**: ricotta/uova/affettato/salmone/formaggio devono poter avere dose colazione diversa dal pasto principale.
49. **Aggiungere test unità**: Uova/Friselle e qualunque futura voce a pezzi non devono diventare grammi nella UI.
50. **Eseguire ogni modifica per lotti isolati**, con diff e test dopo ogni lotto; non fare un refactor unico che tocchi contemporaneamente UI, dati, motore, ricette e storico.
51. **Interpretare ogni valore `0` impostato dall'utente nel budget carboidrati come esclusione hard dalla generazione automatica**: se Piadina=0, nessun fallback, esaurimento pool o regola speciale può proporre piadina. La stessa semantica vale per ogni carboidrato configurabile.
52. **Non usare fallback che riattivano carboidrati a budget zero**: se la configurazione residua non consente una scelta, il motore deve risolvere l'incompatibilità o segnalare l'impossibilità; non può pescare da voci impostate a 0.
53. **Rendere quantitativa la copertura verdura del pasto**: sommare la quota di porzione già presente in primo, sugo, proteina/ricetta completa e altri componenti validi.
54. **Aggiungere soltanto la verdura residua necessaria**: `residuo = max(0, porzioneRichiesta - quotaEquivalenteGiàPresente)`. Esempio: un sugo con metà porzione di zucchine deve far aggiungere metà porzione di verdura, non una porzione intera. Se la porzione è già completa, nessun contorno aggiuntivo.
55. **Distinguere nel Set carboidrati tre stati logici**, perché "non impostato" e "0 esplicito" non possono avere lo stesso significato: `AUTO` = il sistema può usare la voce; `0/ESCLUSO` = non deve mai proporla nell'automatico; `N>0/FISSO` = numero esatto di occorrenze settimanali richieste dall'utente.
56. **Schema base automatico quando l'utente non imposta nulla**: costruire comunque i 14 slot carboidrato usando esclusivamente carboidrati senza tetto settimanale PDF e non esclusi dall'utente. I carboidrati con tetto settimanale non entrano mai nel riempimento automatico di base.
57. **Se l'utente imposta quantità positive, quelle quantità sono esatte e prioritarie**. Esempio: Friselle=2 significa esattamente 2 friselle nella settimana; i restanti 12 slot vengono completati automaticamente con carboidrati senza tetto settimanale, rispettando eventuali esclusioni utente.
58. **La natura e la disposizione dei posti auto-compilati sono casuali**: dopo aver fissato le occorrenze esplicite dell'utente, il sistema sceglie casualmente le tipologie ammesse per completare a 14 e distribuisce casualmente l'intero budget nei 14 slot pranzo/cena. Non deve aggiungere autonomamente una voce a tetto.
59. **Nessun riempimento può violare uno 0 esplicito**. Se le esclusioni dell'utente lasciano un pool insufficiente a completare 14 slot, il sistema segnala configurazione impossibile invece di riattivare alimenti esclusi.
60. **Il riempimento automatico non trasforma un tetto PDF in un obiettivo**: i carboidrati 0-2 sono disponibili soltanto se scelti dall'utente; il motore non deve "consumare il margine" solo perché esiste.

## 5. Ordine obbligatorio di lavoro anti-regressione

### Lotto A — Nessun comportamento
- Congelare questa baseline.
- Aggiungere test/fixture di configurazione.
- Inventariare le chiavi legacy e i valori correnti.
- Nessuna modifica a ricette o ingredienti.

### Lotto B — Resolver centrale
- Implementare un solo `resolveNutritionConfig()` (nome indicativo).
- Deve combinare default, PDF metadata, nutrizionista, profilo e utente.
- Nessuna UI nuova finché il resolver non è testato.

### Lotto C — Motore
- Fare leggere `motor.js` ed `engine-core.js` dallo stesso resolver.
- Eliminare duplicazioni/hardcode solo dopo test equivalenti.
- Non toccare UI o cataloghi in questo lotto.

### Lotto D — Setting nutrizionista
- Collegare i controlli alla sorgente canonica.
- Aggiungere quantità contestuali/limiti mancanti.
- Non riscrivere ricette al salvataggio.

### Lotto E — Set utente
- Derivare range e disabilitazioni dalla configurazione nutrizionista.
- Reintrodurre i cap utente richiesti come restringimento, non come alternativa.
- Nessun bypass dei vincoli clinici.

### Lotto F — Catalogo dati
- Solo dopo resolver e UI: correggere classificazioni/metadata verificati.
- Ogni variazione di `ingredienti.json` o `ricette.json` deve essere separata e verificata.
- Nessuna quantità di ricetta viene cambiata automaticamente solo perché cambia il Setting.

### Lotto G — Generazione e manuale
- Genera menù, rigenera, ricerca manuale e cambio ricetta usano gli stessi vincoli.
- Preservare blocchi, stato consumato, inventario, lista spesa e storico.

### Lotto H — Stress test finale
- settimane vuote/parziali/piene;
- limiti a 0, min=max, max null;
- ingredienti esclusi;
- user più restrittivo del nutrizionista;
- profilo vegetariano/vegano;
- ricette complete e modulari;
- colazione/spuntino;
- unità pz/g/ml;
- reset e migrazione dati.

## 6. Aree protette: non toccare durante questo audit salvo richiesta esplicita

- algebra di copertura delle ricette complete;
- logica today+1 e consumo reale;
- storico nutrizionale immutabile;
- inventario/lista spesa;
- blocchi/lucchetti dei pasti;
- roll/cambio ricetta e relative varianti;
- rotazione condimenti già richiesta;
- UI non direttamente necessaria al lotto in corso;
- dati ricette/ingredienti non coinvolti nel punto specifico.

## 7. Regola operativa per le future modifiche

Prima di ogni lotto:
1. rileggere `AGENTS.md`;
2. rileggere le sezioni pertinenti di `docs/REGOLE_FLUSSO_LOGICO.md`;
3. rileggere **questo file**;
4. indicare quali punti numerati del presente file si stanno implementando;
5. modificare solo i file indispensabili a quei punti;
6. eseguire test e diff;
7. non correggere "già che ci siamo" altri punti senza autorizzazione.

Se una regola del vecchio `REGOLE_FLUSSO_LOGICO.md` attribuisce al PDF un dato in contrasto con questa baseline verificata direttamente sul PDF, per la parte nutrizionale prevale questa baseline, salvo successiva istruzione esplicita di Cwe.
