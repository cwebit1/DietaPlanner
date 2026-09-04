# DietaPlanner — stato consolidato lotti e test

**Data:** 2026-09-03 (aggiornato dopo la sessione pomeridiana — vedi fondo pagina)
**Pubblicazione:** release v2 autorizzata da Cwe il 30 agosto 2026

| Lotto | Stato | Evidenza |
|---|---|---|
| A — baseline | verificato | fixture PDF e snapshot root |
| B — resolver | verificato | precedenze, range, AUTO/EXCLUDED/FIXED |
| C — motore | verificato sulla v12 | integrazione, cap, profili, atomicità settimana, pipeline sequenziale P→C→V |
| D — Setting | verificato | resolver, contesti, nessuna mutazione catalogo |
| E — Set | verificato | stati carboidrati, cap personali restrittivi, bozza con salvataggio esplicito, Fonti proteiche/giorno |
| F — catalogo | verificato sui dati correnti | 39 template, 157 ingredienti, referenze coerenti |
| G — generazione/manuale/UI | implementato e verificato automaticamente + browser reale | quantità atomiche, residuo, deperibilità, pasto odierno, C/P/V raggruppato per ricetta |
| H — stress test/release | release v2 autorizzata | 27/27 automatici passati; verifica browser reale eseguita via Chromium/Playwright il 03/09 (vedi fondo pagina) — resta da fare solo il test su dispositivo Android fisico |
| I — accessi/RBAC/Firestore | login Google funzionante, RBAC/whitelist non implementato | `LOTTO_I_ACCESSI_RBAC_E_MIGRAZIONE_FIRESTORE.md`; esecuzione per fasi con rollback |

## Cataloghi correnti

- `ingredienti-new.json` v21: 157 ingredienti.
- `db-ricette.json` v73: 39 template. Il Blocco 2 V/S/G ha riclassificato
  i sughi parziali come `S` e le guarnizioni proteiche come `G`, conservando
  `V` soltanto nei template misti con porzione vegetale completa.
- Tutte le 218 referenze ingrediente, comprese le composizioni fisse, risolvono
  nel catalogo.
- Nessuna sorgente runtime usa i cataloghi della versione 1.0.
- Il confronto delle 20 voci del formato intermedio archiviato è registrato in
  `AUDIT_CONVERSIONE_RICETTARIO_SOSPESO.md`: tutte le destinazioni sono state
  decise e le conversioni approvate sono applicate; la correzione nominale
  "Pomodori gratinati" è validata nella v69.

## Suite automatica corrente

- `tests/nutrition-lotto-a-root-snapshot.test.js`;
- `tests/nutrition-config.test.js`;
- `tests/engine-core.test.js`;
- `tests/lotto-c-new-engine-integration.test.js`;
- `tests/lotto-d-root-nutritionist-setting.test.js`;
- `tests/lotto-e-root-user-set.test.js`;
- `tests/lotto-f-new-catalog.test.js`.
- `tests/lotto-g-atomic-realizations.test.js`;
- `tests/lotto-g-weekly-generation.test.js`.
- `tests/lotto-h-pwa-source-contract.test.js`;
- `tests/lotto-h-stress-migrations.test.js`.
- `tests/lotto-h-approved-recipe-conversion.test.js`.
- `tests/lotto-h-generation-feedback-catalog-retry.test.js`.
- `tests/lotto-i-google-auth-contract.test.js` (login corrente; RBAC ancora da implementare).
- `tests/lotto-j-vsg-contract.test.js`;
- `tests/lotto-j-vsg-catalog.test.js`;
- `tests/lotto-j-vsg-motor-semantics.test.js`.
- `tests/lotto-j-vsg-structured-coverage.test.js`.
- `tests/lotto-j-vsg-pipeline-order.test.js`.
- `tests/lotto-j-vsg-threshold.test.js`.
- `tests/lotto-j-vsg-atomic-snapshot.test.js`.
- `tests/lotto-j-vsg-roll-salvafrigo.test.js`.
- `tests/lotto-j-vsg-rendering.test.js`.
- `tests/lotto-j-vsg-stress.test.js`.
- `tests/lotto-j-una-fonte-proteica-giorno.test.js`.
- `tests/menu-consumo-automatico-store-reale.test.js`.
- `tests/menu-layer-sequenziale.test.js`.

