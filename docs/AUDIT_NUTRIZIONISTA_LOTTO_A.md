# DietaPlanner — Audit nutrizionista Lotto A

**Data:** 2026-08-29  
**Baseline:** `docs/BASELINE_NUTRIZIONISTA_PDF_V1.md`  
**Scopo del Lotto A:** fotografia verificata dello stato corrente, fixture/test anti-regressione e inventario delle collisioni.  
**Vincolo:** questo lotto non modifica il comportamento dell'app, né `index.html`, `motor.js`, `engine-core.js`, `ingredienti.json` o `ricette.json`.

## 1. File applicativi congelati

Stato applicativo letto su `main` prima del Lotto A:

| File | SHA |
|---|---|
| `index.html` | `9adbc36dcf6877507ccf60dda430e00252d86f83` |
| `motor.js` | `7d114c3c46559c597523f54258f1eb0bc908cf03` |
| `engine-core.js` | `5c692b4acc44f514472985473d466646eafaacb8` |
| `ingredienti.json` | `350dfde1b5efbbd4e00515c5a56ae943ec8faa07` |
| `ricette.json` | `33b25fd5b34674b894e4403fdbb6975de383f45d` |

Aggiunti nel Lotto A:
- `tests/fixtures/nutrition-baseline-v1.json`
- `tests/nutrition-lotto-a-snapshot.test.js`

Il test è volutamente uno **snapshot dei punti verificati**, compresi i mismatch noti. Quando un Lotto successivo corregge un punto, audit e snapshot devono essere aggiornati nello stesso commit.

## 2. Legenda stato

- **OK**: comportamento/dato già coerente con la baseline.
- **PARZIALE**: presente ma non propagato in tutti i percorsi.
- **CONFLITTO**: due percorsi applicano regole differenti.
- **DORMIENTE**: supporto nel motore presente, ma non configurabile dalla UI attuale.
- **ORFANO**: chiave/helper legacy senza percorso moderno completo.
- **SALVATO-NON-USATO**: parametro persiste ma il runtime principale non lo legge.
- **RISCHIO BYPASS**: il vincolo esiste ma una ricetta/percorso può aggirarlo.
- **SIDE EFFECT**: il salvataggio di un'impostazione modifica dati che dovrebbero restare indipendenti.

## 3. Matrice configurazione nutrizionista → Set → motore

| Area | Stato corrente | Esito | Interventi baseline |
|---|---|---|---|
| Frequenze macro in `CONFIG_AVANZATA_DEFAULT` | carne 1-3, pesce 2-3, formaggi 2-3, uova 1-2, legumi min 2/max null | **OK** come default nutrizionista | 1-5 |
| Frequenze macro in `engine-core.js` | stessi valori del default nutrizionista, legumi max null | **OK** | 1-5 |
| `FREQUENZE_CONSIGLIATE` del Set | legumi è ancora `max:3` | **CONFLITTO** | 3-5 |
| `getFrequenzeConsigliateEffettive()` | restituisce sempre `FREQUENZE_CONSIGLIATE` | **CONFLITTO**: ignora `configAvanzata` | 1,3,5 |
| `getExtraCapSottotipiEffettivi()` | restituisce sempre costante `EXTRA_CAP_SOTTOTIPI` | **PARZIALE** | 1,7 |
| `CONFIG_PROTEINE_DEFAULT` | presente; `getConfigProteine()` lo restituisce, ma helper non risulta richiamato altrove | **ORFANO/legacy** | 3 |
| Tabella proteine Set | massimo per categoria preso direttamente da `FREQUENZE_CONSIGLIATE`; max 2 categorie/giorno hardcoded | **CONFLITTO** | 5,36,39 |
| Fattibilità minimi Set | legge direttamente `FREQUENZE_CONSIGLIATE` | **CONFLITTO** | 5 |
| Griglia proteica motore | `costruisciGrigliaConfigurata()` legge `configAvanzata` e passa a `E.buildProteinGrid` | **OK/PARZIALE** | 1,3 |
| Profili vegetariano/vegano | `adattaConfigProfilo()` sovrascrive i range con 3-6/2-4/5+ o 14 legumi | **CONFLITTO** con config nutrizionista | 6 |
| Sottotipi in `scegliSottotipoMotore()` | merge tra default engine e `configAvanzata.subtypeCaps` | **OK/PARZIALE** | 7 |
| Sottotipi in `risolviSottotipoFine()` | usa solo `CAP_SOTTOTIPI_MOTORE` default | **CONFLITTO**: altro percorso ignora il Setting | 7 |
| Storico sottotipi | conta `r.gruppoProteico` della ricetta | **RISCHIO BYPASS** per ricette miste | 7-10,47 |
| `maxProteinSourcesPerDay` | visibile e salvato | **SALVATO-NON-USATO**; il Set usa comunque 2 hardcoded | 35-37 |
| `specialBreakfastMax` | salvato e copiato a `CAP_COLAZIONE_SPECIALE` | **OK** | 28 |
| `specialMealsMax` | letto nei percorsi manuali "Speciale" | **PARZIALE**: non trovato nel motore automatico | 35,37 |
| `snackWeeklyCaps` | copiato a runtime e usato nei filtri spuntino/ricerca | **OK/PARZIALE** | 29-30 |
| `snackDailyCaps` | copiato a runtime e usato | **OK** | 29 |
| `fruit.min/max/portionMin/portionMax` | visibili e salvati | **SALVATO-NON-USATO** nel percorso indicatore: usa `FRUTTA_GIORNALIERA` hardcoded e 175 g | 25 |
| `oilGramsPerMeal` | visibile e salvato | **SALVATO-NON-USATO** | 31 |
| `cooldownDays` | visibile e salvato | **SALVATO-NON-USATO**; runtime usa altre costanti/penalità | 35,37 |
| `deadlines` | visibile e salvato (15:00/22:00) | **SALVATO-NON-USATO**; consumo usa `FASCE_ORARIE_PASTO` con pranzo fine 14 e cena fine 20 | 35,37 |
| Classi carboidrati | `vincoliClassiCarboidrati.complessi` controllato solo al salvataggio contro il totale caselle; `semplici` non risulta usato nel generatore | **PARZIALE/SEMANTICA ERRATA** | 18 |
| Allergeni | salvati; ricette filtrate tramite sicurezza/engine | **OK**, da preservare | 40 |
| Ingredienti esclusi nutrizionista | salvati anche in `ingredientiBloccati` | **OK/PARZIALE** | 40 |

