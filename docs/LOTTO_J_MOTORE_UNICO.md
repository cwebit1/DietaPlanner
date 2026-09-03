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
  corretto, vedi Sezione 5).
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
- **Salvafrigo su V — implementato** (era "requisito aperto" quando
  scritto per la prima volta in questa sezione; vedi Sezione 9 per il
  dettaglio): il pulsante dedicato resta, ma ora anche il Roll
  **normale** su V dà priorità di default al materiale in deperimento/
  avanzo, non solo tramite l'azione esplicita — perché la verdura è la
  categoria più a rischio spreco.

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

## 8. Bug trovato e corretto: calendario visuale non aggiornato allo schema nuovo

Verifica richiesta da Cwe insieme a una richiesta più ampia (statistiche
per-ricetta, vedi sotto): `leggiStatoGiornoCalendario` (icone pranzo/cena
nel calendario mensile) leggeva **solo** lo schema vecchio
(`vocePranzo.secondoId`, `r.gruppoProteico` da `ricettePerId`) — stessa
classe di bug già corretta altrove per `calcolaProgrammatoGiorno`/
`renderNutrizioneGiorno`. Per i pasti generati dal motore nuovo, il
calendario non mostrava **nessuna icona**.

Corretto: nuovo helper condiviso `iconaPastoDaVoce(voce, ricettePerId)`
che gestisce entrambi gli schemi — per il nuovo, deriva l'icona da
`realizzazioni[].gruppoProteico`. Il campo `gruppoProteico` non arrivava
fino alla realizzazione salvata: esteso `snapshotRealizzazione` in
`motor-v12.js` per copiarlo dalla ricetta materializzata (aggiunta pura,
nessun comportamento esistente cambiato). Testato con 5 casi (schema
nuovo consumato/non consumato, schema vecchio consumato/speciale, voce
assente) — nessuna regressione sullo schema vecchio.

**Le statistiche per-ricetta (quante volte proposta, quante volte
consumata) restano invece non implementate** — solo analisi fatta:
serve uno store IndexedDB **separato** (mai `'ricette'`, che viene
riscritto per intero ad ogni sync J.5/cambio versione catalogo, perdendo
qualunque contatore aggiunto lì sopra), con un incremento aggiornato del
`DB_VERSION` (oggi `3`) per creare il nuovo `objectStore`. "Consumata" ha
un punto di aggancio naturale già pronto (`registraConsumoStorico`,
già aggiornata per lo schema nuovo). "Proposta" ha un'ambiguità mai
sciolta con Cwe: solo generazione/rigenerazione effettiva, o anche ogni
variazione esplorata col Roll (che oggi non passa dallo stesso punto di
`assegnaCondimentiRotazioneGlobale`, servirebbe un aggancio separato in
`ruotaPasto`/`salvaRoll`). Lavoro sospeso, da riprendere.

### Rifiniture grafiche pagina Menù — lavoro di Cwe/ChatGPT, non di questa sessione

Tra un intervento e l'altro di questa sessione, Cwe ha fatto 4 correzioni
grafiche dirette sul repo tramite ChatGPT (non Claude), tutte su
`index.html`, solo CSS/layout, nessuna logica toccata:

| Commit | Cosa |
|---|---|
| `e40506b` | Allinea titoli e indicatori dei pasti nel menù (`.menu-pasto-summary` da block a grid, triangolo/marker + titolo su colonne allineate) |
| `3a35faf` | Raggruppa le coperture della stessa realizzazione nel menù (badge C/P/V) |
| `8c5edf9` | Mostra le date estese nelle intestazioni del menù |
| `aa8d1e7` | Allinea i triangoli ai titoli dei pasti |

Nessuna di queste tocca `motor-v12.js` o logica di generazione — pura
UI. Riportate qui solo per completezza dello storico commit, non fanno
parte del lavoro di audit/correzione motore di questa sessione.

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

## 10. Pagina Menù: pulsanti, generazione rapida, fix fascia oraria (01/09/2026)

Richiesta di Cwe su tre fronti, tutti verificati nel browser reale
(Chromium/Playwright) con screenshot prima di pushare.

**Pulsanti scroll settimana** (`#menuSettimanaTab [data-menu-prev]`/
`[data-menu-next]`) raddoppiati in dimensione (padding 6px 10px → 12px
20px, font 1.4rem). Nuova regola CSS scoped solo a `#menuSettimanaTab`,
non toccata `.tabgroup button` condivisa da altri selettori dell'app
(colazione, impostazioni...).

**Nuovo pulsante "Genera menù"** sotto la descrizione della pagina,
larghezza piena/altezza contenuta (`#btnGeneraMenuTop`), stessa logica
del "Rigenera" già in fondo pagina. Listener statico agganciato una sola
volta (pattern già in uso per altri pulsanti statici come
`btnSalvaRicettaManuale`), non ad ogni render.

**Bug trovato e corretto: `elaboraConsumoAutomatico` mai chiamata da
Menù.** Il meccanismo che fa passare un pasto da "programmato" a
"consumato" (e lo rende immodificabile) quando la fascia oraria è
superata era corretto e già aggiornato per lo schema nuovo, ma veniva
chiamato solo da `renderPiano()`. Un utente che apre direttamente Menù
senza mai passare da Piano non vedeva applicato il blocco. Aggiunta la
stessa chiamata in cima a `renderMenuSettimanale()`.