27/27 suite superate all'ultima esecuzione (03/09/2026, sessione pomeridiana).
Una sola suite (`lotto-g-weekly-generation.test.js`, a volte `lotto-j-vsg-stress.test.js`)
mostra intermittenza non deterministica nota e già spiegata: con margini
settimanali stretti l'ordine casuale delle classi proteiche a volte non trova
l'unica combinazione valida al primo tentativo — non è una violazione di
regola, è un problema di fattibilità numerica ancora da decidere (algoritmo
costruttivo come per i carboidrati, o errore esplicito accettato).

Ultima esecuzione, chiusura Blocco 10 V/S/G: 24/24 test passati, più controllo
sintattico del motore, validazione JSON e `git diff --check`. Il test Lotto C
è stato riallineato alla firma corrente di `creaSequenzaCarboidrati` e alla
classe `C+S`; il test settimanale verifica l'ultima sequenza completa 1 -> 14
senza fallire quando esistono retry interni. Il Blocco 3 ha introdotto la
lettura semantica distinta dei token `V`, `S` e `G` nel motore; il calcolo
quantitativo strutturato è stato aggiunto nel Blocco 4 senza cambiare ancora
l'ordine di costruzione del pasto. Il test dedicato e le suite collegate sono
passati; nella corsa aggregata anche la suite settimanale è passata. Resta
registrata l'intermittenza preesistente del solo controllo di avanzamento,
osservata in una precedente esecuzione isolata.

Il Blocco 5 ha reso esplicito l'ordine P -> C -> V nella costruzione dello
slot e ha eliminato la precedenza implicita delle ricette P+C già combinate,
senza modificare i vincoli o la logica quantitativa del blocco precedente.

Il Blocco 6 applica la soglia: da 50 g compresi viene aggiunta una `V`
compensativa esatta; sotto 50 g il residuo viene diviso a metà fra `S` e `G`,
che in tale condizione sono necessariamente presenti insieme. Nessun caso
alternativo con un solo token è stato introdotto.

Il Blocco 7 congela quantità, nutrienti, ruolo e bilancio V/S/G nello snapshot
della realizzazione e nello storico. Nutrizione, spesa e inventario continuano
a consumare tale snapshot unico; i template del catalogo restano immutati.

Il Blocco 8 fa ricalcolare lo stesso bilancio dopo Roll C/P/V e mantiene
rigenerazione e Salvafrigo sulla pipeline comune. Salvafrigo conserva anche il
bilancio del pasto programmato originale.

Il Blocco 9 mantiene tre sole righe visuali: `S` è incorporato in C, `G` in P
e V compare soltanto per una portata vegetale completa. Pasto e Programmazione
condividono la stessa funzione di proiezione.

Il Blocco 10 ha stressato 25 settimane e 350 pasti senza residui o snapshot
incoerenti. La prova browser sulla build GitHub Pages corrente ha verificato
generazione, salvataggio, persistenza dopo ricarica, rendering C/P/V, Roll C e
Salvafrigo. Il server locale è rimasto irraggiungibile dal browser cloud con
`ERR_BLOCKED_BY_CLIENT`; il responsive Android resta pertanto un gate separato.

L'intervento del 3 settembre 2026 isola il consumo automatico dalla bozza
Menù: `renderMenuSettimanale` disattiva temporaneamente `menuDraft`, esegue
`elaboraConsumoAutomatico` sullo store `piano` reale e ripristina la bozza in
`finally`. Suite completa successiva alla modifica: 25/25 test superati.

## Limite della verifica corrente

