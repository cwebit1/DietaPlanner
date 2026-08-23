# AUDIT DIETAPLANNER — STATO LAVORO (documento indice)

> **Leggere questo file per primo**, prima di qualunque intervento sul codice.
> Se stai leggendo questo file da una chat nuova: qui trovi cosa è stato
> verificato, cosa è confermato come anomalia reale, cosa è ancora da
> testare, e — per ogni punto — cosa NON toccare/rompere se si interviene.
> Nessuna riga di codice dell'app è stata modificata finora: questo è un
> lavoro di **sola analisi**, su richiesta esplicita di Cwe ("non fare
> coding", "non prendere iniziative").

Data avvio audit: 2026-08-23. Ultimo aggiornamento: 2026-08-23.
Autore: Claude (istanza di sessione chat), su commissione di Cwe.

## Metodologia (importante per riprodurre/estendere i test)

Non è un'analisi solo statica: l'app è stata **eseguita realmente** in un
browser headless (Chromium via Playwright) puntato su un server HTTP locale
che serve la cartella del repo, con un profilo persistente (IndexedDB vera,
non simulata). Questo permette di distinguere "cosa dice la documentazione
che dovrebbe succedere" da "cosa succede davvero quando si usa l'app".

- Ambiente di test: `/home/claude/DietaPlanner` (clone del repo), server
  `python3 -m http.server` sulla porta 8765, browser Chromium headless via
  Playwright con profilo persistente in `/home/claude/qa/profile`.
- Data/ora di sistema nel browser al momento dei test: **domenica 23 agosto
  2026** (coincide con la data reale della sessione).
- Stato iniziale: database fresco, primo avvio (nessun dato precedente).
  Ricette v11 e ingredienti v6 importati automaticamente al primo carico
  (comportamento corretto, nessuna anomalia qui).
- Configurazione applicata durante i test (via UI, pulsanti "Completa" in
  Set): vedi dettagli in `AUDIT-ANOMALIE-UTENTE.md` §0.
- Tutti i log console del browser sono stati catturati per l'intera sessione:
  **zero errori JS non gestiti, zero richieste di rete fallite** in tutti i
  test eseguiti finora (questo è un dato positivo, non un'anomalia).
- Ogni dump di dati (configurazioni salvate, piano generato, dettaglio
  ricette) è stato estratto direttamente dalla vera IndexedDB dell'app via
  `getAll()`/`getOne()`, non ricostruito a mano — quindi è terreno, non
  un'ipotesi.

## Documenti dell'audit

| File | Contenuto |
|---|---|
| `AUDIT-STATO-LAVORO.md` (questo file) | Indice, stato generale, cosa fare dopo |
| `AUDIT-ANOMALIE-UTENTE.md` | Report 1: anomalie osservate usando l'app come utente reale (input configurato → output ottenuto) |
| `AUDIT-STRUTTURA-LOGICA.md` | Report 2: analisi funzione-per-funzione del motore (cosa dovrebbe fare vs cosa fa), con causa radice di ogni anomalia del Report 1 |
| `CLAUDE-REFERENCE.md` | Mappa tecnica generale del repo (file, DB, viste) — scritta in una sessione precedente, ancora valida |
| `REGOLE_FLUSSO_LOGICO.md` | Fonte di verità delle regole funzionali decise da Cwe (preesistente, non toccato) |

## Stato generale

**Nessuna correzione è stata applicata.** Questo è l'elenco di ciò che è
stato trovato, in attesa di valutazione e priorità da parte di Cwe.

### Confermato con evidenza diretta (riprodotto ed isolata la causa nel codice)

| ID | Titolo breve | Gravità | Dettaglio |
|---|---|---|---|
| A1/S2 | "Genera menù" non fa nulla, senza avviso, se la settimana visualizzata contiene/termina con oggi | 🔴 Alta (blocca il flusso principale) | ANOMALIE §1, STRUTTURA §2 |
| A2/S5 | Budget carboidrati settimanale (14 caselle) non rispettato nella distribuzione reale | 🔴 Alta | ANOMALIE §2, STRUTTURA §5 |
| A3/S6 | "Pasta fresca" strutturalmente invisibile, sempre etichettata "Pasta" | 🟡 Media | ANOMALIE §3, STRUTTURA §6 |
| A4/S3 | Regola "affettati → pane obbligatorio" non applicata nel codice attivo | 🔴 Alta | ANOMALIE §4, STRUTTURA §3 |
| A5/S4 | Regola "patate nel secondo → piatto unico" non applicata nel codice attivo | 🔴 Alta | ANOMALIE §5, STRUTTURA §4 |
| A6/S7 | Tetto "carne rossa/affettati/pesce grande/pesce conservato ≤1 a settimana" non rispettato entro una singola generazione | 🔴 Alta | ANOMALIE §6, STRUTTURA §7 |
| A7/S8 | Contorni fortemente ripetitivi (stesso contorno 3 giorni di fila) nonostante "cooldown verdure" configurato | 🟠 Medio-alta | ANOMALIE §7, STRUTTURA §8 |
| A8/S8 | Parametri "Cooldown", "Fonti proteiche/giorno", "Frutta" in Impostazioni Nutrizionista non hanno alcun effetto sul motore | 🟠 Medio-alta | ANOMALIE §8, STRUTTURA §8 |
| A9 | Tabella proteica "Completa" può mettere la stessa macrocategoria sia a pranzo che a cena nello stesso giorno | 🟢 Bassa | ANOMALIE §9, STRUTTURA §10 |
| A10 | Campo "Quantità" precompilato in Impostazioni Nutrizionista anche per ingredienti non limitati, senza indicare che è inattivo | 🟢 Bassa (UX/chiarezza) | ANOMALIE §10 |
| S1 | motor.js contiene funzioni duplicate (stesso nome dichiarato due volte); vince sempre l'ultima, la prima è codice morto | 🔴 Alta (causa radice di A4, A5) | STRUTTURA §1 |
| S9 | ~10 funzioni pubbliche di engine-core.js mai richiamate da nessuna parte dell'app reale | 🟡 Media (rischio manutenzione/falsa sicurezza dai test) | STRUTTURA §9 |

### Verificato e escluso (falso allarme, per trasparenza)

| Cosa sembrava | Perché non è un bug |
|---|---|
| Selettore giorni nel Piano mostrava "Maggio" invece di "Agosto" | Verificato via query diretta sul DOM (`[data-g]`): i pulsanti reali sono tutti corretti (23 ago = DomenicaAgosto, 24 ago = LunedìAgosto, ecc., con `oggi:true` sul giorno giusto). L'apparente errore veniva da un selettore CSS troppo generico nel MIO script di test, che pescava elementi non ancora scrollati nella striscia di 181 giorni. **Non è un problema dell'app.** |
| Il lucchetto sembrava perdere lo stato "bloccata" dopo una rigenerazione forzata, facendo riscrivere un pasto bloccato | Riprodotto una volta, poi **non più riproducibile** in 4 retest puliti successivi (blocco+rigenerazione nella stessa sessione, blocco+chiusura processo+riapertura+rigenerazione, sequenza identica al test originale passo-passo con checkpoint). In tutti i retest il blocco ha protetto correttamente il pasto. Il codice (`if(old&&(old.consumato||old.bloccata))continue;` in `generaPianoSettimana`, motor.js) è corretto e coerente con quanto osservato nei retest. Il singolo caso anomalo è quasi certamente un artefatto del mio ambiente di test (persistenza IndexedDB tra chiusura/riapertura del processo browser), non un bug dell'app. **Non classificato come anomalia confermata**, ma segnalato per completezza: se Cwe osserva mai un pasto bloccato che viene riscritto durante l'uso reale, vale la pena riaprire il caso con log più dettagliati. |

### Verificato, funzionante, non approfondito oltre

- **Vista "Spesa"**: dopo la generazione della settimana 24-30 agosto, la
  lista spesa risulta popolata correttamente, categorizzata per reparto
  (Carne, Pesce, Formaggi, Uova, Verdure, Carboidrati, Grassi, Proteine,
  Altro), con quantità e formato confezione per riga e pulsante "Segna come
  comprato". Non presenta errori evidenti. **Non è stata verificata la
  correttezza aritmetica esatta** (somma ingredienti per ricetta, arrotondamento
  a formato confezione, netto da inventario) — dato il numero di variabili in
  gioco meriterebbe un audit dedicato a parte se Cwe lo ritiene prioritario.
  La settimana 17-23 (senza pranzo/cena, per l'anomalia A1) mostra
  correttamente solo l'ingrediente della colazione, coerente con quanto
  già sappiamo.

### Verificato — profilo dieta vegetariano/vegano (nuovo)

Cambio profilo testato dal vivo (selezione in UI + salvataggio +
rigenerazione reale di settimane pulite):

- **Vegano**: generazione riuscita (14/14, 0 errori), nessuna fuga di
  carne/pesce/formaggi/uova — l'esclusione funziona. **Nota di design da
  confermare con Cwe, non un bug**: per costruzione (`adattaConfigProfilo`
  in motor.js) il profilo vegano forza `legumi` a `target:14`, cioè
  **tutti e 14 gli slot della settimana risultano macrocategoria
  "legumi"**, sempre, senza eccezioni — la varietà nella settimana generata
  arriva solo dalla ricetta specifica (tofu, ceci, lenticchie, fagioli,
  ecc. — su questo la varietà osservata è comunque buona, 13 nomi diversi
  su 14 pasti). Vale la pena chiedere a Cwe se è il comportamento voluto o
  se in futuro si vuole introdotta più struttura (es. sotto-categorie
  dentro "legumi" per distinguere legumi-da-zuppa da legumi-con-cereali,
  tofu, ecc., set già presenti come SOTTOTIPI_MOTORE ma con `legumi` che
  oggi ha un solo sottotipo unico: `legumi`).
- **Vegetariano**: generazione riuscita (14/14, 0 errori), distribuzione
  osservata legumi 6 / formaggi 5 / uova 3 — coerente con i target
  hardcoded per questo profilo (`min:5,target:6` legumi;
  `min:3,max:6,target:5` formaggi; `min:2,max:4,target:3` uova). Nessuna
  fuga di carne/pesce. **Nessuna anomalia trovata qui.**

### Ancora da testare (non toccato in questa sessione — vedi "Prossimi passi")

- Marcatura manuale "pasto consumato" ed effetto su inventario/storico.
- Roll manuale di un componente del pasto (sostituzione proteina/carbo/contorno).
- Effetto reale di "verdure preferite", "verdure disattivate", "verdura
  ricorrente" sulla selezione contorni.
- Contenuto/varietà delle 7 colazioni generate automaticamente per la
  settimana (creato con successo, non ispezionato nel dettaglio).
- Comportamento con inventario azzerato ("Reset frigo") — verificare che
  "tutti i piatti sono estraibili a prescindere da inventario" (regola §3
  di REGOLE_FLUSSO_LOGICO) sia rispettata anche nel codice attivo.
- Ricette "solo manuali" — verificare il bypass criteri.
- Pasto speciale (limite settimanale, comportamento).
- Verifica aritmetica dettagliata della lista Spesa (vedi sopra).
- Chiarire con Cwe se "100% legumi" per il profilo vegano è voluto (vedi
  sopra) — non è un bug, ma una domanda di prodotto aperta.

## Prossimi passi consigliati (in ordine di priorità suggerito)

1. Cwe valuta l'elenco "Confermato" e decide priorità/quali correggere.
2. Per ogni correzione: **rileggere la sezione corrispondente di
   `AUDIT-STRUTTURA-LOGICA.md`** (contiene già causa radice, file e riga, e
   le "peculiarità da rispettare" per non rompere altro) prima di scrivere
   codice.
3. Completare i test ancora aperti elencati sopra, stessa metodologia
   (browser reale, non solo lettura del codice), possibilmente PRIMA di
   correggere qualunque cosa — per avere un quadro completo invece di
   rincorrere bug uno alla volta.
4. Nessuna correzione va fatta senza autorizzazione esplicita di Cwe per il
   singolo intervento (regola già in `AGENTS.md`).