**Bug trovato e corretto: la generazione saltava tutto il giorno
odierno.** `generaPianoSettimana` aveva `if(day<=today)continue;` —
saltava pranzo E cena di oggi indistintamente, anche se uno dei due era
ancora in fascia oraria aperta (mai consumato). Corretto:
- `motor-v12.js`: `day<today` (non più `<=`), con esclusione esplicita
  solo dei pasti già `consumato`; nuovo parametro opzionale
  `opzioni.pastiOggiChiusi` (Set) per il caso raro di un pasto mai
  generato ma già fuori fascia (il motore non ha e non deve avere un
  concetto di orologio — resta responsabilità del chiamante).
- `index.html`: nuovo helper `pastiOggiFuoriFascia()` (usa
  `fasciaPastoSuperata` già esistente), passato a tutte e 4 le chiamate
  di `generaPianoSettimana(...,{forza:true})` nel file (Resetta,
  Rigenera, Genera menù, generazione da Piano).

Testato: 3 casi in Node (pranzo oggi consumato → invariato; cena oggi
aperta mai generata → generata; pasto mai esistito ma segnalato fuori
fascia → escluso), tutti confermati. Confermato anche nel browser reale
con l'orologio di sistema vero: pranzo di oggi (fascia già chiusa) non
generato, cena (ancora aperta) generata correttamente. Nessuna
regressione sulla batteria di test esistente.

## 11. Cinque criticità urgenti segnalate da Cwe (01/09/2026)

Segnalazione con priorità massima, 5 punti. Tutti verificati nel codice
reale prima di correggere, non per supposizione.

**1. Overflow/blocco generando a settimana già iniziata.**
`creaSequenzaCarboidrati`/`creaSequenzaProteine` restituivano errore
bloccante (`valid:false`, zero pasti generati) quando il fabbisogno fisso/
minimo settimanale eccedeva gli slot realmente generabili — succedeva
quando un giorno non era mai stato generato (ormai passato,
irraggiungibile). Riprodotto e confermato: 13 carboidrati fissi su 12
slot disponibili → bloccava; 8 minimi proteici teorici su 4 slot → bloccava.

**2. Doppioni carboidrato stesso giorno (es. Polenta a pranzo E cena).**
`chiaviStack()` esclude la categoria C dal tracciamento anti-ripetizione
(comportamento preesistente): zero anti-duplicato sui carboidrati.
Misurato: 24% di probabilità di doppione nello stesso giorno.

**3 e 4. Sughi senza completamento verdura / verdure da pool sbagliato
(rapanello, cetriolo invece di "Insalata di X e Y").** Stessa causa
comune: `compilaContorniBaseCatalogo`/`compilaProteineBaseCatalogo`
(voci sintetiche a ingrediente singolo, pensate come riserva) competevano
alla pari con le vere ricette composte in `poolAmmesso`, il pool
condiviso da tutta la generazione automatica.

**5. Nessun avviso uscendo da Menù con generazione non salvata.**
Confermato: mentre si è su Menù, le scritture su 'piano' vengono
intercettate in `menuDraft.voci` (mai IndexedDB reale) — `menuDraft.
modificata` è il segnale di modifiche non salvate, già esistente ma mai
usato per avvisare all'uscita.

### Correzioni applicate

