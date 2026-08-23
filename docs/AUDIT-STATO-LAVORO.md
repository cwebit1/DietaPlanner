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

Correzioni applicate finora: **1 (A1)**. Le altre restano com'erano,
in attesa di valutazione e priorità da parte di Cwe.

## Correzioni applicate

### A1 — "Genera menù" silenzioso — RISOLTO (commit `22fe067`, motor.js)

**Cosa è cambiato:** in `generaPianoSettimana` (motor.js), calcolato un
flag `nessunGiornoFuturo` (vero quando NESSUN giorno della settimana
richiesta supera `automaticDayAllowed`). Se vero, e non ci sono altri
errori da segnalare, viene mostrato un avviso esplicito ("Questa settimana
non ha giorni futuri da generare: passa alla settimana successiva.")
invece del silenzio totale. Il risultato della funzione ora include anche
questo flag (`{generati, errori, griglia, nessunGiornoFuturo}`).

**Cosa NON è cambiato:** la regola "giorno > oggi" resta identica; il
pulsante "Rigenera" in Menù (già protetto da un controllo suo proprio) non
è stato toccato; nessuna modifica alla logica di generazione vera e
propria.

**Verificato dal vivo (Playwright, profilo pulito) prima del push:**
- Click su "Genera menù" con la settimana corrente priva di giorni futuri
  → compare correttamente il modale con il nuovo messaggio.
- Generazione sulla settimana successiva (tutti giorni futuri) → invariata:
  14/14 generati, 0 errori, nessun avviso spurio, `nessunGiornoFuturo:false`.

**File toccati:** `motor.js` (la funzione), `index.html` (solo bump
`motor.js?v=84`→`?v=85` per invalidare la cache browser, nessuna riga di
logica toccata in index.html).

### A12 — Rename base cereali per il futuro sistema "carboidrati compatibili
a sughi" — PRONTO, NON ANCORA PUBBLICATO (in attesa di token GitHub)

**Contesto:** primo passo di un lavoro più ampio (vedi "Lavoro prioritario"
sotto) per permettere a un condimento/sugo di essere abbinato a più
cereali diversi invece di uno fisso. Prima di poterlo fare serviva
sistemare i nomi degli ingredienti cereale di base, alcuni condivisi
impropriamente tra usi diversi.

**Rename applicati (decisi da Cwe):**
- "Riso Arborio" → **"Riso Originario"**
- "Pane fresco" → **"Panino"** ("Pane integrale" lasciato invariato)
- "Gnocchi di patate" → **"Gnocchi"**

**File toccati:**
- `ingredienti.json`: chiavi rinominate (versione 6→7)
- `ricette.json`: aggiornati i riferimenti negli ingredienti di 24 ricette
  (Riso Arborio), 28 ricette (Pane fresco), 2 ricette (Gnocchi di patate)
  (versione 11→12)
- `index.html`: `CARBOIDRATI_PASTO` (riso/pane/gnocchi), più altri 5 punti
  trovati con una verifica case-insensitive completa (non ovvi a un primo
  giro): seed iniziale DB (`seedIfEmpty`), tabella tag colazione
  (`TAG_COLAZIONE`), tabella categorizzazione (`CATEGORIA_ALIMENTI`,
  chiave minuscola), tabella legacy `CEREALI_PRIMI` (motore autonomo primi,
  probabilmente dead code ma sistemata comunque per non lasciare
  riferimenti rotti), controllo bruschette/friselle (`nomeLibero==='Pane
  fresco'`), nomi combo colazione ("Pane fresco e marmellata" → "Panino e
  marmellata", ecc., 6 combo).

**Verificato:** `git diff` pulito (3 file, 136 righe +/-), zero riferimenti
residui ai 3 nomi vecchi in nessuno dei 5 file del repo (`grep`
case-insensitive), sintassi JSON valida su entrambi i file dati, sintassi
JS valida sul blocco script inline di `index.html`.

**⚠️ Costo operativo per Cwe, non evitabile:** il match ingrediente↔DB è
per nome, non per id fisso — al prossimo aggiornamento dati sul
dispositivo, i 3 nomi nuovi verranno creati come ingredienti **nuovi**
nell'IndexedDB locale; i vecchi ("Riso Arborio"/"Pane fresco"/"Gnocchi di
patate") restano come voci orfane con l'eventuale scorta inventario che
avevano — Cwe dovrà reinserire manualmente quella scorta sotto i nomi
nuovi, una tantum.

**NON ancora pubblicato:** manca il token GitHub per il push (richiesto
ogni sessione, mai salvato).

### Confermato con evidenza diretta (riprodotto ed isolata la causa nel codice)

| ID | Titolo breve | Gravità | Dettaglio |
|---|---|---|---|
| ~~A1/S2~~ | ~~"Genera menù" non fa nulla, senza avviso, se la settimana visualizzata contiene/termina con oggi~~ | ✅ **RISOLTO** (commit `22fe067`) | ANOMALIE §1, STRUTTURA §2 |
| A2/S5 | Budget carboidrati settimanale (14 caselle) non rispettato nella distribuzione reale | 🔴 Alta | ANOMALIE §2, STRUTTURA §5 |
| A3/S6 | "Pasta fresca" strutturalmente invisibile, sempre etichettata "Pasta" | 🟡 Media | ANOMALIE §3, STRUTTURA §6 |
| A4/S3 | Regola "affettati → pane obbligatorio" non applicata nel codice attivo | 🔴 Alta | ANOMALIE §4, STRUTTURA §3 |
| A5/S4 | Regola "patate nel secondo → piatto unico" non applicata nel codice attivo | 🔴 Alta | ANOMALIE §5, STRUTTURA §4 |
| A6/S7 | Tetto "carne rossa/affettati/pesce grande/pesce conservato ≤1 a settimana" non rispettato entro una singola generazione | 🔴 Alta | ANOMALIE §6, STRUTTURA §7 |
| A7/S11 | Contorni fortemente ripetitivi (stesso contorno fino al 100% delle occasioni) — causa isolata con precisione: il filtro "verdura fresca prioritaria" collassa a un solo candidato quando le alternative dello stesso livello scarseggiano | 🟠 Medio-alta | ANOMALIE §7, STRUTTURA §11 |
| A8/S8 | Parametri "Cooldown", "Fonti proteiche/giorno", "Frutta" in Impostazioni Nutrizionista non hanno alcun effetto sul motore | 🟠 Medio-alta | ANOMALIE §8, STRUTTURA §8 |
| A9 | Tabella proteica "Completa" può mettere la stessa macrocategoria sia a pranzo che a cena nello stesso giorno | 🟢 Bassa | ANOMALIE §9, STRUTTURA §13 |
| A10 | Campo "Quantità" precompilato in Impostazioni Nutrizionista anche per ingredienti non limitati, senza indicare che è inattivo | 🟢 Bassa (UX/chiarezza) | ANOMALIE §10 |
| A11/S12 | Scadenza pranzo/cena mostrata in Impostazioni (15:00/22:00) diversa da quella realmente applicata (14:00/20:00) | 🟠 Medio-alta | ANOMALIE §11, STRUTTURA §12 |
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

### Verificato in questa sessione (nuovo)

- **Marcatura consumo automatico + scalo inventario**: verificato dal vivo
  con orari reali — funziona e l'aritmetica di scalo è esatta. Trovata
  però un'anomalia nuova: la scadenza mostrata/modificabile in
  Impostazioni (15:00/22:00) **non corrisponde** a quella realmente
  applicata (14:00/20:00, costante fissa indipendente). Vedi A11.
- **Verdure disattivate**: funziona correttamente (0 fughe su 13
  occasioni testate). Il test ha però isolato con precisione la causa
  radice di A7 (contorni ripetitivi) — vedi STRUTTURA §11: il filtro
  "verdura fresca prioritaria" collassa a un solo candidato quando le
  alternative dello stesso livello scarseggiano di scorta o vengono
  escluse, arrivando fino al 100% di ripetizione in un test dedicato.
- **Colazioni**: varietà accettabile su carboidrato/topping, ma diversi
  giorni della settimana testata risultano senza alcuna fonte proteica
  (né latte né yogurt) — nessuna regola trovata in REGOLE_FLUSSO_LOGICO
  che imponga una proteina ogni giorno, quindi non classificato come bug,
  solo annotato come osservazione per Cwe.
- **Reset frigo**: confermato — generazione di una settimana completa
  riuscita (14/14) anche con inventario totalmente azzerato, coerente con
  la regola "tutti i piatti sono estraibili a prescindere da inventario".
- **Ricette "solo manuali"**: bypass criteri confermato — esclusa da ogni
  generazione automatica, ma resta trovabile in ricerca manuale.

### Non completato (limiti di complessità UI o servono chiarimenti da Cwe)

- Roll manuale di un componente del pasto: legato a uno stato editor UI
  complesso (`draft`), solo letto staticamente nel codice.
- Limite settimanale "pasto speciale": trovato un controllo nel codice ma
  non confermato con certezza che sia l'unico punto che scrive
  `modalitaSpeciale` — da testare dal vivo con un'interazione UI guidata.
- Verifica aritmetica dettagliata della lista Spesa (arrotondamento a
  formato confezione, netto da inventario) — vista confermata funzionale
  a colpo d'occhio, non verificata voce per voce.
- Chiarire con Cwe se "100% legumi" per il profilo vegano è voluto (vedi
  sopra) — non è un bug, ma una domanda di prodotto aperta.
- Chiarire con Cwe se gli orari fissi "Enrico" (`FASCE_ORARIE_PASTO`,
  pranzo 12-14/cena 18-20) sono ancora un vincolo esterno valido, dato che
  il campo "Scadenza" in Configurazione avanzata promette (senza
  mantenerlo) un controllo diverso — vedi A11.
- Chiarire con Cwe la soglia/criterio con cui ammorbidire il filtro
  "verdura fresca prioritaria" di STRUTTURA §11, che oggi collassa a un
  solo candidato troppo facilmente.

## Metodologia e istruzioni di lavoro

> **Vedi anche `METODOLOGIA-LAVORO.md`** — raccoglie le regole di lavoro
> che Cwe ha dato durante le sessioni di correzione (dopo l'audit
> iniziale): ottimizzare-ma-segnalare-sempre, sincronia dati↔logica,
> riconoscere i piatti già completi P+C senza forzare un primo sopra, nome
> ricetta coerente con la sigla matematica. Da leggere sempre prima di
> proporre o applicare una correzione.

## Lavoro prioritario in corso ADESSO (non ancora applicato — riprendere da qui)

**Punto attivo: revisione e adeguamento standardizzato di TUTTE le ricette
al sistema di copertura matematico C / V / PC / PP / PF / PU / PL, più
correzione dei nomi ricetta incoerenti con la sigla.**

Questo è il lavoro prioritario **in sé**, non un dettaglio dentro un altro
task. È nato mentre si analizzava A4+A5, ma lo scope reale è più ampio: lo
`ricette.json` attuale è — parole di Cwe — **"un mix di più versioni mai
standardizzato ad una sola"**, e l'obiettivo è renderlo un sistema
matematico coerente, dove:
- la sigla `copertura` di ogni ricetta riflette esattamente e per intero
  cosa la ricetta copre davvero (nessun carboidrato "nascosto" senza C,
  nessuna verdura sotto soglia contata come V, nessuna proteina persa);
- il **nome** della ricetta non promette mai più di quanto la sigla
  riconosce (niente "... con verdure" se la verdura reale non raggiunge la
  soglia V) — vedi regole 3 e 4 di `METODOLOGIA-LAVORO.md`.

**A4 e A5 (le due anomalie originarie) restano il motivo per cui si è
aperto questo lavoro, e la parte di codice che le riguarda (regola
affettati→pane, regola patate→piatto unico) va scritta DOPO aver
completato/consolidato questa revisione dati**, non prima — altrimenti si
rischia di scrivere codice sulla base di dati ancora incoerenti.

### Cosa è già stato fatto in questa direzione (analisi, non ancora applicato)

Un primo confronto sistematico sigla-salvata vs sigla-ricalcolata dagli
ingredienti reali (`E.coverageForRecipe`, forzando il ricalcolo — vedi
`AUDIT-STRUTTURA-LOGICA.md` per il dettaglio del metodo, che ha anche
scoperto un bug nella funzione di ricalcolo stessa, dead code su nomi
ingrediente in formato oggetto) ha già isolato un primo gruppo di **15
ricette su 326** con sigla da correggere (manca C, o nome incoerente con
la V reale). Elenco completo, con i nomi già decisi da Cwe, più sotto in
questa sezione. Questo primo gruppo **non è ancora stato applicato a
`ricette.json`**.

### Cosa manca per completare la revisione (non ancora fatto)

Il controllo finora è stato **mirato** (patate, affettati, e i 38
mismatch emersi dal ricalcolo automatico) — non è ancora stata fatta una
verifica **sistematica e completa** su tutte le ~326 ricette, in
particolare:
- Un controllo testuale nome-vs-sigla su tutte le ricette (non solo quelle
  capitate nell'analisi mirata) per trovare altri casi come "hamburger al
  pane"/"con verdure" fuorvianti.
- Estendere il controllo sigla anche alle ricette di colazione e spuntino
  (finora il confronto ha riguardato solo pranzo/cena: unico/primo/
  secondo/contorno/modulare).
- Decidere il caso delle 6 ricette "impanate/gratinate" (pangrattato conta
  come C oppure no — lasciate fuori dal primo giro in attesa di risposta
  di Cwe, vedi sotto).

### Le 15 correzioni già decise da Cwe (primo gruppo, pronte per essere applicate)

**Rinomina + aggiunta C (4 ricette "hamburger al pane" — nome scorretto in
italiano + copertura incompleta + nome che promette una V inesistente):**
- "Hamburger di suino al pane" → **"Panino con hamburger di suino"**
- "Hamburger di pollo al pane con verdure" → **"Panino con hamburger di
  pollo"** (tolto "e verdure": la verdura reale [insalata 40g + peperoni
  50g] non raggiunge la soglia V — resta come ingrediente per il conteggio
  nutrienti, ma il nome non deve promettere una copertura che la sigla non
  riconosce)
- "Hamburger di tacchino al pane integrale" → **"Panino integrale con
  hamburger di tacchino"**
- "Hamburger di vitello al pane con radicchio" → **"Panino con hamburger
  di vitello"** (tolto "e radicchio", stesso motivo: 40g sotto soglia)

**Solo aggiunta C, nome già corretto (11 ricette):**
- 8 con patate 150g: Branzino al forno con patate, Sovracosce di pollo al
  forno con patate, Costine di maiale con patate al forno, Hamburger di
  suino/pollo/vitello alla piastra/al forno con patate (×3), Seppie in
  umido con patate, Insalata di polpo e patate.
- Cous cous con sovracosce di pollo, Zuppa cereali e legumi in brodo,
  Friselle con pomodori/cetrioli/fagioli cannellini, Lasagna di verdure
  con besciamella (quest'ultima ha già V corretta, 200g zucchine+melanzane
  — resta C+PF+V).

**Verificato**: nessuno di questi nomi è referenziato altrove nel codice
(le ricette si agganciano sempre per `id`), rinominare è sicuro.

**Lasciate esplicitamente fuori dal primo giro** (in attesa di decisione
di Cwe): 6 ricette "impanate/gratinate" (Provola impanata, Tomini in
carrozza, Cotoletta di pollo con emmental, Scaloppine al taleggio, Alici
gratinate al forno, Sardine al forno con pangrattato) — il pangrattato non
è stato considerato una vera porzione di carboidrato, quindi non gli si è
aggiunto C, ma non è una decisione definitiva.

### Prossimo passo appena si riprende

1. Decidere con Cwe se completare prima la verifica sistematica
   nome-vs-sigla su tutte le ~326 ricette (compresi colazione/spuntino) —
   oppure applicare subito le 15 già pronte e proseguire la revisione a
   seguire. **Nota 23/8: la classificazione/revisione delle ricette la fa
   Cwe direttamente con l'editor HTML (vedi sezione "Editor ricette"
   sotto) — questo punto non è più in carico a Claude.**
