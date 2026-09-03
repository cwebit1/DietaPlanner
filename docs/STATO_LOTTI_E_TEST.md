# DietaPlanner — stato consolidato lotti e test

**Data:** 2026-09-03
**Pubblicazione:** release v2 autorizzata da Cwe il 30 agosto 2026

| Lotto | Stato | Evidenza |
|---|---|---|
| A — baseline | verificato | fixture PDF e snapshot root |
| B — resolver | verificato | precedenze, range, AUTO/EXCLUDED/FIXED |
| C — motore | verificato sulla v12 | integrazione, cap, profili, atomicità settimana |
| D — Setting | verificato | resolver, contesti, nessuna mutazione catalogo |
| E — Set | verificato | stati carboidrati e cap personali restrittivi |
| F — catalogo | verificato sui dati correnti | 39 template, 157 ingredienti, referenze coerenti |
| G — generazione/manuale/UI | implementato e verificato automaticamente | quantità atomiche, residuo, deperibilità, pasto odierno, C/P/V |
| H — stress test/release | release v2 autorizzata | 12/12 automatici passati; gate browser locale non eseguibile nell'ambiente cloud, pubblicazione richiesta esplicitamente da Cwe |
| I — accessi/RBAC/Firestore | progettato, non implementato | `LOTTO_I_ACCESSI_RBAC_E_MIGRAZIONE_FIRESTORE.md`; esecuzione per fasi con rollback |

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
- `tests/menu-consumo-automatico-store-reale.test.js`.

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

- responsive Android, tastiera, service worker e cache;
- migrazione reale di IndexedDB e reset dall'interfaccia;
- flussi completi piano/pasto odierno/Roll/Salvafrigo/spesa/consumo/storico;
- nessuna release senza esito positivo e autorizzazione di Cwe.