- **`creaSequenzaCarboidrati`**: riscritta con algoritmo **costruttivo**
  (non più "riempi a caso e sistema dopo"). Per ogni giorno, si assegna
  sempre la chiave con **più scorta residua** (esclusa quella già usata
  quel giorno) — l'algoritmo dimostrato corretto per "riorganizza una
  sequenza senza due elementi uguali adiacenti" (stesso principio di
  LeetCode 767 "Reorganize String"), qui applicato direttamente perché
  pranzo+cena dello stesso giorno sono sempre posizioni consecutive.
  **Importante, corretto dopo un primo tentativo sbagliato**: un primo
  approccio (limitare il totale per chiave al numero di giorni, poi
  scambiare le posizioni in conflitto) sembrava funzionare (0,86% di
  residuo su 1400 prove) ma non era una garanzia reale — trovato un caso
  concreto di fallimento con debug mirato (una chiave esaurita "per
  sfortuna" 2 giorni prima della fine, lasciando solo un'altra chiave per
  l'ultimo giorno). L'algoritmo costruttivo a scorta-massima risolve
  questo alla radice: testato su oltre 500.000 generazioni combinate
  (4 chiavi, 2 chiavi, fissi sbilanciati, settimana parziale), **zero
  doppioni evitabili**. Nel caso davvero impossibile (una singola chiave
  fissata a più occorrenze di quanti siano i giorni — comunque non
  configurabile dalla UI reale, che limita a 7 caselle) produce sempre
  e solo l'unico doppione inevitabile, mai di più.
- **`creaSequenzaProteine`**: il fabbisogno fisso/minimo in eccesso non
  blocca più con errore quando lo scarto è spiegabile dai giorni persi
  per il tempo (today+1) — ma **non è un condono generale**: nuovo
  parametro `slotTotaliSettimanaCompleta` calcola quanto scarto sia
  legittimamente attribuibile ai giorni persi; se lo scarto lo supera
  (copertura insufficiente vera, anche a settimana intera), **continua a
  bloccare con errore esplicito**. Corretto dopo un primo errore: la
  prima versione rimuoveva il controllo "minimo non raggiunto" *sempre*,
  non solo per il caso today+1 — un condono generale che avrebbe
  nascosto problemi di copertura reali, esattamente il tipo di errore
  che Cwe ha segnalato esplicitamente come inaccettabile ("le regole
  DEVONO restare quelle, le ricette si aggiungono se mancano").
- **`poolAmmesso`**: esclude le voci sintetiche (`stackScope`
  `'contorni_catalogo'`/`'proteine_catalogo'`) dal pool di selezione
  automatica — restano in `state.ricetteConcrete` per altri usi (es.
  ricerca manuale) ma non competono più con le ricette composte del
  catalogo. Verificato: 0 nomi "nudi" su 143 realizzazioni pure-V/pure-P
  testate su 8 settimane generate, nessuna perdita di capacità di
  generazione (0 fallimenti).
- **`mostraVista`**: resa asincrona, intercetta l'uscita da Menù con
  `menuDraft.modificata===true` offrendo Salva/Esci senza salvare/Annulla
  tramite il modal di conferma generico già esistente
  (`mostraModaleAvviso`). Verificato solo a livello sintattico e logico
  (compone funzioni già testate), non con click-through nel browser reale
  per limiti dell'ambiente di test in questa sessione.

### Lezione di metodo, esplicitata da Cwe durante questa correzione

> "Se tu mi dici facendo così poi non ho copertura e sono costretto a...
> vuol dire che stai cambiando una regola per permettere ai dati che hai
> di rendere di successo un processo di base errato."

Principio da applicare sempre d'ora in avanti: quando una regola/vincolo
non è soddisfacibile con i dati/tempo disponibili, la risposta corretta è
**segnalarlo**, non piegare silenziosamente la regola per far apparire
di successo un'operazione che di fatto non rispetta ciò che l'utente ha
chiesto. L'unica eccezione legittima è quando lo scarto è interamente
spiegabile da un vincolo strutturale esplicitamente accettato dall'utente
stesso (qui: i giorni ormai passati e mai generati, coerente con la
regola today+1 già discussa in precedenza) — e anche in quel caso, solo
per la quota esattamente proporzionata, mai oltre.

## 12. Lavoro parallelo e merge (01/09/2026) — commit `fce7729` + `d914287`

Mentre venivano corrette le 5 criticità (Sezione 11), il repo si è mosso
avanti: Cwe (o un'altra sessione con lui) ha lavorato **direttamente sul
repo in parallelo**, aggiungendo 6 commit di rifinitura UI (allineamento
titoli/date/coperture nel menù) e infine `fce7729`
**"Usa solo ricette compilate in IndexedDB"**, che affronta la **stessa
area** del Bug 4 (Sezione 11) in modo più radicale:

- **`compilaContorniBaseCatalogo`/`compilaProteineBaseCatalogo` rimosse
  del tutto** — le voci sintetiche a ingrediente singolo non vengono più
  generate a monte (il fix di Claude in `poolAmmesso` le filtrava solo a
  valle, restando ridondante ma innocuo dopo questo commit).
- **`templateOrigine`**: ogni ricetta compilata porta ora con sé una
  copia del proprio template sorgente (`compilaRicetta` la salva,
  `materializzaRicetta` la usa) invece di cercarlo ogni volta in
  `state.dbRicette.ricette` tramite `templateRicetta(id)` (rimossa).
- **Cache J.5 ristrutturata**: IndexedDB (store `'ricette'`, filtro
  `fonte==='nuovo-db-compilato'`) è ora l'**unica fonte di verità** per
  `state.ricetteConcrete`, riletta sempre dopo un'eventuale
  rigenerazione — non più l'array appena calcolato in memoria. Aggiunta
  una verifica di migrazione: se la cache esistente contiene ancora
  voci sintetiche residue (`contieneFallback`), viene considerata non
  valida e rigenerata, anche a versione invariata.
- **Nuovo file `tests/lotto-g-weekly-generation.test.js`** — test
  formale automatizzato end-to-end (cache IndexedDB, colazione,
  copertura verdura, verdura ricorrente, Proponi nuovo pasto). Da
  eseguire con `node tests/lotto-g-weekly-generation.test.js` prima di
  ogni push importante, va tenuto aggiornato.

**Merge eseguito con `git merge` vero** (non force-push), nessun
conflitto di riga (le due modifiche toccavano aree diverse del file).
Verificato dopo il merge: sintassi valida, entrambi i lavori presenti,
il test formale nuovo passa, l'intera batteria di test della sessione
rieseguita senza regressioni (incluse le due correzioni più delicate:
0 doppioni su 140.000 prove carboidrati, minimo proteico ancora
correttamente bloccato quando la copertura è insufficiente).

**Nota per il futuro**: questo repo può ricevere commit da più fonti in
parallelo nella stessa finestra di tempo. Prima di ogni push, fare
sempre `git fetch` e controllare se il remoto si è mosso rispetto
all'ultimo pull, invece di assumere che sia fermo dove lo si era
lasciato.

## 13. Rotazione stesso giorno estesa a Proteina e Verdura (02/09/2026)

Segnalazione con screenshot reale: "Polenta con Taleggio" a pranzo e
"Riso con Taleggio" a cena lo stesso giorno — il fix carboidrati (Sezione
11, punto 2) copriva solo C, non le proteine. Verdure ancora mostrate
come nome nudo ("Finocchi", "Broccoli") in alcuni casi: verificato nel
catalogo reale che l'id 26 ha `testo1`/`testo2` entrambi vuoti su un
gruppo V multi-ingrediente — quando il sistema sceglie un solo
ingrediente da lì il nome è nudo per come sono scritti i dati stessi
(diverso da id19/22, che hanno `testo1:'Insalata di'` corretto). Non
ancora corretto, resta in sospeso insieme al lavoro V/S/G sotto.

**Principio confermato da Cwe**: "una volta messo in menu, stop per
quel giorno" vale per **tutte** le macro categorie — Carboidrato (già
c'era), **Proteina** e **Verdura** (nuovo). Non contraddice la libertà
settimanale già stabilita per V (può ripetersi tra giorni diversi, per
smaltire l'inventario) — sono due regole a granularità diversa: quella
settimanale su V resta, si aggiunge il divieto nello stesso giorno.

**Implementato**: nuovo tracciamento `ctx.todayStackKeys`, resettato ad
ogni cambio giorno in `risolviSettimanaRicette`, popolato con le chiavi
ingrediente di **qualsiasi** categoria tramite la nuova
`chiaviGiornoRicetta`/`chiaviGiornoPasto` (a differenza di `chiaviStack`,
che esclude apposta C e V per il cooldown settimanale — scopo diverso,
non riusabile qui). Esclusione dura in `costruisciPastoAQuery` su
proteine e verdura di completamento; se il pool si svuota (catalogo
piccolo per quella categoria), ripiega sul pool completo invece di
bloccare — stesso principio del Layer 2b.

Testato: 0 duplicati proteina/verdura su 68 giorni reali generati (10
settimane), 0 generazioni fallite su 15 settimane, nessuna regressione
(batteria completa + `tests/lotto-g-weekly-generation.test.js`).

### Decisione di design originaria V/S/G (successivamente approvata e implementata)

Cwe ha proposto una soluzione matematica per il problema di fondo —
perché il Layer 3 non completa mai un sugo/guarnizione parziale: oggi
`copertura(r).V` è vero anche quando un sugo copre solo parzialmente la
verdura (es. 80g di pomodoro contro i 200-250g richiesti), quindi il
sistema pensa la copertura sia già completa.

**Equazione**: `V_residuo = V_richiesta - S - G` (S e G sono quantità
note in grammi, 0 se assenti, l'equazione resta sempre valida e
legittima). Nuove etichette per la classe delle ricette, al posto del
concetto ambiguo e mai usato `V-`:
- **V** pura solo quando la verdura è davvero piena (porzione completa).
- **S** = verdura parziale dentro il sugo di un **primo/carboidrato**.
- **G** (Guarnizione) = verdura usata come guarnizione/condimento in un
  **secondo/proteina** — non soddisfa mai da sola il requisito V.

Tocca lo schema dati (`classe` in `db-ricette.json`) e la logica di
`copertura()`/`coperturaVerduraRicette()` nel motore. Da costruire
quando Cwe deciderà di procedere — non implementata in questa sessione.

## 14. Rimozione id 45 dal catalogo, rafforzamento design V/S/G (02/09/2026)

**Rimosse** (non trasformate) le 20 combinazioni nude del template id 45
in `db-ricette.json` — l'unico carboidrato puro del catalogo ("Riso",
"Polenta" ecc. senza alcun testo). Un primo tentativo di Claude aveva
solo aggiunto `testo1:"Porzione di"` (testo onesto, non un piatto
inventato) per eliminare il nome nudo; Cwe ha corretto con fermezza
("se ti dico togli è togli") — rimosso del tutto l'oggetto `id:45`,
versione catalogo portata a **72**.

**Impatto verificato prima del push**: nessun crash, 0% di avvisi
Layer 2b, generazione ancora funzionante su 15 settimane testate. Le
altre ricette C+V del catalogo (id 5/6/7/43 — pasta con sughi verdura)
restano valide come "fonte carboidrato" per l'abbinamento con proteine
senza carboidrato proprio (il filtro di Layer 2a richiede solo
`!copertura(r).P`, non `!copertura(r).V`) — 56/144 proteine "separate"
(affettati, pesce, legumi ecc.) sono comunque comparse nel campione
testato. **Varietà di abbinamento più ristretta** per i carbKey che solo
id45 copriva (riso puro, patate, pane, panino, taralli...) — accettato
consapevolmente da Cwe, non è un difetto silenzioso: verificato e
riportato prima del push.

### Rafforzamento decisione di design V/S/G — successivamente implementata per blocchi

Due aggiunte al design della Sezione 13:

1. **Principio d'ordine nell'assegnazione**: PX (proteina) va assegnata
   **per prima**, seguendo la tabella che l'utente ha già compilato
   (`tabellaGiornoCategoria`, esiste già) — il motore decide di suo solo
   il **condimento**. CX (carboidrato) va assegnato **dopo**, seguendo
   la configurazione scelta dall'utente (fissi/auto) — il motore decide
   di suo solo il **sugo**. In generale: dove l'utente ha dato una
   condizione esplicita, il sistema la segue; il motore decide da sé
   solo il dettaglio d'esecuzione, mai la macro-scelta.
2. **Soglia pratica sul residuo**: `V_residuo = V_richiesta - G - S`;
   se `V_residuo < 50g` non ha senso creare un piatto V dedicato così
   piccolo — si redistribuisce il residuo **a metà** tra S e G (es.
   residuo 40g → +20g a S, +20g a G); se `V_residuo >= 50g` si aggiunge
   davvero una V dedicata, dimensionata su quel residuo.

Prossimo passo dichiarato da Cwe: sviluppare l'algoritmo secondo questo
design e verificare il risultato — non ancora iniziato.

## 15. Metodo di lavoro (istruzioni permanenti di Cwe)

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

## 16. Piano operativo approvato per integrare V/S/G (02/09/2026)

Questa sezione sostituisce la parte del planning che prevedeva di dedurre a
runtime il ruolo della verdura. La distinzione viene fatta direttamente nel
catalogo, così il motore non può confondere un sugo o una guarnizione con una
verdura completa:

- `P+V` diventa `P+G` quando la quota vegetale è una guarnizione parziale;
- `C+V` diventa `C+S` quando la quota vegetale è un sugo parziale;
- `V` resta `V` soltanto quando rappresenta realmente una porzione completa.

La conversione non è una sostituzione cieca di stringhe: i piatti freddi e le
altre ricette che contengono davvero una porzione vegetale completa conservano
`V`. Ogni template misto va verificato contro quantità e funzione reale prima
della modifica.

### 16.1 Contratto matematico

Per ogni pasto:

```text
V_richiesta = porzione prevista dal resolver
S = grammi vegetali del sugo associato al carboidrato
G = grammi vegetali della guarnizione associata alla proteina
V_presente = grammi di una vera V eventualmente già contenuta nel pasto
V_residuo = max(0, V_richiesta - S - G - V_presente)
```

`S` e `G` valgono zero quando assenti. I token descrivono il ruolo; il bilancio
usa sempre i grammi effettivi della realizzazione. La sola presenza di `S` o
`G` non chiude mai booleanamente la copertura `V`.

### 16.2 Ordine di costruzione dello slot

1. Leggere la classe proteica assegnata da `tabellaGiornoCategoria`.
2. Selezionare una realizzazione proteica ammessa di quella classe.
3. Determinare il dettaglio di cottura/condimento e l'eventuale `G`.
4. Leggere il carboidrato determinato da `AUTO/FIXED/EXCLUDED`.
5. Selezionare la realizzazione C compatibile e l'eventuale sugo `S`.
6. Calcolare `V_residuo` sulle quantità effettive.
7. Applicare la soglia dei 50 g.
8. Verificare allergie, esclusioni, cap, frequenze e rotazione giornaliera.
9. Chiudere lo slot; la settimana viene salvata solo se tutti gli slot sono
   validi.

Le ricette P+C già dichiarate restano candidate quando rispettano entrambe le
macro-scelte; non vengono più preferite soltanto perché già combinate.

### 16.3 Regola del residuo

- `V_residuo = 0`: nessuna azione.
- `V_residuo >= 50 g`: aggiungere una vera ricetta `V`, ridimensionata
  esattamente sul residuo.
- `0 < V_residuo < 50 g`: non creare un piatto `V` troppo piccolo;
  redistribuire il residuo nelle quantità effettive di `S` e `G`, senza
  modificare i template.

Il residuo sotto soglia può verificarsi soltanto quando `S` e `G` sono entrambi
presenti e viene diviso a metà tra i due. Non esiste un caso operativo sotto
soglia con uno solo fra `S` e `G`; il motore tratta tale ingresso come
violazione dell'invariante anziché inventare una componente assente.

### 16.4 Modifiche tecniche previste

1. **Test del contratto prima del comportamento**: aggiungere casi puri per
   `V/S/G`, grammi, soglia e assenza di quantità negative.
2. **Audit catalogo**: classificare nominalmente e quantitativamente i template
   misti; aggiornare `db-ricette.json` e la sua versione soltanto dopo la
   verifica completa.
3. **Semantica motore**: estendere `categoriaPrincipale`, `copertura`,
   `scoreCopertura` e `pastoCompletoPerToken`; eliminare il residuo concettuale
   `V-` senza introdurre fallback legacy.
4. **Copertura strutturata**: fare restituire a
   `coperturaVerduraRicette` almeno `richiestaGrammi`, `grammiV`, `grammiS`,
   `grammiG`, `residuoGrammi` e `coperturaCompleta`.
5. **Pipeline P -> C -> V**: ristrutturare `costruisciPastoAQuery` secondo
   l'ordine della Sezione 16.2, preservando tutti i vincoli duri.
6. **Realizzazione atomica**: applicare contorno o redistribuzione su copie
   materializzate, ricalcolare nutrienti e salvare lo stesso snapshot letto da
   nutrizione, inventario, spesa e storico.
7. **Roll e Salvafrigo**: ogni Roll C ricalcola `S` e residuo; ogni Roll P
   ricalcola `G` e residuo; Roll V cambia soltanto una vera `V`; Proponi nuovo
   pasto e Salvafrigo usano la stessa pipeline.
8. **UI**: mantenere tre sole righe. `S` viene mostrato dentro la riga C, `G`
   dentro la riga P, `V` soltanto quando esiste una vera portata vegetale.
9. **Stress e browser reale**: verificare generazione, bozza/Salva/Annulla,
   Roll, Salvafrigo, IndexedDB, inventario, spesa, storico e responsive.

### 16.5 Casi di test minimi obbligatori

1. `S=0`, `G=0`: aggiunta di V completa.
2. `S=80`, `G=0`, richiesta 200: V da 120 g.
3. `S=0`, `G=60`, richiesta 200: V da 140 g.
4. `S=80`, `G=80`, richiesta 200: residuo 40 g, nessuna V dedicata.
5. `S=100`, `G=50`, richiesta 200: V da 50 g.
6. `S+G+V_presente` uguale o superiore alla richiesta: residuo zero.
7. Piatto freddo con V completa: nessun contorno aggiuntivo.
8. Roll C che cambia S e attraversa la soglia in entrambe le direzioni.
9. Roll P che cambia G e attraversa la soglia in entrambe le direzioni.
10. Propagazione identica delle quantità a nutrizione, spesa, inventario e
    storico.
11. Nessun bypass di allergie, esclusioni e cap nei fallback.
12. Nessun doppione C/P/V nello stesso giorno.
13. Lettura degli snapshot precedenti senza reset distruttivo.

### 16.6 Sequenza dei commit di sviluppo

1. Test e contratto V/S/G.
2. Audit e conversione catalogo.
3. Lettura dei token nel motore.
4. Calcolo quantitativo strutturato.
5. Pipeline P -> C -> V.
6. Soglia e redistribuzione.
7. Snapshot e propagazione.
8. Roll, Salvafrigo e rigenerazione.
9. Rendering.
10. Stress test, browser reale e aggiornamento finale della documentazione.

Ogni commit deve essere verificabile isolatamente. Conversione catalogo,
riscrittura del generatore e modifiche grafiche non devono essere accorpate in
un unico intervento.

**Regola di chiusura di ogni blocco:** al termine di ciascun blocco devono
essere pubblicati insieme sia i file modificati sia il resoconto degli
interventi realmente eseguiti. Il resoconto va registrato nella Sezione 16.7
con esito dei test, eventuali limiti della verifica e commit remoto. Un blocco
non è concluso finché modifiche e resoconto non risultano entrambi salvati
nella repository.

### 16.7 Stato di avanzamento

- **Blocco 1 — contratto e test V/S/G:** implementato. Aggiunte le funzioni
  pure `ruoliVerduraDaClasse` e `calcolaBilancioVSG` e il test dedicato
  `tests/lotto-j-vsg-contract.test.js`. La pipeline di generazione e il
  catalogo non sono stati modificati in questo blocco. Test dedicato superato;
  commit remoto `76fffe7`.
- **Blocco 2 — audit e riclassificazione catalogo:** implementato sui 12
  template misti. Conservano `V` i template `5, 9, 10, 16, 42` perché
  contengono una porzione vegetale completa; diventano `S` i template di sugo
  `6, 7, 43, 44`; diventano `G` le guarnizioni proteiche `31, 33, 39`.
  Nessuna dose o composizione è stata modificata. Catalogo portato a v73;
  aggiunto `tests/lotto-j-vsg-catalog.test.js` e riallineati a 39 template i
  test di snapshot rimasti fermi alla versione precedente. Superati il test
  V/S/G, snapshot root, catalogo, realizzazioni atomiche, generazione
  settimanale isolata, conversioni approvate, retry ricettario, migrazioni e
  contratto PWA. Nella corsa aggregata: 15 suite su 17 superate; resta il test
  Lotto C già incompatibile con la firma corrente di
  `creaSequenzaCarboidrati` e si è verificata una singola intermittenza del
  controllo avanzamento nel test settimanale; la stessa suite ha poi superato
  cinque esecuzioni isolate consecutive. Nessuno dei due punti è stato
  corretto dentro questo blocco di sola classificazione catalogo.
- **Blocco 3 — lettura dei token nel motore:** implementato in
  `motor-v12.js`. `categoriaPrincipale` conserva P e C come macro-categorie
  dei piatti `P+G` e `C+S` e riconosce esplicitamente `S`/`G` senza
  promuoverli a `V`; `copertura` espone separatamente `V`, `S` e `G`;
  `scoreCopertura` attribuisce alle quote parziali il peso secondario già
  previsto senza equipararle alla porzione completa;
  `pastoCompletoPerToken` richiede sempre una vera `V`. Rimossi dal solo
  motore i controlli operativi residui su `V-`; cataloghi, quantità, calcolo
  quantitativo, pipeline, soglia, Roll e UI non sono stati modificati.
  Aggiunto `tests/lotto-j-vsg-motor-semantics.test.js`. Superati controllo
  sintattico, i tre test Lotto J, realizzazioni atomiche e generazione
  settimanale; batteria completa: 16 suite su 17 superate. L'unico errore è
  il test Lotto C già noto, ancora incompatibile con la firma corrente di
  `creaSequenzaCarboidrati`; non è stato corretto fuori perimetro. Commit
  remoto: commit di chiusura contenente questa registrazione.
- **Blocco 4 — copertura quantitativa strutturata:** implementato in
  `coperturaVerduraRicette`, preservando i campi frazionari già consumati
  dalla pipeline. Il risultato espone ora `richiestaGrammi`, `grammiV`,
  `grammiS`, `grammiG`, `residuoGrammi`, `coperturaCompleta`, strategia e
  tipo di porzione. Le quantità fisiche sono disponibili anche in
  `grammiRealiPerRuolo`; quando nello stesso pasto convivono insalata e
  ortaggi, i campi usati dall'equazione vengono normalizzati su un unico
  riferimento di porzione, evitando di sommare grammi nutrizionalmente non
  equivalenti. La classificazione del ruolo deriva esclusivamente dai token
  del template e non da deduzioni nominali. Aggiunto
  `tests/lotto-j-vsg-structured-coverage.test.js`, con casi vuoto, solo S,
  solo G, S+G, V completa, insalata e composizione mista. Superati test
  dedicato, realizzazioni atomiche, conversioni approvate e test Lotto J
  precedenti. La generazione settimanale ha riprodotto l'intermittenza già
  nota sul solo controllo di avanzamento ed è poi passata isolatamente; il
  piano generato non ha evidenziato regressioni. Nessuna pipeline, soglia,
  redistribuzione, Roll o UI è stata modificata. Commit remoto: commit di
  chiusura contenente questa registrazione.
- **Blocco 5 — pipeline P -> C -> V:** riorganizzata la costruzione delle
  basi in `costruisciPastoAQuery`. Il pool viene formato e ordinato a partire
  dalla proteina assegnata; soltanto dopo viene applicato il carboidrato
  programmato con il relativo `S`. Le ricette P+C dichiarate restano
  candidate, ma condividono lo stesso ordinamento delle proteine separate e
  non ricevono più precedenza per il solo fatto di essere combinate. Il
  completamento V continua ad avvenire dopo la base P/C e conserva tutti i
  filtri esistenti. Estratto l'helper puro
  `componiBasiProteinaCarboidrato` e aggiunto
  `tests/lotto-j-vsg-pipeline-order.test.js`. Superati test dedicato,
  copertura strutturata, generazione settimanale, realizzazioni atomiche e
  stress/migrazioni. Batteria completa: 18 suite su 19 superate; resta
  esclusivamente il test Lotto C già noto con firma obsoleta. Soglia,
  redistribuzione, snapshot, Roll, Salvafrigo e UI non sono stati modificati.
  Commit remoto: commit di chiusura contenente questa registrazione.
- **Blocco 6 — soglia e redistribuzione:** applicata la regola operativa
  dichiarata da Cwe in entrambi i percorsi di costruzione del pasto.
  `V_residuo >= 50 g` aggiunge una vera `V` ridimensionata esattamente sulla
  differenza; `0 < V_residuo < 50 g` non aggiunge `V` e divide il residuo a
  metà fra `S` e `G`, presenti entrambi per costruzione. Non è stato creato
  alcun percorso per un solo token sotto soglia; tale ingresso è protetto
  come violazione dell'invariante nel punto che applica la redistribuzione.
  Le modifiche sono eseguite su copie delle ricette concrete e ricalcolano i
  nutrienti, senza mutare i template. Aggiunto
  `tests/lotto-j-vsg-threshold.test.js`; aggiornati contratto e specifica per
  eliminare il caso ipotetico non operativo. Superati test soglia, contratto,
  semantica, copertura strutturata, realizzazioni atomiche, generazione
  settimanale e stress/migrazioni. Resta l'intermittenza già nota del solo
  callback di avanzamento in esecuzioni ripetute. Commit remoto: commit di
  chiusura contenente questa registrazione.
- **Blocco 7 — snapshot e propagazione:** lo snapshot di ogni realizzazione
  conserva ora ruolo `V/S/G`, quantità effettive, nutrienti ricalcolati e i
  metadati di residuo o redistribuzione. Il pasto salva anche il proprio
  `bilancioVerdura`; lo stesso bilancio viene congelato nello storico di
  consumo. La rimaterializzazione dei condimenti preserva gli override
  quantitativi invece di ricadere sulle dosi del template. Nutrizione,
  inventario e spesa continuano a leggere `ingredientiEffettivi` e
  `nutrientiEffettivi` tramite la realizzazione materializzata; non è stata
  creata una seconda fonte quantitativa. Aggiunto
  `tests/lotto-j-vsg-atomic-snapshot.test.js`. Superati test dedicato,
  realizzazioni atomiche, generazione settimanale, stress/migrazioni e
  contratto PWA. Batteria completa: 20 suite su 21 superate; resta il test
  Lotto C già noto con firma obsoleta. Roll e Salvafrigo non sono stati
  modificati in questo blocco. Commit remoto: commit di chiusura contenente
  questa registrazione.
- **Blocco 8 — Roll, Salvafrigo e rigenerazione:** confermata e resa
  verificabile la pipeline comune. Dopo ogni Roll C o P,
  `normalizzaRealizzazioniVerdura` rimaterializza le realizzazioni e riapplica
  lo stesso calcolo di soglia: cambiare C ricalcola `S`, cambiare P ricalcola
  `G`, quindi contorno o redistribuzione vengono aggiornati atomicamente.
  Roll V continua ad accettare soltanto ricette con vera classe `V`. Il pasto
  restituito dal Roll salva il nuovo `bilancioVerdura`. Rigenerazione e
  Salvafrigo condividono `generaCandidatiPasto`; Salvafrigo aggiunge soltanto
  la priorità inventario e conserva realizzazioni e bilancio del programmato
  originale. Aggiunto `tests/lotto-j-vsg-roll-salvafrigo.test.js`.
  Superati test dedicato, generazione settimanale, realizzazioni atomiche e
  stress/migrazioni. Nessuna modifica UI in questo blocco. Commit remoto:
  commit di chiusura contenente questa registrazione.
- **Blocco 9 — rendering:** Pasto e Programmazione usano ora la stessa
  proiezione a tre righe esatte. La riga C mostra l'ingrediente carboidrato e
  l'eventuale quota `S`; la riga P mostra la proteina e l'eventuale quota
  `G`; la riga V mostra contenuto soltanto quando la realizzazione possiede
  una vera classe `V`. Rimossi dall'interfaccia gli ultimi controlli su
  `V-`. Il riepilogo settimanale non crea più una riga per ogni realizzazione
  e non ripete l'intero nome del piatto in ogni macrocategoria: aggrega invece
  i componenti nelle sole righe C/P/V. Aggiunto
  `tests/lotto-j-vsg-rendering.test.js`. Superati test dedicato, contratto UI
  delle realizzazioni, contratto PWA e test Roll/Salvafrigo. Nessuna modifica
  al motore o ai cataloghi in questo blocco. Commit remoto: commit di chiusura
  contenente questa registrazione.
- **Blocco 10 — stress, browser reale e chiusura:** aggiunto
  `tests/lotto-j-vsg-stress.test.js` ed eseguite 25 generazioni complete, per
  350 pasti: tutti gli snapshot hanno quantità e nutrienti, nessun token
  `V-`, `bilancioVerdura.coperturaCompleta=true` e residuo zero anche dopo
  rimaterializzazione. Riallineato il test Lotto C alla firma corrente di
  `creaSequenzaCarboidrati` e alla classe `C+S`, eliminando l'unico errore
  storico della batteria. Il test settimanale controlla ora l'ultima sequenza
  completa 1 -> 14, senza confondere gli avanzamenti dei retry interni con
  un singolo tentativo. Esito complessivo: 24 suite su 24 superate;
  sintassi JS, JSON e `git diff --check` superati.

  Il browser cloud non ha potuto aprire il server locale
  `http://127.0.0.1:4173/` (`ERR_BLOCKED_BY_CLIENT`). È stata quindi verificata
  in sola lettura la build GitHub Pages corrispondente al Blocco 9: asset V/S/G
  correnti presenti e nessun controllo UI su `V-`. In modalità locale sono
  stati verificati generazione con inventario vuoto, salvataggio, persistenza
  del menù dopo ricarica e nuovo ingresso locale, tre righe C/P/V, Roll C
  reale (`Pasta corta` -> `Pasta integrale`) senza variazioni di P e V, e
  Salvafrigo senza errori. I soli errori console provenivano dall'estensione
  del browser cloud, non dall'app. Non essendo disponibile il ridimensionamento
  del viewport cloud, la verifica responsive Android resta un gate distinto e
  non viene dichiarata eseguita. Il flusso di sviluppo V/S/G in dieci blocchi
  è concluso. Commit remoto: commit finale contenente questa registrazione.
- **Intervento successivo — consumo automatico fuori dalla bozza Menù:** in
  `renderMenuSettimanale` la chiamata a `elaboraConsumoAutomatico` viene ora
  eseguita con `menuDraft` temporaneamente impostata a `null` e ripristinata in
  un blocco `finally`. Le operazioni `put` e `delKey` sullo store `piano` non
  possono quindi essere intercettate da `menuDraftIntercetta`: un pasto
  scaduto passa immediatamente a consumato nel piano committato anche quando
  l'elaborazione parte dalla vista Menù. Aggiunto
  `tests/menu-consumo-automatico-store-reale.test.js`; batteria completa:
  25/25 test superati. Nessuna modifica al motore o ai cataloghi.
- **Intervento successivo — generazione settimanale sequenziale a layer:**
  rimosso dal percorso runtime di `generaPianoSettimana` il preassemblaggio
  globale delle sequenze proteiche e dei riabbinamenti C/P. Ogni slot viene
  ora chiuso nell'ordine P/G -> C/S -> V; tabella completa e celle parziali
  dell'utente sono vincolanti, mentre soltanto le celle assenti sono estratte
  casualmente. Contatori, budget e stack di rotazione avanzano esclusivamente
  dopo l'accettazione del pasto. Il vincolo giornaliero considera tutte le
  macro proteiche concrete della ricetta, impedendo casi come Taleggio in una
  ricetta mista seguito da un altro formaggio a cena. Se il profilo non offre
  una seconda macro ammessa, la ripetizione necessaria resta consentita senza
  violare il profilo. La scelta finale privilegia sempre i candidati con il
  minor riuso delle chiavi di rotazione già collocate. Dopo l'assegnazione del
  condimento lo snapshot V/S/G viene normalizzato e validato prima di entrare
  nel buffer atomico. Aggiunto `tests/menu-layer-sequenziale.test.js`, con
  tabella completa, parziale e assente e verifica delle macro effettive nei
  due pasti giornalieri. Scartate a monte le basi che presenterebbero un
  residuo sotto 50 g senza entrambi `S` e `G`, mantenendo l'invariante già
  dichiarata. Batteria completa: 26/26 suite superate; stress V/S/G: 25
  settimane e 350 pasti completi; sintassi e `git diff --check` superati.
