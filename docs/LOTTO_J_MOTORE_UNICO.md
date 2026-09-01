# Lotto J — Motore unico: istruzioni, decisioni e log tecnico

**Origine:** sessione di audit e intervento assistita, avviata dopo l'analisi
completa di `index.html`/`motor-v12.js`. Questo documento raccoglie le
istruzioni operative date da Cwe, le decisioni prese e lo storico tecnico
degli interventi — è il riferimento da rileggere prima di riprendere il
lavoro sul motore di generazione, coerente con la regola già in AGENTS.md
di consultare la documentazione prima di ogni modifica.

---

## 1. Direttiva di fondo

> "Io voglio un motore solo. Non voglio più cose in giro che ragionano con
> i criteri del vecchio motore. Il vecchio deve sparire e il nuovo deve
> avere totale controllo sulla logica."

`motor-v12.js` è l'unica fonte di verità per generazione settimanale,
naming, composizione P/C/V, roll, rigenerazione. `db-ricette.json` +
`ingredienti-new.json` sono gli unici cataloghi letti a runtime. I motori
legacy paralleli (E2/E3, sistema modulare in `index.html`) vanno
**eliminati**, non solo deprecati — "sul nuovo db c'è materiale a più che
sufficiente e se manca si aggiunge, non lo voglio più tra le palle".

## 2. Logica di generazione — layer, unica fonte valida

Per ogni slot pranzo/cena, un giorno alla volta:

- **Layer 1** — cerca una combinazione P+C già dichiarata nel catalogo,
  secondo le tabelle Set utente (frequenze, esclusioni, cap).
- **Layer 2a** (se Layer 1 fallisce) — fissa prima P con query dedicata
  random tra le opzioni idonee; poi cerca C con query separata, guidata
  da preferenza/idoneità. Si ignora se C porta già con sé una V (spesso
  da sugo).