Aggiornato il 03/09/2026: la limitazione descritta sotto (server locale
irraggiungibile dal browser cloud) valeva il 30 agosto. Da allora sono state
eseguite più sessioni di verifica browser reale end-to-end (Chromium via
Playwright, server locale servito correttamente) — generazione settimanale,
salvataggio Set con lettura IndexedDB diretta indipendente dall'app, Roll,
Salvafrigo, rendering C/P/V, righe raggruppate per ricetta, avviso "modifiche
non salvate", tutte verificate con successo. Il gate non ancora eseguito è
solo il test su dispositivo Android fisico (touch, tastiera, responsive reale).

Testo originale (30 agosto 2026, mantenuto per cronologia):

Non è stato ancora eseguito un test browser/IndexedDB end-to-end della root
corrente. Il 30 agosto 2026 il browser reale è stato avviato correttamente, ma
il suo ambiente cloud ha bloccato l'accesso al server locale della root su
`http://127.0.0.1:4173/` con `ERR_BLOCKED_BY_CLIENT`. La versione pubblicata non
è stata usata come sostituto perché non rappresenta con certezza il worktree
corrente. I test automatici e di contratto non sostituiscono questo gate.

## Esito Lotto G

- schema unico delle quantità effettive nelle realizzazioni: implementato;
- propagazione a nutrizione, inventario, spesa e storico: implementata;
- programmazione indipendente dalla scorta: verificata con inventario vuoto;
- priorità temporale delle verdure: implementata;
- pasto odierno con priorità scorte/scadenze: implementato;
- UI a righe C/P/V e Roll contestuali: contratto statico verificato;
- verifica browser reale: demandata al Lotto H.

## Gate Lotto H

La checklist eseguibile e il criterio di rilascio sono consolidati in
`LOTTO_H_CHECKLIST_RELEASE.md`.

### Intervento sequenziale sul generatore

La generazione settimanale chiude ora ogni slot prima di avanzare al
successivo. Le celle proteiche utente sono vincolanti, le sole celle mancanti
sono casuali e la rotazione avanza dopo il pasto accettato. Il controllo
giornaliero usa le macro effettive delle ricette miste. Copertura finale e
assenza di scritture parziali restano protette. Test dedicato:
`tests/menu-layer-sequenziale.test.js`. Batteria completa: 26/26 suite
superate; stress V/S/G: 25 settimane e 350 pasti completi.

### Verificato automaticamente

- settimana vuota, parziale e piena;
- preservazione dei pasti bloccati e assenza di scritture sulla settimana piena;
- lettura delle realizzazioni legacy e snapshot quantitativo v1;
- migrazione degli zeri espliciti in `excluded` e dei conteggi utente in `fixed`;
- profili onnivoro, vegetariano e vegano sul nuovo ricettario;
- selezione dei carboidrati AUTO limitata agli incroci coperti dal profilo;
- contratti PWA, manifest, icone, store IndexedDB e assenza di sorgenti runtime 1.0;
- conversione ricette approvate, composizioni fisse, stack condiviso, dosi
  fredde complete e sughi con residuo;
- unit test preesistenti su zeri, min=max, massimo nullo, cap, esclusioni,
  contesti, residuo, inventario, spesa, consumo e storico.

### Ancora da verificare in browser reale

- responsive Android, tastiera, service worker e cache su dispositivo fisico;
- migrazione reale di IndexedDB e reset dall'interfaccia;
- spesa, consumo e storico end-to-end (piano/pasto/Roll/Salvafrigo già
  verificati via Chromium/Playwright il 03/09, vedi sezione finale);
- nessuna release senza esito positivo e autorizzazione di Cwe.

## Riepilogo sessione pomeridiana 03/09/2026 (stato attuale, fonte unica)

Punto di lettura rapido per non dover ricostruire la cronologia sopra.
Ultimo commit di questa sezione: `8d2be4e`.

- `index.html` ripristinato dopo la corruzione di `9f38543` (8.900+ righe
  integre, verificato sintatticamente e in browser).
- Generazione settimanale riscritta in sequenza P→C→V, un pasto alla volta,
  nessun retry sull'intera settimana, nessun prodotto cartesiano.
- Rendering C/P/V: sempre nome ricetta (mai ingredienti sciolti); una
  ricetta a più ruoli compare una sola riga con le icone combinate, su
  Menù e Pasto; giorni passati mostrano "— pasto concluso —" in carattere
  sottile invece del placeholder di stato-vuoto.