## 4. Tetti per ingrediente: punto critico

### 4.1 Configurazione nutrizionista
`motor.js::creaStatoMotoreSettimana()` legge:
- `vincoliIngredientiNutrizionista`;
- `tettiIngredienteSettimanali`.

Per ogni variante:
- massimo clinico = `vincolo.max` se stato `limitato`;
- massimo utente = `tettiIngredienteSettimanali[ingredienteId]`;
- quando entrambi esistono usa già `Math.min(user, clinical)`.

Questa parte implementa correttamente la **precedenza concettuale** richiesta.

### 4.2 Tetti utente
Il motore legge `tettiIngredienteSettimanali`, ma in `index.html`:
- la chiave compare solo in funzioni legacy di ricerca;
- non esiste un writer moderno `put(... chiave:'tettiIngredienteSettimanali' ...)`.

Stato: **DORMIENTE**. Il supporto motore esiste, la configurazione utente attuale no.  
Riferimento baseline: interventi 38-39.

### 4.3 I massimi ingrediente non sono realmente hard
`engine-core.js::applyIngredientCaps()` filtra le ricette entro cap, ma se **tutte** le ricette del pool superano il tetto restituisce nuovamente il pool originale:

`pool: allowed.length ? allowed : all`

e segnala soltanto `exceeded`.

Conseguenza: anche un massimo clinico può essere superato come fallback.  
Stato: **RISCHIO BYPASS CRITICO**.  
Da correggere nel Lotto del resolver/motore, non nel Lotto A.

## 5. Quantità: side effect già verificato

`salvaConfigAvanzata()` chiama:

`applicaQuantitaNutrizionistaAlleRicette()`

La funzione percorre tutte le ricette e sostituisce `ing.quantita` usando:
1. quantità del vincolo specifico ingrediente;
2. in fallback, `proteinFrequencies[macro].quantita`.

Quindi il semplice salvataggio del Setting può modificare il catalogo ricette nel database locale.

Stato: **SIDE EFFECT CRITICO**.  
Riferimenti baseline: 11-15.

Non è stato modificato in Lotto A.

## 6. Carboidrati

Stato corrente di `CONFIG_CARB_TIPI` / `CARBOIDRATI_PASTO`:

| Tipo | Codice corrente | Baseline PDF V1 | Stato |
|---|---:|---:|---|
| Gnocchi | limitato 0-2 | limitato 0-2 | **OK** |
| Pasta ripiena | limitato 0-2 | limitato 0-2 | **OK** |
| Friselle | limitato 0-2 | limitato 0-2 | **OK** |
| Taralli/Grissini/Crostini | limitato 0-2 | limitato 0-2 | **OK** |
| Pasta sfoglia/brisée | limitato 0-2 | limitato 0-2 | **OK** |
| Gallette | **non limitato** | **limitato 0-2** | **CONFLITTO** |
| Crackers pasto | **non limitato** | **limitato 0-2** | **CONFLITTO** |
| Piadina | limitato 0-2 | limitato 0-2 | **OK** |

**Correzione audit V1.1:** la pagina 14 è stata ricontrollata visivamente. La nota 0-2 è una cella unica che copre il blocco Gallette, Crackers, Friselle, Taralli/Grissini/Crostini e Piadina. La precedente lettura che lasciava fuori Gallette/Crackers/Piadina era errata.

Il tetto globale `CONFIG_CARB_TETTO_LIMITATI = 3` / `limitedCarbTotalMax = 3` resta una regola **APP-CWE**, non PDF. Non viene toccato finché non viene deciso esplicitamente di rimuoverlo.

### 6.1 Zero, AUTO e valore fisso nel Set utente

Requisito vincolante: **0 significa non proporre quel carboidrato nella generazione automatica**. Se l'utente imposta Piadina=0, la Piadina non può rientrare tramite fallback.

Per rendere compatibile questa regola con il nuovo default "se non seleziono nulla, genera comunque 14 carboidrati", il dato dovrà distinguere:
- **AUTO/non impostato**: il sistema può usare il carboidrato se non ha tetto settimanale;
- **0/ESCLUSO**: esclusione hard dall'automatico;
- **N>0/FISSO**: numero esatto di occorrenze richieste.

Audit del motore attuale: `engine-core.js::chooseCarb()` quando `carbRemaining` non offre più voci ricostruisce un pool da `Object.keys(defs)` e può quindi riaprire voci senza residuo; inoltre esistono regole speciali che possono forzare un carboidrato. Stato: **RISCHIO BYPASS**. Va reso impossibile nel Lotto motore.

### 6.2 Schema base e completamento automatico

Regola confermata:
- nessuna selezione utente → **14 slot auto**;
- pool auto di base → **solo carboidrati senza tetto settimanale PDF**;
- carboidrati 0-2 → **mai inseriti automaticamente**;
- quantità positive utente → **esatte**;
- resto fino a 14 → compilato casualmente con sole voci AUTO non limitate e non escluse;
- disposizione settimanale → casuale.

Esempio normativo: **Friselle=2** → esattamente 2 slot Friselle; gli altri 12 vengono scelti casualmente tra carboidrati senza tetto e poi distribuiti casualmente nei 14 pasti.

### 6.3 Stato del codice corrente

`completaCaselleCarboidrati()` è già parzialmente coerente perché:
- individua i limitati attivati dall'utente;
- non aggiunge automaticamente un limitato mai attivato;
- completa fino a 14.

Ma oggi:
- usa il **minimo conteggio** per bilanciare i carboidrati, quindi non realizza la "natura casuale" richiesta;
- lo stato iniziale è numericamente `0` per tutto e non distingue ancora **AUTO** da **0 esplicito**;
- `chooseCarb()` ha un fallback capace di riaprire voci fuori budget.

Stato complessivo: **PARZIALE**, da correggere senza perdere il comportamento già valido di completamento a 14.

## 7. Verdure

UI Set:
- legge/scrive `setVerdureDisattivate`.

`motor.js::caricaPreferenzeMotoreDaSet()` e `filtraContorniPerVerdureAttive()`:
- leggono `verdureDisattivate`.

Stato: **CONFLITTO CHIAVE**; la preferenza può non arrivare al motore nuovo.

### 7.1 Copertura quantitativa e residuo verdura

Il PDF richiede una porzione completa di verdura al pasto (200-250 g ortaggi oppure 70-80 g insalata) e consente di combinare alimenti dello stesso gruppo. La regola operativa confermata da Cwe è quindi quantitativa: la verdura presente in un primo/sugo contribuisce alla porzione e va aggiunto **solo il residuo**.

Audit del motore attuale: `componiPastoModulare()` decide il contorno tramite `E.parseCoverage(protein)` e, se manca `V`, chiama `scegliContornoMotore()` per una porzione completa. Non calcola la quantità di verdura già contenuta nel primo o nel sugo. Stato: **CONFLITTO/RISCHIO SOVRADOSAGGIO**.