- **Layer 2b** (se anche la query C fallisce) — non si blocca la
  generazione: si sceglie comunque una C random forzata, marcata con un
  **avviso** (flag giallo + tooltip: *"Ricetta per carboidrato definito
  non disponibile"*).

  **Distinzione fondamentale, chiarita esplicitamente da Cwe — cosa il
  Layer 2b può ignorare e cosa MAI:**
  - `carbRicettaAmmesso`/`opts.carbBudget` (continuità con il carboidrato
    già programmato per quel giorno/quella settimana) è **indicativo, non
    vincolante** — "la tabella carboidrati è indicativa per dare varietà
    ma non è assolutamente vincolante". Il Layer 2b **può** ignorarlo.
  - `ricettaAmmessa` (allergeni, blocchi, e soprattutto i **tetti
    settimanali sui carboidrati limitati** — gnocchi/pasta ripiena/
    gallette/ecc., 0-2 volte a settimana da baseline nutrizionista) è un
    vincolo **duro, mai bypassabile**: "i carboidrati vincolati nella
    frequenza devono restare vincolati senza sforo, o non si rispettano
    le basi per cui è sviluppata questa app". Il Layer 2b **non deve mai**
    ignorarlo, nemmeno come ultima risorsa.

  **Bug trovato e corretto:** la prima implementazione del fallback in
  `generaCandidatiPasto` pescava da `state.ricetteConcrete` grezzo,
  bypassando per errore *anche* `ricettaAmmessa` — violando quindi
  potenzialmente un tetto settimanale duro. Corretto filtrando sempre
  tramite `ricettaAmmessa(r,data,opts)` anche nel fallback forzato,
  ignorando solo `carbRicettaAmmesso`. `costruisciPastoAQuery` non aveva
  questo problema (filtrava già da `pool`, che include `ricettaAmmessa`).
- **Layer 3** — verifica stato verdura: **V** (completo) nessuna azione;
  **V-** (parziale, da sugo) nuova query random per completare **solo il
  residuo mancante** (`residuo = max(0, porzioneRichiesta - quotaGiàPresente)`),
  mai una porzione doppia.

**Nota storica importante:** `docs/REGOLE_FLUSSO_LOGICO.md` §21-24
descrive un'alternativa ("algebra della copertura") che sembra confermata
nel testo ma è stata **abbandonata dopo essere stata scritta** — causava
crash e loop di generazione quando mancava copertura completa nel pool.
La logica a layer sopra è quella che l'ha sostituita ed è l'unica valida
(vedi Sezione 25 dello stesso documento).

### Regole specifiche per componente

- **Verdura (V):** stack **giornaliero**, non settimanale. La verdura
  fresca prende "giorno 1" da quando passa da lista spesa a inventario;
  esaurito il fresco, il sistema passa da sé al livello di deperibilità
  successivo fino ai surgelati. **Nessun vincolo di non-ripetibilità/cooldown
  su V** — altrimenti il sistema antispreco si rompe (bug reale trovato e
  corretto, vedi Sezione 4).
- **Cotture/sughi vs verdure:** C×Sughi e P×Cotture nello stesso gruppo
  fanno vero **prodotto cartesiano** (es. 4 cereali × 3 sughi = 12 piatti
  distinti). Le verdure **non** fanno cartesiano col condimento — il
  condimento si sceglie a **rotazione ciclica vera** (LRU: il meno
  recente tra gli ammessi) tra quelli abbinabili, mai sempre il primo
  della lista né puro random senza bilanciamento nel tempo.
- **Roll (finestra pasto):** rifà la query solo per la categoria toccata
  (C o P), non tocca gli altri componenti. Il risultato resta provvisorio
  finché non si clicca "Salva" (architettura "programmato vs proposta",
  già in `SPECIFICA_FUNZIONALE_CORRENTE.md` §8). Le ricette estratte hanno
  un campo `roll` pensato come stack temporaneo di sessione: non ripropone
  la stessa variazione finché non le ha esplorate tutte; una volta
  esaurite, si resetta e il ciclo riparte da capo. Concepito per array
  dinamici ma applicabile anche a query dirette su IndexedDB.
- **Salvafrigo su V (requisito aperto, non ancora implementato):** oggi
  Salvafrigo è solo un pulsante dedicato separato (livello 1 frigo
  scadenze+avanzi, livello 2 freezer). L'intenzione di Cwe è **estendere**
  questa priorità al Roll **normale** su V come comportamento di default
  — la verdura è la categoria più a rischio spreco, quindi anche un Roll
  qualunque dovrebbe dare priorità al materiale in deperimento, non solo
  tramite il pulsante dedicato.

## 3. Stato del Lotto J — cosa è stato fatto

| # | Intervento | Commit |
|---|---|---|
| J.1 | `costruisciNomeRicetta` legge `nomeFisso` prima di comporre da gruppi (naming unico, per casi tipo "Pasta alla Norma") | `d5b438a` |
| — | Documentazione: `REGOLE_FLUSSO_LOGICO.md` marcata `[SUPERATO]` su Sez.21-24, aggiunta Sez.25 con la logica a layer | `e03d186` |
| — | Layer 2b in `costruisciPastoAQuery`; fix cooldown su V in `chiaviStack`; flag giallo in UI | `049fc92` |
| — | Rimossa `generaPianoSettimana` duplicata morta; prima versione di `garantisci-slot.js` (poi corretta, vedi §5) | `c0dfd13` |
| — | Rimosso l'intero cluster "LegacyV77" (7 funzioni mai chiamate) + `componiPastoModulare`/`componiPrimoModulare` (rimaste orfane); fix bug nutrizione `voce.motoreNuovo` non gestito | `963db90` |
| — | J.5: cache versione combinazioni in `inizializza()` — evita rigenerazione completa (440 combinazioni) ad ogni avvio se `db-ricette.json`+`ingredienti-new.json` non sono cambiati | incluso in `8d46f2d` |
| — | **Correzione**: `garantisci-slot.js` eliminato (era codice morto irraggiungibile, vedi §5); `renderBloccoCompleto` ridotta a redirect | `8d46f2d` |
| — | Layer 2b completato anche in `generaCandidatiPasto` (percorso "Proponi nuovo pasto"/Salvafrigo) — tutti e tre i percorsi di generazione ora coerenti | `ada43b1` |
| — | **Correzione critica**: il fallback Layer 2b di `generaCandidatiPasto` bypassava per errore anche `ricettaAmmessa` (tetti settimanali duri), non solo `carbRicettaAmmesso` (continuità indicativa) — corretto nello stesso commit di questo aggiornamento doc | *(questo commit)* |
| — | Verifica di sistema totale (statica + Node + browser reale) — trovato e corretto un secondo bug reale: il fallback Layer 2b generava fino a 140.548 candidati (esplosione combinatoria), mandando in stack overflow `prioritaVerdureProgrammazionePasti`; limitato il campione forzato e resi robusti tutti i `Math.max`/`Math.min` su spread nel file | *(questo commit)* |

### Cosa resta fuori scope (deliberatamente rimandato)

- **Editor manuale del singolo pasto** ("finestra pasto": `renderContenutoAlternativaCompleta`, `componiSecondoContorno`, `scegliComponentiSecondo`, draft primo/secondo/contorno) — Cwe ha esplicitamente rimandato questa parte più volte ("la vediamo dopo, di là è più facile").
- Struttura `varianti` per Condimenti multi-sugo (`preposizione`, `quotaVerduraGrammi`, `carboidratiCompatibili`) — progettata, non ancora popolata. **Nota:** il campo `composizioni` già presente nei dati (es. ricetta id 43, 9 carboidrati × 8 composizioni verdura) implementa concettualmente la stessa cosa — da riusare/estendere, non reinventare.
- Sezioni 17-20 di `REGOLE_FLUSSO_LOGICO.md` (redesign pagina Menù, bug modal tastiera) — decise ma mai implementate, non ancora lette per intero. **Nota:** la classificazione allergeni UE menzionata nella stessa sezione è in realtà **già implementata e verificata** — vedi punto dedicato sotto.

## 4. Allergeni UE — verificato, funzionante

Verifica del 01/09/2026, richiesta da Cwe dopo un dubbio: gli allergeni
**sono già completamente integrati**, catena verificata end-to-end:

1. **UI**: `ALLERGENI_UE` in `index.html` — 14 voci esatte della
   classificazione UE (glutine, crostacei, uova, pesce, arachidi, soia,
   latte, frutta a guscio, sedano, senape, sesamo, solfiti, lupini,
   molluschi), toggle in "Configurazione avanzata".
2. **Persistenza**: `salvaConfigAvanzata` → `impostazioni/allergeniAttivi`.
3. **Resolver**: `caricaConfigurazioneNutrizionaleRisolta` →
   `resolved.safety.allergens` → `cfg.allergie`.
4. **Dati**: `ingredienti-new.json`, campo `allergeni` per ingrediente —
   le 10 chiavi effettivamente usate (`crostacei`, `frutta_guscio`,
   `glutine`, `latte`, `molluschi`, `pesce`, `sedano`, `sesamo`, `soia`,
   `uova`) combaciano esattamente con `ALLERGENI_UE`, nessun
   disallineamento di stringhe. Le altre 4 voci UI (arachidi, senape,
   solfiti, lupini) non sono ancora usate da nessun ingrediente nel
   catalogo attuale — non un bug, semplicemente nessun ingrediente le
   contiene oggi.
5. **Motore**: il campo `allergeni` viene copiato dall'ingrediente alla
   ricetta compilata in 3 punti di `motor-v12.js` (righe 486, 513, 640);
   `ricettaAmmessa` lo controlla come **esclusione dura**
   (`i.allergeni.some(a=>cfg.allergie.includes(a))`), mai bypassabile
   nemmeno dal Layer 2b — stesso principio dei tetti settimanali.
- Test end-to-end reale su dispositivo/browser — nulla del lavoro sopra è stato verificato su IndexedDB vero, solo in isolamento dove possibile.

## 5. Bug trovati e corretti durante l'audit

1. **Cooldown applicato erroneamente a V** — `chiaviStack()` escludeva la
   categoria C dal tracciamento cooldown ma non V; tutti i 34 ingredienti
   V reali avevano `stack:1`, quindi il cooldown si applicava davvero
   alle verdure, rompendo il sistema antispreco. Corretto in due punti
   (loop principale + blocco fallback).
2. **Nutrizione non contata per pasti nuovo-motore** — `calcolaProgrammatoGiorno`
   e `renderNutrizioneGiorno` non gestivano `voce.motoreNuovo`: i pasti
   generati dal motore nuovo venivano contati a zero nel totale
   nutrizionale del giorno. Corretto sommando da
   `voce.realizzazioni[].nutrientiEffettivi` (mappatura campi:
   `kcal/proteine/carboidrati/grassi` → `kcal/prot/carb/grassi`).
3. **`risolviSottotipoFine` mai definita** — riferimento a funzione
   inesistente in un ramo morto di `garantisciRicettaSlot` (sparito con
   la rimozione di quella funzione).

## 6. Lezione appresa — verificare la raggiungibilità fino in fondo

Un audit esterno ha trovato un bug in `garantisci-slot.js` (usava
`voce.fascia`, che significa **solo** facile/medio/difficile, come target
proteico invece di `voce.categoriaTarget`). Verificato: il bug era reale
ma **senza effetto**, perché `garantisciRicettaSlot` aveva un solo
chiamante, irraggiungibile (dentro `renderBloccoCompleto`, dopo un
redirect a `renderBloccoNuovoMotore` che scatta sempre dato che
`DietaPlannerMotorV12` è sempre caricato).

**La lezione reale:** tutto il lavoro su `garantisci-slot.js` era
costruito su un presupposto mai verificato fino in fondo — che
`garantisciRicettaSlot` fosse il percorso vivo per riempire uno slot
pasto vuoto. Non lo era: il vero percorso vivo era già
`renderBloccoNuovoMotore` → pulsante "Genera pasto" →
`DietaPlannerMotorV12.rigeneraPasto`. **Non basta contare i chiamanti di
una funzione — bisogna verificare che anche quel chiamante sia
raggiungibile, risalendo la catena fino in fondo, prima di costruire
qualcosa sopra.**

Correzione applicata: `garantisci-slot.js` eliminato, `renderBloccoCompleto`
ridotta al solo redirect. `risolviSlotSingolo` (infrastruttura corretta,
con Layer 2b) resta in `motor-v12.js`, oggi orfana, disponibile per
quando si affronterà per davvero l'editor manuale del pasto.

## 7. Verifica di sistema totale (01/09/2026) — statica, Node, browser reale

Richiesta esplicita di Cwe: verifica completa prima di considerare il
Lotto J concluso. Eseguita in tre livelli.

**Statica:** sintassi valida su tutti i file JS, JSON validi, zero
riferimenti residui al codice eliminato in sessione, tutte le 51 funzioni
esportate da `motor-v12.js` esistono davvero.

**Node (IndexedDB/fetch simulati):** 540 combinazioni corrette (440 da
template + 100 sintetiche di catalogo), cache J.5 confermata letta
davvero (tecnica del marcatore: una modifica sopravvive a una seconda
`inizializza()` con stessa versione), cambio versione forza correttamente
la rigenerazione, 270 pasti generati su 6 settimane consecutive senza
alcun blocco sulle verdure (fix cooldown-V confermato sotto uso
prolungato).

**Bug trovato e corretto durante lo stress test:** forzando
l'esaurimento dei carboidrati per innescare il Layer 2b davvero, il
fallback di `generaCandidatiPasto` generava **140.548 candidati**
(proteine candidate × tutto il catalogo forzato come carboidrato),
mandando in stack overflow `prioritaVerdureProgrammazionePasti`
(`Math.max(...array)` su spread di array enorme). Corretto in due modi:
1. Il campione forzato è ora limitato a un massimo di 8 (mescolato con
   `ordinaPerStackPoiCaso`), non più tutto il catalogo.
2. Tutte le 6 occorrenze nel file dello stesso pattern fragile
   (`Math.max`/`Math.min` su spread) sono state rese robuste con
   `reduce`, eliminando l'intera classe di vulnerabilità indipendentemente
   dalla causa.

Ritestato dopo la correzione: il Layer 2b sotto stress restituisce
correttamente l'avviso e le realizzazioni, nessun crash.

**Browser reale (Chromium via Playwright, IndexedDB vera del browser,
server HTTP reale, stesso ordine di caricamento script di produzione):**
- Generazione completa: 540 ricette, 10 pasti, tutti con realizzazioni,
  zero errori console/pagina.
- **Cache J.5 confermata anche nel browser vero**: un marcatore scritto in
  IndexedDB sopravvive a una nuova navigazione della pagina — la cache
  viene letta davvero, non solo "non fallisce".
- **Invalidazione cache confermata nel browser vero**: alterando la
  versione salvata, la rigenerazione scatta correttamente e il marcatore
  sparisce.

Questo è il livello di verifica più alto raggiungibile senza il
dispositivo reale di Cwe — copre tutto tranne l'interazione utente vera e
propria (tap, scroll, resa visiva).

## 9. Review esterna (ChatGPT) e correzioni conseguenti (01/09/2026)

Cwe ha condiviso una review esterna del codice a HEAD `c1918f9`. Tre punti
segnalati, verificati tutti nel codice reale prima di agire.

**Punto 1 — regole hardcoded in `composizioneSeparataConsentita`**
(`affettati` → solo `pane`, caso speciale `polenta`): non è un bug, è
già stato discusso con Cwe in precedenza (vedi Sezione 1) — patch
difensiva contro residui del vecchio motore, Cwe ha deciso esplicitamente
di lasciarla com'è. Il reviewer non aveva questo contesto.

**Punto 2 — confermato, corretto.** `ruotaPasto` scriveva subito su
`piano` (`await put('piano',aggiornata)` come ultima riga), senza stadio
provvisorio — in contraddizione con "la ricetta passa sul piano
alimentare solo quando si clicca Salva" (istruzione di Cwe sulla
finestra pasto). Corretto:
- `ruotaPasto` ora calcola e restituisce il risultato senza salvarlo.
- Nuova funzione esportata `salvaRoll(voce)` per il commit esplicito.
- `ruotaPasto`/`statoRollPasto` accettano un parametro opzionale
  `vocePendente`, per poter continuare a ruotare una bozza non ancora
  salvata invece di rileggere sempre da IndexedDB (altrimenti un secondo
  Roll prima di Salvare avrebbe perso il primo cambiamento).
