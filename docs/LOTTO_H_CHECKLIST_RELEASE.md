# DietaPlanner — checklist Lotto H e release

**Stato:** release v2 autorizzata con gate browser locale non eseguito
**Pubblicazione:** autorizzata esplicitamente da Cwe il 30 agosto 2026

Questa è la checklist unica per chiudere il Lotto H. Un controllo segnato
`PASS automatico` è già dimostrato dalla suite; `DA ESEGUIRE` richiede una
prova browser reale sulla root corrente. Un errore lascia la release bloccata
e deve generare un caso di regressione prima della correzione.

## 1. Precondizioni

- [x] Root unica come area applicativa.
- [x] Runtime su `motor-v12.js` / `DietaPlannerMotorV12`.
- [x] Sorgenti catalogo esclusivamente `db-ricette.json` e
  `ingredienti-new.json`.
- [x] Nessuna dipendenza runtime da `Vecchia versione 1.0/`.
- [x] Suite automatica completa: 12/12 PASS.
- [x] Controllo sintattico e `git diff --check`: PASS.
- [x] Confrontare le 20 voci sospese con il catalogo attivo: 10 già coperte,
  due scartate per decisione/preferenza, una affidata alla composizione
  automatica, cinque definite per conversione, una ulteriore ricetta
  scartata e la zuppa modulare esclusa a favore del mix completo, come da
  `AUDIT_CONVERSIONE_RICETTARIO_SOSPESO.md`.
- [x] Definire la destinazione di tutte le voci non equivalenti.
- [x] Applicare le conversioni approvate, validare il catalogo e completare la
  conversione sufficiente del ricettario: v68, 39 template.

## 2. Migrazione e persistenza browser

- [ ] Aprire l'app con IndexedDB vuoto e verificare la creazione degli otto
  store correnti.
- [ ] Aprire l'app con dati preesistenti compatibili e verificare che piano,
  impostazioni, inventario e storico restino leggibili.
- [ ] Verificare la migrazione dei carboidrati legacy in AUTO/FIXED/EXCLUDED.
- [ ] Verificare che una realizzazione legacy senza `schemaQuantita` sia
  leggibile e che una nuova realizzazione salvi lo snapshot quantitativo.
- [ ] Chiudere e riaprire l'app: nessuna scelta committata deve perdersi.

## 3. Programmazione settimanale

- [x] Settimana vuota, parziale e piena: PASS automatico.
- [x] Pasto bloccato preservato e scrittura settimanale atomica: PASS
  automatico.
- [x] Profili onnivoro, vegetariano e vegano: PASS automatico.
- [ ] Da UI, generare solo da domani; nessun record passato non consumato.
- [ ] Con inventario vuoto, generare il menu e il carrello senza blocchi.
- [ ] Verificare verdure delicate a inizio settimana e durevoli verso la fine.
- [ ] Verificare quantità e unità `g`, `ml` e `pz` nel carrello.
- [ ] Verificare bozza Menu: Annulla, Resetta, Rigenera, blocchi e Salva.

## 4. Pasto odierno e consumo

- [ ] Mostrare chiaramente il pasto programmato come riferimento.
- [ ] Proporre alternative compatibili senza confondere piano e inventario.
- [ ] Con scorta urgente, favorire scadenza/deperibilità/avanzo.
- [ ] Senza scorta, proporre comunque una soluzione fresca compatibile.
- [ ] Consumare il pasto e verificare lo stesso snapshot in nutrizione,
  inventario, spesa e storico.
- [ ] Verificare che un consumo storico non venga riscritto da rigenerazioni.
- [ ] Verificare piatti speciali con `nonRichiedeInventario`.

## 5. UI C/P/V e Roll

- [ ] In Programmazione, pranzo e cena sono righe separate C/P/V.
- [ ] Nel Pasto odierno è usata la stessa struttura C/P/V.
- [ ] Ogni Roll appare a destra della propria riga.
- [ ] Roll C cambia soltanto C compatibile.
- [ ] Roll P cambia soltanto P/cottura compatibile.
- [ ] Roll V cambia soltanto V/condimento compatibile.
- [ ] Il Roll è disabilitato quando non esiste un'alternativa reale.
- [ ] Dopo ogni Roll il residuo verdura viene ricalcolato senza duplicazioni.
- [ ] La rotazione automatica dei condimenti evita ripetizioni continue.

## 6. Reset, mobile e PWA

- [ ] Reset piano non cancella lo storico.
- [ ] Reset storico è separato e pulisce anche lo stato collegato previsto.
- [ ] I reset eliminano bozze e flag di generazione forzata.
- [ ] Setting nutrizionista resta entro la larghezza di uno smartphone Android.
- [ ] Modal e campo attivo restano visibili con tastiera aperta.
- [ ] Manifest e installazione PWA funzionano.
- [ ] Online: HTML e JSON correnti arrivano dalla rete.
- [ ] Offline dopo almeno un'apertura: app e dati statici disponibili dalla
  cache senza richiamare asset della versione 1.0.

## 7. Chiusura

- [ ] Tutti i controlli browser precedenti sono PASS.
- [ ] Ogni difetto trovato possiede un test di regressione.
- [ ] Suite automatica finale, sintassi e diff sono PASS.
- [ ] Versioni degli asset e cache PWA sono coerenti con la release candidata.
- [ ] Diff finale limitato ai file autorizzati e nessun segreto presente.
- [x] Cwe autorizza esplicitamente la pubblicazione.
- [ ] Solo dopo l'autorizzazione: commit/push e verifica della versione online.

## Esito corrente

Il Lotto H automatico e la conversione sufficiente del ricettario sono
superati. Il 30 agosto 2026 il browser reale è stato avviato, ma l'ambiente
cloud ha rifiutato l'accesso alla root servita localmente con
`ERR_BLOCKED_BY_CLIENT`. Cwe, informato del limite, ha richiesto esplicitamente
la pubblicazione della release v2. Le caselle browser non vengono marcate come
PASS e restano controlli post-pubblicazione da eseguire sulla v2 effettiva.