La correzione dovrà usare una quota di porzione, non un semplice booleano `V`: 100 g di zucchine su target 200 g = 0,5 porzione; residuo = 0,5 porzione. Lo stesso principio vale a prescindere dal componente in cui la verdura è contenuta.

Classificazioni dati verificate:
- `Patate` → carboidrati: **OK**.
- `Fagiolini` → verdura: **OK**.
- `Funghi champignon` → verdura: **OK**.
- `Zucca` → verdura: **OK**.
- Piselli in barattolo/surgelati → proteine, sottotipo legumi: coerente con uso prevalente del piano; l'eccezione "piselli freschi occasionalmente verdura" non è modellata.

## 8. Affettati e pesce conservato: dati base corretti, ricette miste a rischio

### Dati base già corretti
- `Speck.sottotipo = affettati`.
- `Salmone affumicato.sottotipo = pesce_conservato`.
- Bresaola, prosciutto cotto/crudo, salsiccia risultano `affettati`.
- Tonno/sgombro in scatola risultano `pesce_conservato`.

Queste classificazioni vanno preservate.

### Bypass tramite `ricetta.gruppoProteico`
Lo storico sottotipi e vari percorsi di selezione contano la categoria della **ricetta**, non tutte le famiglie limitate presenti nei suoi ingredienti.

Esempi reali verificati:
- `Pasta con speck e taleggio`: contiene Speck, ma `gruppoProteico = formaggio_stagionato`.
- `Insalata con emmental e prosciutto cotto`: contiene prosciutto, ma gruppo formaggio.
- `Toast con emmental e prosciutto cotto`: contiene prosciutto, ma gruppo formaggio.
- `Tramezzini con formaggio spalmabile e salmone affumicato`: contiene salmone affumicato, ma `gruppoProteico = formaggio_fresco`.

Conseguenza: il tetto affettati/pesce conservato può essere rispettato per la proteina dominante e contemporaneamente superato tramite ingrediente secondario.

Stato: **RISCHIO BYPASS CRITICO**.  
Da risolvere strutturalmente senza inferire dal nome ricetta.

## 9. Chiavi IndexedDB/configurazione da preservare durante la migrazione

### Canoniche/attive
- `configAvanzata`
- `allergeniAttivi`
- `vincoliIngredientiNutrizionista`
- `vincoliClassiCarboidrati`
- `ingredientiBloccati`
- `configCarboidrati`
- `configCarboidratiOrigini`
- `tabellaGiornoCategoria`
- `setProteineLimitate`
- `setPocoTempo`
- `cerealiNonGraditi`
- `setVerdurePreferite`
- `setVerdureDisattivate`
- `verduraRicorrente`
- `verduraRicorrentePasti`
- `colazionePreferita`
- `colazionePreferitaGiorni`
- `colazioneIngredientiEsclusi`

### Legacy/dormienti da migrare con fallback
- `tettiIngredienteSettimanali`: letto dal motore, nessun writer moderno.
- `verdureDisattivate`: letto dal motore nuovo ma non dalla UI attuale.
- `configTettiAlimenti`: helper getter legacy senza percorso moderno completo individuato.

Nessuna di queste chiavi deve essere cancellata senza migrazione.

## 10. Copertura test prima del Lotto A

Test esistenti:
- `engine-core.test.js`: regole pure, budget carboidrati, composizione, profili, settimane casuali.
- `data.test.js`: coerenza cataloghi, allergeni, blocchi, coperture.
- `ui-contract.test.js`: marker/contratti UI.
- `conformance.test.js`: conformance generale.
- `browser-smoke.js`: caricamento browser.

Mancavano test specifici per:
- propagazione nutrizionista → Set;
- collisione legumi max null vs max 3;
- cap utente/clinico risolto;
- mismatch chiavi verdure;
- side effect quantità;
- ricette miste con Speck/salmone affumicato;
- classificazione blocco carboidrati 0-2 (in particolare Gallette/Crackers/Piadina);
- semantica hard di `0` nel budget carboidrati;
- calcolo quantitativo del residuo verdura nei sughi/primi;
- distinzione default PDF/range PDF.

Il Lotto A aggiunge una fixture normativa e uno snapshot tecnico. I test di comportamento desiderato verranno aggiunti **prima** delle singole correzioni nei Lotti successivi.

## 11. Ordine successivo confermato

Il prossimo Lotto è **B — resolver centrale**.