2. Applicare le correzioni a `ricette.json` (bump versione — **attenzione:
   la versione è già passata da 11 a 12 il 23/8 per il rename cereali
   [A12], non per queste 15 correzioni: se/quando queste verranno
   applicate, il prossimo bump sarà 12→13**).
3. Solo dopo: scrivere il codice per A4 (regola affettati→pane, nel punto
   dove si cerca il carboidrato mancante — non serve toccare ricette.json
   per questa parte, i 4 piatti "affettati" composti restano com'erano) e
   A5 (caso runtime "patate nel secondo → non cercare un contorno", la V
   non è rappresentabile nella sigla statica per patate — vedi STRUTTURA
   §4).
4. Verificare dal vivo, `git diff`, commit, push, aggiornare questi
   documenti.


## Stato: prima passata di audit completa

Con questa sessione si chiude una prima passata comprensiva. Il nucleo
duro — le 11 anomalie A1-A11 con causa radice isolata in
`AUDIT-STRUTTURA-LOGICA.md` §1-§13 — è la base solida su cui Cwe può
decidere le priorità di correzione. Restano 5 punti minori sopra elencati
che richiedono o un'interazione UI più complessa da guidare dal vivo, o
una decisione di prodotto da parte di Cwe prima di poter essere chiusi.

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

## Editor ricette (`tools/editor-ricette.html`, nel repo)

Cwe usa un file HTML standalone per la classificazione/revisione delle 326
ricette: nome editabile, chip cliccabili per la sigla di copertura (PC/PP/
PF/PU/PL/C/V), checkbox elimina. Legge/scrive `ricette.json` **direttamente
su GitHub** via Contents API (token incollato a mano nel tool, mai salvato,
richiesto ogni volta che lo si apre — separato dal token che serve a
Claude per i push). Bump automatico versione ad ogni salvataggio. La
classificazione/revisione ricetta-per-ricetta è **in carico a Cwe**, non a
Claude. Il file va aperto scaricato in un browser vero (non nell'anteprima
file dell'app Claude, che sandboxa le richieste di rete verso api.github.com).

## Lavoro pianificato — "carboidrati compatibili a sughi" (elaborato,
non ancora iniziato oltre al rename base — vedi A12 sopra)

Obiettivo: un condimento/sugo (es. "ai piselli") possa essere abbinato a
più cereali diversi invece di uno fisso, scelto in automatico (rotazione)
o dall'utente, con budget Set rispettato e nutrizione/allergeni ricalcolati
al momento giusto invece che congelati sulla ricetta. Nasce da un'analisi
del codice attivo (motor.js, `completaRealizzazioniCopertura`): oggi, se
la ricetta-proteina scelta ha già `C` nella sigla (es. "Pasta con
zucchine" → `PC+C`), il budget cereali del Set non viene mai consultato —
il cereale scritto nella ricetta vince sempre. Root cause della stessa
famiglia di A2/S5.

**Lista base cereali (decisa da Cwe, con marcatura sugo/secondi):**

| Codice | Nome | Uso | Stato |
|---|---|---|---|
| `pastauovo` | Pasta all'uovo | sugo | da creare (nuovo ingrediente) |
| `pastaduro` | Pasta di grano duro | sugo | ⏳ decisione aperta: rinominare "Pasta corta" esistente o creare nuovo distinto? |
| `pastainteg` | Pasta integrale | sugo | esiste già, riuso diretto |
| `riso` | Riso Originario | sugo | ✅ fatto (A12) |
| `farro` | Farro Perlato | sugo | esiste già ("Farro perlato"), riuso diretto |
| `orzo` | Orzo Perlato | sugo | esiste già ("Orzo perlato"), riuso diretto |
| `couscous` | Cous Cous | sugo | esiste già ("Cous cous"), riuso diretto |
| `pane` | Panino | **secondi** (non sugo — regola affettati→pane) | ✅ fatto (A12) |
| `gnocchi` | Gnocchi | sugo | ✅ fatto (A12) |
| `ravioli` | Ravioli | sugo | ⏳ decisione aperta: rinominare "Ravioli ricotta e spinaci" esistente (genericizzandolo) o tenerlo separato e creare "Ravioli" a parte? |
| `tortelli` | Tortellini | sugo | da creare (nuovo ingrediente) |

**Verificato durante l'analisi:** tutti i 17 cereali del budget Set
(`CARBOIDRATI_PASTO`) risolvono già a un record nutrizionale/allergeni
completo in `ingredienti.json` — l'infrastruttura dati nutrizione/allergeni
esiste già, non va costruita da zero. Trovato però un buco reale: "pasta"
e "pasta_fresca" nel budget Set puntavano allo stesso record ingrediente
(nutrizione/allergeni identici, incluso mancanza di "uova" come allergene
per la pasta fresca) — da sistemare quando si decide `pastauovo`.

**Decisioni prese finora (da Cwe):**
- Le istruzioni di cottura vanno sui **dati dell'ingrediente cereale**
  (non duplicate in ogni ricetta) — schema proposto: campo
  `istruzioniCottura: {tempoMinuti, procedimento:[...]}` su ciascuno dei
  cereali "sugo". Non ancora scritto, in attesa di chiudere la lista
  cereali sopra.
- Ponte ricetta↔cereali compatibili: valori binari 0/1 per cereale su ogni
  ricetta-sugo (stesso meccanismo dei chip già nell'editor, da attivare
  quando i cereali sono pronti). Esempio dato da Cwe: "ai piselli"
  abilitato solo su riso+farro → il motore userà quel sugo solo con quei
  due cereali.
- Cooldown: il sugo/condimento va in cooldown dopo l'uso e viene escluso
  dal pasto successivo finché non scade — Cwe ha proposto di riusare
  `cooldownDays.carboidrati` (default 7gg), già presente in Impostazioni
  ma **oggi morto/senza effetto sul motore (A8/S8)** — questo lavoro lo
  renderebbe finalmente vivo.
- Criterio di scelta automatica del cereale tra i compatibili: proposto da
  Claude riuso di `E.chooseCarb` (stesso criterio già usato altrove,
  pesato su meno-usato/meno-recente) — non ancora confermato esplicitamente
  da Cwe.

**Non ancora deciso / da chiudere prima di scrivere codice:**
- `pastaduro` e `ravioli`: rinominare l'esistente o creare nuovo separato
  (vedi tabella sopra).
- Contenuto esatto di `istruzioniCottura` per ciascuno dei 7 cereali sugo
  (tempi e procedimento) — Claude ha proposto valori di massima (pasta
  ~10min, farro ~30-40min, cous cous ~5min a fuoco spento, orzo ~40-50min,
  gnocchi ~2-3min) da far rivedere a Cwe prima che vadano in produzione.
- Split del procedimento ricetta in "cottura cereale" (standard, da
  ingrediente) + "preparazione condimento" (specifico della ricetta) — non
  ancora progettato nel dettaglio.
- Nome piatto dinamico (es. "Farro con zucchine" quando il motore assegna
  farro invece di pasta) — template da definire.
- La parte di motore vera e propria (`motor.js`): sostituzione dinamica
  del cereale, ricalcolo nutrizione/allergeni, scalo inventario/spesa sul
  cereale realmente assegnato — non iniziata, dipende da tutti i punti
  sopra.

**Nota architetturale da NON perdere:** esiste già nel codice un
meccanismo simile (`sottoCategoriaModulare:'sugo'` + `carboidratiCompatibili`
+ `CARBOIDRATI_PASTO[k].haPoolSughi`), ma appartiene alla pipeline **v10
morta** (STRUTTURA §1, `componiPastoModulare` riga 66, mai eseguita a
runtime). Va integrato nella pipeline attiva (algebra di copertura v78,
`completaRealizzazioniCopertura`) senza mescolare i due modelli — rischio
già segnalato in STRUTTURA §1.