- "Proponi nuovo pasto" e Salvafrigo condividono la pipeline settimanale.
- Set utente: bozza vera (nessuna scrittura prima di Salva su tutte le
  sotto-sezioni), i tre pulsanti Salva committano la stessa configurazione.
- "Fonti proteiche/giorno" rispettato anche dal riempimento automatico,
  incluso il caso limite delle ricette a doppia fonte proteica.
- Config nutrizionale (allergie, profilo) calcolata una volta per sessione,
  non ricaricata da IndexedDB ad ogni pasto/condimento/Roll; pulsante
  manuale dedicato nel Setting nutrizionista per ricalcolarla dopo un
  cambio di profilo.
- Specifica funzionale aggiornata con le deroghe decise in sessione (pasto
  senza carboidrato con avviso, cooldown carboidrati AUTO, vincolo fonti
  proteiche/giorno anche sulle celle libere).
- 27/27 suite di test, incluso il nuovo `lotto-j-una-fonte-proteica-giorno.test.js`.
- **Ancora aperto, non deciso**: l'ordine casuale delle classi proteiche a
  volte non trova l'unica combinazione valida quando i margini settimanali
  sono stretti (visibile soprattutto con "Fonti proteiche/giorno"=1) — in
  attesa di decidere se applicare lo stesso algoritmo costruttivo già usato
  per i carboidrati, o accettare l'errore esplicito.
- Dettaglio completo di ogni intervento nella memoria di sessione di Claude
  e nei messaggi del commit corrispondente su GitHub.

## Aggiornamento 04/09/2026

- Corretto falso avviso (triangolo giallo) di sostituzione carboidrato
  quando tutti gli slot sono AUTO (nessun FIXED nel Set): l'avviso
  confrontava la chiave scelta con il primo elemento di una lista
  mescolata casualmente, non con una reale condizione utente. Ora scatta
  solo se un carboidrato FIXED disponibile è stato scartato. Dettaglio in
  `LOTTO_J_MOTORE_UNICO.md`. Aggiunto
  `tests/lotto-j-avviso-solo-per-fissi-sostituiti.test.js`. 28/28 suite.
- Verificati senza necessità di modifiche: sequenza P→C.user→C (spec
  sez. 6), separazione sughi/condimenti dalla scelta P/C, cache
  `configRuntime()`.
- **Ancora aperto, non affrontato in questa sessione**: latenza percepita
  sul Roll (`statoRollPasto` ricalcola tutte e tre le alternative C/P/V a
  ogni render, anche quando ne è stata usata una sola) — diagnosi fatta,
  fix non applicato, richiede verifica di tempi reali in browser. Il
  codice morto `renderPastoTabContenuto`/`draftPasto` (editor manuale mai
  raggiungibile dal click reale, distinto dal Roll che invece funziona)
  resta da chiarire con Cwe: rimuovere o completare.

## Aggiornamento 04/09/2026 (2) — Programmazione Menù

- Implementato il lucchetto per singola realizzazione (P/C/V, o l'intera
  realizzazione se una ricetta copre più ruoli) nella pagina
  Programmazione/Menù settimanale, rimuovendo da quella pagina editor,
  pannelli a comparsa, Roll e ricerca (restano solo nel Pasto del giorno).
  Dettaglio completo in `LOTTO_J_MOTORE_UNICO.md`.
- `Rigenera` (e "Genera menù") preservano ora esattamente le realizzazioni
  bloccate e rigenerano solo quelle libere; un pasto interamente bloccato
  resta intatto; un blocco che rende impossibile completare un pasto fa
  fallire la generazione con un errore preciso, senza sbloccare nulla.
- Nuovo test `tests/lotto-programmazione-lucchetti.test.js`. Suite: 29/29
  (a parte la flakiness pre-esistente nota di `lotto-j-vsg-stress.test.js`).