Prima di modificarlo:
1. rileggere `AGENTS.md`;
2. rileggere le sezioni pertinenti di `REGOLE_FLUSSO_LOGICO.md`;
3. rileggere `BASELINE_NUTRIZIONISTA_PDF_V1.md`;
4. rileggere questo audit;
5. dichiarare quali interventi numerati vengono toccati;
6. non modificare UI, ricette o ingredienti nel Lotto B.

Il resolver dovrà prima essere testabile in isolamento; soltanto dopo il motore verrà collegato ad esso.


## 12. Aggiornamento stato dopo Lotto C

Il presente audit resta la fotografia del Lotto A, ma i seguenti punti sono stati corretti nel Lotto C e non vanno più letti come difetti correnti:

- **fallback massimi ingrediente**: corretto; `applyIngredientCaps()` non reintroduce più il pool originale se tutti superano il tetto;
- **fallback carboidrati fuori budget**: corretto; `chooseCarb()` restituisce `null` quando il residuo è esaurito;
- **override vegetariano/vegano delle frequenze**: rimossi dal motore; il profilo ora esclude macro senza inventare nuovi range;
- **chiave verdure disattivate**: il motore legge `setVerdureDisattivate` con fallback legacy a `verdureDisattivate`;
- **resolver comune**: `engine-core.js` e `motor.js` consumano `nutrition-config.js`;
- **conteggi sottotipi settimanali**: il cap viene calcolato sulla settimana target e aggiornato durante la generazione, non sul totale storico a vita;
- **ricette miste affettati/pesce conservato**: il contatore settimanale considera anche il sottotipo degli ingredienti, quindi Speck e salmone affumicato non possono più nascondersi dietro una `gruppoProteico` dominante diversa;
- **conteggi dei pasti preservati**: consumi e slot bloccati (o tutti gli slot mantenuti nelle generazioni non forzate) entrano nei conteggi prima della rigenerazione.

Restano aperti e NON vanno considerati risolti:
- Set proteine ancora basato su `FREQUENZE_CONSIGLIATE` hardcoded;
- UI cap utente ingrediente non ancora ripristinata;
- distinzione persistente AUTO / zero esplicito / fisso nei carboidrati non ancora esposta nel Set;
- Gallette/Crackers ancora classificati in modo legacy nella UI, anche se il resolver conosce il tetto PDF;
- quantità contestuali e rimozione di `applicaQuantitaNutrizionistaAlleRicette()`;
- residuo verdura non ancora propagato alle quantità effettive di realizzazioni/inventario/nutrizione/spesa/storico;
- fruit/oil/cooldown/deadlines e altri parametri salvati ma non ancora collegati a tutti i percorsi;
- manuale/ricerca non ancora completamente unificati al resolver.

Documento operativo corrente: `docs/LOTTO_C_MOTORE.md`.


## 13. Aggiornamento stato dopo Lotto D

Correzioni effettuate nel Lotto D:
- il Setting nutrizionista usa `nutrition-config.js` come sorgente canonica per default, valori effettivi e validazione finale;
- il salvataggio non richiama più `applicaQuantitaNutrizionistaAlleRicette()`;
- la funzione di mutazione globale e la chiamata automatica all'avvio sono state rimosse;
- reset e cap runtime già esistenti passano dalla configurazione canonica;
- quantità/limiti contestuali `colazione`, `pastoPrincipale`, `spuntino` sono rappresentabili e salvabili;
- sono esposti riferimenti PDF contestuali per Uova, Ricotta, Salmone affumicato, famiglia affettati, Burro e Crema di nocciole/cacao;
- le frequenze delle macro escluse da vegetariano/vegano vengono disabilitate nella vista senza inventare nuovi range;
- la vista distingue esplicitamente blocco PDF/piano nutrizionale e regole APP-CWE.

Restano aperti dopo Lotto D:
- Set proteine ancora hardcoded: Lotto E;
- stato persistente carboidrati AUTO / 0 / FISSO: Lotto E;
- cap utente per ingrediente: Lotto E;
- quantità contestuali non ancora applicate a realizzazioni/nutrizione/inventario/spesa/storico;
- Gallette/Crackers nella UI Set ancora da allineare;
- classi carboidrati complessi/semplici non ancora propagate al Set/generatore;
- frutta, olio, cooldown, deadline e altri parametri non ancora consumati in tutti i percorsi;
- yogurt Müller/aromatizzato non presenti nel catalogo;
- salsa di soia ancora senza unità contestuale strutturata;
- stato soft `da limitare`.

Documento operativo corrente: `docs/LOTTO_D_SETTING_NUTRIZIONISTA.md`.
