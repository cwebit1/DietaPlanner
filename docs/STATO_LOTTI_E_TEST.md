# DietaPlanner — stato consolidato lotti e test

**Data:** 2026-08-30
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

Ultima esecuzione, Blocco 4 V/S/G: 17/18 test passati, più controllo
sintattico del motore. L'unico errore è il test Lotto C già noto, che invoca
`creaSequenzaCarboidrati` con la firma precedente; i test Lotto J, Lotto G e
le altre suite risultano superati. Il Blocco 3 ha introdotto soltanto la
lettura semantica distinta dei token `V`, `S` e `G` nel motore; il calcolo
quantitativo strutturato è stato aggiunto nel Blocco 4 senza cambiare ancora
l'ordine di costruzione del pasto. Il test dedicato e le suite collegate sono
passati; nella corsa aggregata anche la suite settimanale è passata. Resta
registrata l'intermittenza preesistente del solo controllo di avanzamento,
osservata in una precedente esecuzione isolata.

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