- **Non verificato con un browser reale in questa sessione** (limite di
  risorse posto esplicitamente da Cwe): la copertura resta a livello di
  motore con IndexedDB reale via harness Node. Verifica end-to-end in
  Chromium/Playwright ancora da fare quando servirà.
- Punti già noti e ancora aperti (latenza Roll, editor manuale morto)
  restano tali, non toccati in questo intervento.

## Aggiornamento 04/09/2026 (3) — Pagina Pasto

- Eliminato l'editor Pasto morto (`draftPasto` e ~725 righe collegate:
  `renderPastoTabContenuto(LegacyV72)`, `renderContenutoAlternativaCompleta`,
  `generaCandidatoDraft`, `confermaPastoDaTab` e tutti gli helper usati
  solo da questi), verificato irraggiungibile chiamante per chiamante
  prima di toccarlo. Non toccati: `apriModalEditorPasto` (spuntini),
  `renderBloccoSemplice`/`renderContenutoAlternativaSemplice` (spuntini),
  i campi `primoId/secondoId/contornoId` usati per compatibilità con
  record piano legacy altrove nel codice.
- Causa della latenza confermata: `renderBloccoNuovoMotore` chiamava
  `statoRollPasto()` a ogni render, anche senza alcuna richiesta
  dell'utente. Rimossa dal rendering ordinario.
- Nuova interfaccia: sotto ogni pasto modificabile, solo "Alternativa" e
  "Salvafrigo"; un pannello proposta con "Imposta come pasto"/"Rigenera"/
  "Annulla". `rigeneraPasto` ha un nuovo parametro opzionale
  `soloAnteprima` (additivo, invariato se assente) che salta il
  `put('piano',...)`: l'unico salvataggio di tutta la pagina avviene ora
  su "Imposta come pasto" (riusa `salvaRoll`). Dettaglio completo in
  `LOTTO_J_MOTORE_UNICO.md`.
- Nuovo test `tests/lotto-pasto-anteprima-non-salvata.test.js` (fallisce
  sul codice precedente, passa dopo). Suite: 29/29 (stessa flakiness
  pre-esistente nota di `lotto-g-weekly-generation.test.js` e
  `lotto-j-vsg-stress.test.js`). Diff netto: -778/+232 righe.
- `ruotaPasto`/`statoRollPasto` nel motore non hanno più alcun chiamante
  dopo questa modifica ma non sono state rimosse (non erano nell'elenco
  esplicito richiesto) — da decidere con Cwe.
- **Non verificato con un browser reale in questa sessione** (limite di
  risorse posto esplicitamente da Cwe): copertura a livello di motore
  con IndexedDB reale via harness Node. Latenza misurata nello stesso
  harness (non browser), qualitativamente conclusiva: il rendering
  ordinario non chiama più il motore, prima lo faceva a ogni apertura.

## Aggiornamento 04/09/2026 (4) — Regressione icone proteiche

- Corretto: dal commit `8d2be4e` ogni proteina in Pasto/Programmazione
  mostrava genericamente '🥩' (`ICONE_VSG.P`), ignorando il vero gruppo.
  `iconaGruppoProteico()` esisteva già e non veniva più usata da quel
  punto per le righe C/P/V.
- `righeVsgUniche()` propaga ora `gruppoProteico` per riga; nuova
  `iconeRigaVsg(riga)` (unica fonte condivisa, C/V fissi, P sempre via
  `iconaGruppoProteico`) usata nei 3 renderer (Pasto, pannello proposta,
  Programmazione). `iconaPastoDaVoce()` (calendario storico): non
  riduce più al primo gruppo proteico trovato, niente più fallback
  `'🍝'`, condizioni temporali invariate. `motor-v12.js` non toccato.
- Nuovo test `tests/lotto-icone-gruppo-proteico.test.js` (esegue
  davvero le funzioni estratte da `index.html`, fallisce sul codice
  precedente, passa dopo): tutti gli 11 gruppi proteici, coerenza fra
  le tre viste, combo C+P/P+V, doppia proteina reale non ridotta,
  nessun default 🥩/🍝, record legacy con/senza gruppoProteico.
- Suite: 31/31.
