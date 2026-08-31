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

### Cosa resta fuori scope (deliberatamente rimandato)

- **Editor manuale del singolo pasto** ("finestra pasto": `renderContenutoAlternativaCompleta`, `componiSecondoContorno`, `scegliComponentiSecondo`, draft primo/secondo/contorno) — Cwe ha esplicitamente rimandato questa parte più volte ("la vediamo dopo, di là è più facile").
- Struttura `varianti` per Condimenti multi-sugo (`preposizione`, `quotaVerduraGrammi`, `carboidratiCompatibili`) — progettata, non ancora popolata. **Nota:** il campo `composizioni` già presente nei dati (es. ricetta id 43, 9 carboidrati × 8 composizioni verdura) implementa concettualmente la stessa cosa — da riusare/estendere, non reinventare.
- Sezioni 17-20 di `REGOLE_FLUSSO_LOGICO.md` (redesign pagina Menù, Configurazione avanzata, allergeni UE, bug modal tastiera) — decise ma mai implementate, non ancora lette per intero.
- Test end-to-end reale su dispositivo/browser — nulla del lavoro sopra è stato verificato su IndexedDB vero, solo in isolamento dove possibile.

## 4. Bug trovati e corretti durante l'audit

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

## 5. Lezione appresa — verificare la raggiungibilità fino in fondo

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

## 6. Metodo di lavoro (istruzioni permanenti di Cwe)

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