- UI (`renderBloccoNuovoMotore`): bozza tenuta in memoria
  (`bozzeRollPendenti`, mai in IndexedDB), pulsanti **Salva**/**Annulla**
  quando c'è una modifica non salvata. "Genera pasto"/"Proponi nuovo
  pasto"/"Salvafrigo" scartano automaticamente una bozza pendente
  (sostituiscono comunque l'intero pasto).
- Non toccato: "Genera pasto"/"Proponi nuovo pasto"/"Salvafrigo" restano
  a scrittura immediata — Cwe aveva descritto solo il Roll come
  provvisorio.

**Punto 3 — confermato, corretto.** `alternativeRollV` enumerava solo
`base.numeroVariantiCondimento` (varianti di condimento della stessa
ricetta) — il Roll V non cambiava mai la verdura stessa, contraddicendo
"V cambia soltanto verdura/condimento compatibile". Corretto: la
funzione ora unisce due liste — varianti di condimento della ricetta
corrente (comportamento preesistente, preservato) **e** verdure diverse
da altri template (nuovo, vera query di alternativa). Testato con 15 Roll
consecutivi: 6-10 verdure diverse toccate, condimenti alternati
correttamente quando è il turno della stessa verdura.

### Priorità al deperibile — estesa da Roll a tutta la generazione

Verifica di Cwe dopo il punto 3: la priorità al materiale in
deperimento/avanzo (già descritta a parole in precedenza, mai
implementata) non era inclusa nemmeno nel nuovo Roll V. Aggiunta:

- Nuovo helper condiviso `variantiPrioritarieDeperimento()` (riusa
  `getScadenzeImminenti`+`getAvanziScomodi`, già esistenti — non
  duplicati).
- `alternativeRollV`: i candidati che usano materiale in scadenza/avanzo
  vengono proposti per primi.
- `punteggioVerduraProgrammazione`/`ordinaVerdureProgrammazione`/
  `prioritaVerdureProgrammazionePasti`/`completaResiduoVerduraRicette`:
  esteso con parametro opzionale `variantiPrioritarie` (retrocompatibile,
  default assente = comportamento identico a prima).
- Agganciato in **tutti** i punti di generazione automatica:
  `generaPianoSettimana` (calcolato una volta per tutta la settimana, non
  per ogni slot), `risolviSlotSingolo`, `generaPasto`/`generaCandidatiPasto`/
  `rigeneraPasto` (escluso quando `usaInventario` è già attivo — Salvafrigo
  ha una logica dedicata più approfondita, `livelliPrioritaInventario`).

Testato: su una settimana generata con un ingrediente verdura piazzato
"in scadenza domani" nell'inventario di test, 7 realizzazioni su 12 con
componente V l'hanno usato (il resto rispetta comunque gli altri vincoli
— varietà, disponibilità per slot — che continuano ad applicarsi insieme
alla priorità, non al posto suo). Su Roll V isolato: priorità confermata
8/8 sugli slot dove il deperibile era tra le alternative valide.

Nessuna regressione sull'intera batteria di test esistente.

## 10. Metodo di lavoro (istruzioni permanenti di Cwe)

- Consultare sempre AGENTS.md e la documentazione ufficiale prima di
  operare sul progetto.
- Verificare ogni campo/ipotesi contro l'uso reale nel codice (grep
  mirato) prima di includerlo in uno schema o un'analisi — mai per
  analogia con sistemi legacy o presunzione.
- Non esistono regole universali di compatibilità tra gruppi per design
  (es. "affettati solo con pane/gallette") — ogni ricetta dichiara le
  proprie combinazioni C/P/V liberamente, proprio per evitare di imporre
  regole rigide cross-ricetta.
- Prima di ogni push: verificare diff completo contro l'originale,
  testare in isolamento dove possibile, dichiarare chiaramente cosa non
  è stato/non può essere testato end-to-end.
