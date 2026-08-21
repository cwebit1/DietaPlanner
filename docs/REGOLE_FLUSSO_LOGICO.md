# DIETAPLANNER — REGOLE DEL FLUSSO LOGICO (unificato)

## REGOLA OPERATIVA VINCOLANTE PER OGNI INTERVENTO

Prima di qualsiasi modifica devono essere rilette integralmente le sezioni pertinenti di questo documento. Si implementa esclusivamente quanto richiesto e autorizzato: dati, valori predefiniti, ricette, ingredienti, quantità, versioni e logiche adiacenti non si modificano senza un'istruzione esplicita. Gli esempi grafici o numerici non diventano vincoli funzionali. Se durante l'implementazione emerge una modifica ulteriore ritenuta necessaria, il lavoro su quel punto si ferma e viene chiesta autorizzazione prima di applicarla.

## CORREZIONI UI V80

- Nel Set utente non deve più comparire la sezione **“Tetti personali per ingrediente”** né devono essere eseguiti il relativo rendering o i relativi listener. La configurazione clinica degli ingredienti resta esclusivamente nella vista nutrizionista.
- All'avvio la striscia delle date della vista Piano deve essere interamente visibile sotto l'header. Il centraggio del giorno attivo deve modificare soltanto lo scorrimento orizzontale della striscia e non deve spostare verticalmente la pagina. L'eventuale posizione verticale ripristinata automaticamente dal browser viene azzerata al termine dell'avvio.

## CORREZIONE RESPONSIVE NUTRIZIONISTA V81

- La vista nutrizionista è progettata anzitutto per smartphone Android e non può produrre scorrimento orizzontale dell'intera pagina.
- La griglia della configurazione usa una classe dedicata, distinta dalla griglia del riepilogo nutrizionale giornaliero: ogni parametro occupa una sola riga a larghezza piena dentro la propria card.
- Le colonne restano `Nome | Min | Max | Quantità/Unità`, ma nome e campi numerici si ridimensionano entro la larghezza disponibile. Solo gli swipe degli ingredienti possono scorrere orizzontalmente nel proprio contenitore.
- Questa correzione è esclusivamente grafica: dati, valori, validazioni e comportamento funzionale restano invariati.

## SPECIFICA VINCOLANTE — NUOVA VISTA NUTRIZIONISTA COMPLETA

Questa sezione sostituisce la disposizione precedente della configurazione avanzata. La configurazione nutrizionista resta nello stesso `index.html`, ma diventa una vista interna autonoma: in Impostazioni compare soltanto il collegamento per aprirla; non compare nella barra di navigazione; contiene un comando per tornare a Impostazioni; in futuro il suo ingresso potrà essere protetto senza cambiare database o struttura della pagina.

### Ordine e completezza della vista

1. **Allergeni e intolleranze** come prima sezione, usando la griglia completa degli allergeni. Ogni selezione produce un'esclusione hard e reale di tutti gli ingredienti e di tutte le ricette collegate.
2. **Piani alimentari predefiniti** come seconda sezione. Onnivoro, vegetariano e vegano non sono etichette grafiche: selezionare un piano applica immediatamente e in modo coerente tutte le esclusioni e i vincoli corrispondenti anche alle tabelle e ai selettori sottostanti. Il vegetariano esclude carne e pesce; il vegano include tutte le restrizioni vegetariane ed esclude anche uova, latte/formaggi e ogni altro ingrediente di origine animale classificato nei dati. Le restrizioni del piano devono essere visibili e non aggirabili dai controlli sottostanti finché il piano resta attivo.
3. **Parametri nutrizionali globali**, compresi tutti i minimi/massimi già previsti per proteine, sottotipi, frutta, spuntini, pasti speciali e gli altri parametri realmente letti dal motore.
4. **Gestione min/max dei carboidrati complessi e dei carboidrati semplici**. I valori salvati devono essere letti dal motore e devono condizionare i corrispondenti parametri disponibili all'utente nel Set; non devono essere campi solo descrittivi.
5. **Gestione ingredienti per macrocategoria**, che sostituisce integralmente l'attuale elenco generico “Ingredienti esclusi dalla dieta”.

### Gestione ingredienti per macrocategoria

- Tre swipe distinti: **Carboidrati**, **Proteine**, **Verdure**.
- Ogni swipe contiene i selettori degli ingredienti realmente presenti nel database e appartenenti alla relativa macrocategoria.
- Ogni ingrediente ha esattamente tre stati ciclici, comandati dal selettore stesso:
  1. **Disponibile senza restrizioni**: stato normale; nessuna riga nella tabella delle restrizioni.
  2. **Limitato**: primo clic, selettore giallo; compare nella tabella sottostante una riga con nome ingrediente e celle numeriche `min` e `max`.
  3. **Escluso**: secondo clic, selettore rosso; nella stessa riga il nome resta, le celle `min/max` spariscono e vengono sostituite dalla dicitura `Escluso`.
  4. Terzo clic: ritorno a **Disponibile senza restrizioni** e rimozione completa della riga dalla tabella.
- Le restrizioni automatiche imposte dal piano alimentare devono riflettersi negli stessi swipe e nella tabella, ma devono essere distinguibili e non disattivabili manualmente finché quel piano è selezionato.
- `min`, `max` ed `Escluso` sono vincoli funzionali: devono essere salvati nel database, letti dal motore, applicati alla generazione automatica, alla ricerca manuale e ai controlli dell'utente nel Set.
- Per ogni ingrediente limitato la riga contiene **tutti e tre i parametri**: frequenza minima (`min`), frequenza massima (`max`) e quantità per singolo utilizzo (`quantità`). Non esiste un limite numerico universale imposto dall'interfaccia: i valori ammessi dipendono dal parametro e dalla configurazione nutrizionale.
- La quantità proposta inizialmente deve essere letta dal riferimento già presente in `ingredienti.json`/database (`porzione`, `pesoPorzioneGrammi`, `pesoPezzo` e `unitaPorzione`, secondo il tipo). Non si inventa un nuovo valore quando il catalogo ne possiede già uno.
- Gli alimenti configurati a pezzo devono restare a pezzo anche nella configurazione nutrizionista e nel Set: la UI mostra unità e quantità coerenti (`pz`, non grammi) e il motore converte in grammi soltanto quando serve per nutrizione/inventario usando il peso unitario configurato. Prima dell'implementazione va verificata la coerenza di tutte le voci count-based del catalogo.
- **Verifica catalogo v78**: soltanto `Uova` (`porzione:2`, `unitaPorzione:'pezzi'`) e `Friselle` (`porzione:2`, `unitaPorzione:'pezzi'`, `pesoPorzioneGrammi:50`) risultano esplicitamente count-based. Tutte le altre voci, compresa `Piadina`, mantengono esattamente l'unità e la quantità già presenti nei dati; nessun valore del catalogo viene corretto o reinterpretato senza un'istruzione esplicita. Gallette, crackers e taralli restano quindi in grammi.
- La validazione impedisce soltanto configurazioni logicamente incoerenti: `min` non può superare `max` e la quantità deve essere positiva quando la restrizione è attiva. Il riferimento `1–7` fornito da Cwe era esclusivamente un esempio grafico di numero corto, non un vincolo funzionale.

### Regole grafiche

- Tutti i dati e i controlli devono stare in `div`/card ben definiti, con griglie responsive coerenti.
- Nessuna coppia di campi sfalsata, nessuna etichetta su altezze diverse e nessun testo disallineato come nell'interfaccia precedente.
- Ogni riga `min/max` deve avere colonne stabili: nome, minimo, massimo/stato.
- Su schermi stretti la griglia deve ridursi in modo controllato senza spezzare le etichette o produrre campi di altezze differenti.
- Le tabelle delle frequenze proteiche e degli ingredienti devono essere **compatte su una sola riga per voce**, anche su smartphone: `Nome | Min | Max | Quantità/unità` (oppure `Nome | Escluso`).
- I campi `min` e `max` devono avere larghezza compatta e proporzionata al contenuto; non possono occupare mezza pagina anche quando il valore normalmente contiene poche cifre. La stessa regola vale sia nella vista nutrizionista sia nelle tabelle derivate mostrate nel Set/generatore utente.
- La riga può usare una griglia responsive con colonna nome flessibile e colonne numeriche compatte; non deve trasformarsi in due grandi colonne o in campi impilati/sfalsati come nell'interfaccia precedente.

### Propagazione obbligatoria

Ogni valore configurato nella vista nutrizionista è una sorgente di verità superiore al Set utente. Il Set deve mostrare e rispettare i limiti ricevuti: non può proporre valori, ingredienti, frequenze o piani incompatibili. Le preferenze dell'utente possono restringere ulteriormente quanto consentito, mai allargare i vincoli clinici o strutturali del nutrizionista.

## DECISIONE VINCOLANTE V78 — RICETTE COMPLETE E ALGEBRA DI COPERTURA

- Il catalogo e il motore non usano più sughi/componenti di condimento separati. Ogni primo è una ricetta completa e valida, già condita oppure legittimamente senza condimento.
- La composizione è esclusivamente insiemistica: requisito `{proteina richiesta, C, V}` meno la `copertura` già fornita (`PC`, `PP`, `PF`, `PU`, `PL`, `C`, `V`). Il motore aggiunge soltanto gli elementi mancanti.
- Il nome della ricetta non viene mai interpretato per decidere ingredienti, coperture o cotture. Non sono ammesse euristiche testuali o eccezioni nominali.
- Una ricetta può possedere più celle: `PC+C` richiede soltanto `V`; `C+V` richiede soltanto la proteina prevista; `P+C+V` non riceve aggiunte.
- Il refresh è legato alla sorgente: se una ricetta copre più celle, il refresh di una delle celle sostituisce quella ricetta e ricalcola matematicamente soltanto le coperture mancanti. Le aggiunte indipendenti si cambiano senza alterare le altre sorgenti.
- Le ricette con almeno due fonti proteiche a porzione piena sono sempre `piattoSpeciale:true` e restano fuori dalla rotazione ordinaria.
- `Pizza Margherita` e `Pizza alle Verdure` sono piatti speciali con valori nutrizionali medi verificati e porzione esplicita nel catalogo.
- Tutti i piatti speciali mostrano la nutrizione a scopo informativo, ma non scalano mai l'inventario e non generano fabbisogno nella lista della spesa. La regola dipende da `piattoSpeciale`, non dal nome o da una modalità scelta.
- La UI non mostra sugo o cottura generati separatamente: fanno parte della ricetta completa. I campi legacy `primoSugoId` e `cotturaSecondo` sono soltanto migrabili e nei nuovi salvataggi valgono `null`.

## 0. SEPARAZIONE DELLE CONFIGURAZIONI E STATO VUOTO

- La vista **Menù** deve renderizzarsi normalmente anche quando piano, inventario e storico sono completamente vuoti: mostra tutti gli slot vuoti e i comandi, senza creare proposte implicite.
- Il **Set** è riservato all'utente e configura preferenze e vincoli desiderati per i menù da generare.
- **Impostazioni → Configurazione avanzata nutrizionista** è un'area distinta, per ora ad accesso libero. Contiene limiti, frequenze, quantità, profili strutturali onnivoro/vegetariano/vegano, allergie, intolleranze ed esclusioni ingredienti.
- Allergie e intolleranze, inclusi glutine e latte quando pertinenti, si selezionano dalla griglia completa degli allergeni e sono combinabili; non costituiscono profili separati.
- Le esclusioni degli ingredienti dalla dieta sono modificabili esclusivamente nell'area nutrizionista.
- I vincoli clinici e di sicurezza del nutrizionista prevalgono sempre sulle preferenze del Set e sulle scelte incompatibili dell'utente.

### Nota di unificazione
Questo file unisce la sezione "Generazione programmazione settimanale" (dettata a voce) con la "Mappa completa delle istruzioni" (documento allegato), che si sovrapponevano parlando delle stesse cose (flag proteina, flag verdura, salvafrigo, storico) con formulazioni diverse. Operazioni fatte, nessuna interpretazione oltre queste:
1. **Polarità flag/stock unificata**: 1 = disponibile/estraibile, 0 = non disponibile/escluso (come deciso). Dove il testo originale usava la polarità opposta (Mappa 2.3/2.5/4.2/4.3), i numeri sono stati invertiti per coerenza, non il significato.
2. Le 4 decisioni sulle collisioni sono applicate direttamente nel punto del testo a cui si riferiscono, non più come nota separata.
3. Nessun contenuto è stato tolto: ogni riga originale è tracciata tra parentesi con il suo riferimento (es. "ex 2.3", "ex GEN-2").

---

## 21. Presentazione di condimenti e cotture

- I simboli `+` usati nelle descrizioni funzionali indicano soltanto la composizione concettuale e **non devono essere mostrati nell'interfaccia**.
- Se il carboidrato è realizzato mediante una ricetta di primo completa, la card mostra il nome reale della ricetta (che contiene già il condimento), non la sola etichetta del cereale.
- Se il primo è composto modularmente, la card mostra carboidrato e sugo con un separatore grafico neutro (`·`). `primoSugoId` resta il riferimento del sugo modulare; una ricetta di primo completa non deve fingere di avere un sugo separato.
- Una proteina il cui nome contiene già una cottura (per esempio “alla piastra”, “al forno”, “sode” o “in frittata”) mantiene quella cottura: il motore non ne aggiunge una casuale e la UI non propone “Cambia cottura”.
- Le cotture configurabili e il relativo comando restano disponibili per le proteine generiche che non incorporano già una preparazione nel nome.

---

## 22. Vincolo dominante — composizione matematica, non eccezioni nominali

**Istruzione esplicita di Cwe:** ogni indicazione fornita durante l'analisi deve essere salvata in questo documento e consultata prima di progettare o modificare il codice. La memoria temporanea della conversazione non è una fonte sufficiente. Prima di implementare una nuova interpretazione proposta autonomamente, occorre confrontarla con queste regole e chiedere conferma; non si modifica il comportamento sulla sola base di un'idea dello sviluppatore.

### 22.1 Principio di rappresentazione

Il motore non deve ricavare struttura, cottura o condimento interpretando il testo del nome di una ricetta. Ogni proposta deve essere rappresentata mediante dimensioni indipendenti e combinabili:

1. **soggetto/base**: ingrediente o componente principale (es. pollo, tacchino, pasta, riso);
2. **realizzazione**: ricetta completa oppure componente semplice;
3. **condimento**: assente, incluso nella ricetta completa oppure componente modulare esplicito;
4. **cottura**: assente/non applicabile, inclusa e vincolata dalla ricetta completa oppure scelta da un insieme compatibile;
5. **copertura nutrizionale**: carboidrato, proteina e verdura effettivamente coperti dalla realizzazione.

Il nome è soltanto una proprietà di presentazione. Non determina le regole del motore.

### 22.2 Modello senza eccezioni

Per ogni realizzazione `r` devono essere disponibili metadati strutturati equivalenti a:

```text
r = {
  soggettoId,
  tipoRealizzazione,
  condimentoId | condimentoIncluso | nessunCondimento,
  cotturaId | cotturaInclusa | nessunaCottura,
  coperturaMacro,
  sostituzioniCompatibili
}
```

La validità di una combinazione è calcolata con regole sui campi, non con espressioni regolari sul nome e non con eccezioni dedicate a singole ricette.

### 22.3 Ricette con e senza condimento

- Una ricetta completa può dichiarare il proprio condimento come **incluso**: non riceve automaticamente un secondo sugo/condimento.
- Una realizzazione semplice può dichiarare **nessun condimento** oppure richiedere un condimento scelto da un pool compatibile.
- Il campo visualizzato deve distinguere chiaramente la ricetta completa dal componente modulare, senza inventare un `sugoId` per una ricetta che incorpora già il condimento.
- Cambiare sugo è disponibile soltanto quando la realizzazione corrente è modulare e il carboidrato ammette un pool di sughi. Non si determina questa possibilità dal nome visualizzato.

### 22.4 Sostituzione del soggetto proteico

Esempio guida: se esiste la ricetta completa “Petto di pollo al limone” e l'utente richiede tacchino, il sistema non deve né rinominare il pollo né creare un'eccezione “pollo → tacchino”. Deve operare su una trasformazione strutturata:

```text
(soggetto=pollo, realizzazione=al_limone)
→ richiesta sostituzione soggetto
→ cerca (soggetto=tacchino, realizzazione compatibile=al_limone)
```

- Se la realizzazione è dichiarata parametrica e il tacchino è tra i soggetti compatibili, viene costruita la variante valida con gli ingredienti e le quantità previsti.
- Se esiste una ricetta completa specifica equivalente, viene scelta quella.
- Se nessuna delle due condizioni è soddisfatta, quella trasformazione non appartiene al dominio valido: il motore propone un'altra realizzazione compatibile del tacchino. Non improvvisa e non altera soltanto il nome.

### 22.5 Conseguenza per lo sviluppo

Prima di cambiare il comportamento di sughi, cotture, analoghi o sostituzioni, occorre definire e validare lo schema dati necessario. Le euristiche basate sul nome possono essere usate esclusivamente in uno strumento di migrazione/revisione dati, con verifica finale, mai come regola permanente del motore.

---

## 23. Nomi ricette e storico nutrizionale consumato

- Il nome di ogni ricetta deve iniziare sempre con una lettera maiuscola. La regola appartiene ai dati: viene applicata all'importazione e a ogni salvataggio, non soltanto resa graficamente con CSS.
- Anche i nomi degli ingredienti e delle varianti — in particolare tutte le verdure — devono iniziare con una lettera maiuscola. La normalizzazione si applica al catalogo remoto, al database locale e ai nuovi inserimenti.
- Il grafico dei consumi deve usare una fotografia nutrizionale completa e immutabile registrata nel momento in cui il pasto viene consumato.
- La fotografia comprende colazione o ricetta speciale, spuntino, primo, proteina e verdura. Comprende inoltre il carboidrato modulare e l'eventuale sugo quando non esiste una ricetta composta che li rappresenti già.
- Una componente già inclusa in una ricetta completa non deve essere conteggiata una seconda volta.
- I record storici precedenti, privi della fotografia nutrizionale, restano leggibili mediante il calcolo legacy basato sugli ID ricetta.
- Modifiche future alle ricette o il reset del piano non devono cambiare retroattivamente i valori di un consumo già registrato.

---

## 24. Strategia definitiva — ricette complete e algebra della copertura

**Conferma esplicita di Cwe:** la strategia corretta è la prima soluzione matematica. Il motore non deve riconoscere dal nome cosa contiene una ricetta e non deve aggiungere componenti per poi tentare di eliminare duplicazioni. I campi `copertura` (`PC`, `PP`, `PF`, `PU`, `PL`, `C`, `V`) sono la fonte unica di verità per stabilire cosa è presente e cosa manca.

### 24.1 Operazione fondamentale

Per uno slot con macrocategoria proteica richiesta `Pₓ`:

```text
REQUISITI = {Pₓ, C, V}
PRESENTI  = copertura della ricetta scelta
MANCANTI  = REQUISITI − PRESENTI
```

Il motore aggiunge esclusivamente le celle contenute in `MANCANTI`. Non esistono controlli nominali del tipo “se il nome contiene…”.

Esempi:

- `Panino al prosciutto`, copertura `PC+C` → manca soltanto `V`; non si estrae un'altra proteina e non si aggiunge un altro carboidrato.
- `Cous cous alle verdure`, copertura `C+V` → manca soltanto la proteina della macro richiesta.
- `Provola alla piastra`, copertura `PF` → mancano `C` e `V`; la cottura fa parte della ricetta e non viene aggiunta nuovamente.
- Una ricetta `PL+C+V` è già completa → non si aggiunge nulla.

### 24.2 Unità di rotazione

Le ricette complete presenti nel catalogo sono l'unità primaria da ruotare. Sughi, cotture e componenti modulari non devono costituire un secondo motore concorrente che ricostruisce o rinomina una ricetta completa.

Se in futuro si vogliono mantenere componenti modulari, devono produrre una realizzazione strutturata con copertura dichiarata **prima** di entrare nel pool, comportandosi poi come una normale ricetta. Non devono essere assemblati tramite interpretazione del nome durante la generazione.

### 24.3 Stato di conformità rilevato

Alla verifica successiva alla v77, questa strategia risulta **non applicata integralmente** nel motore corrente:

- `parseCoverage` esiste e legge correttamente le sigle;
- `componiPastoModulare` usa `V` soltanto per evitare talvolta un contorno;
- un fallback di selezione proteica controlla `C`;
- la selezione principale non parte dalle ricette complete filtrate per `PC/PP/PF/PU/PL` e non calcola `MANCANTI = REQUISITI − PRESENTI`;
- restano attivi il percorso separato dei sughi e l'assegnazione separata delle cotture.

Questa è una mancata conformità rispetto alle regole già definite, non una nuova scelta progettuale. Prima di ulteriori correzioni puntuali occorre sostituire il percorso automatico con l'algebra della copertura descritta sopra.

---

## 1. INGREDIENTI

- Ingredienti contiene tutti gli alimenti con le loro caratteristiche e info di disponibilità.
- Niente può esistere in ricette se non esiste qui.
- Inventario e ingredienti devono coincidere: un ingrediente = una variante = una riga per zona/stato; le quantità si sommano; niente "secchi" duplicati. *(ex 5.1)*

---

## 2. ORDINE DEL MOTORE

- Per ogni pasto si sceglie **prima la proteina** (sottotipo dentro la categoria larga decisa dalla griglia settimanale). *(ex 1.1)*
- Il **carboidrato si adatta** alla proteina scelta, mai il contrario. *(ex 1.2)*
- La **verdura completa** il pasto, oppure è già dentro la ricetta. *(ex 1.3)*

---

## 3. GENERAZIONE PROGRAMMAZIONE SETTIMANALE — principio di estrazione

- Ogni pasto programmato deve essere estratto. **Tutti i piatti possono essere estratti a prescindere da inventario**: altrimenti si va contro la funzione di programmazione settimanale e lista spesa. *(ex GEN-1, confermato — decisione punto 3)*
- Stock/flag: **1 = disponibile/estraibile, 0 = non disponibile/escluso** *(polarità unificata — decisione punto 1)*. Estrarre porta il valore a 0.
- **Ogni ricetta estratta non è più estraibile quella settimana** (altrimenti si hanno ridondanze). *(ex GEN-2 + decisione punto 4)*
- Questi limiti (flag/pool) sono applicati **solo** alla funzione "genera programmazione settimanale", per pianificare un piano vario e assortito. **L'utente non ha questi limiti** quando rimodula manualmente un pasto a suo gradimento — lì valgono solo le regole di macrocategoria. *(decisione punto 4)*
- Alimenti non graditi: flag impostato a 0 (escluso), anche se hanno peso/quantità disponibile. *(ex GEN-4)*

---

## 4. PROTEINE

- Frequenze settimanali della guida: carne 1‑3, pesce 2‑3, formaggi 2‑3, uova 1‑2, legumi 2‑3+. *(ex 2.1)*
- Tetti interni: carne rossa ≤1, affettati ≤1, pesce grande ≤1, conservato ≤1; max 2 fonti proteiche al giorno. *(ex 2.2)*
- Flag: la ricetta proteica passa a **0 (non estraibile) solo quando il pasto è consumato**. Finché non è consumata, il flag resta a 1 (disponibile). *(ex 2.3, polarità corretta)*
- L'utente può **ruotare (roll) la proteina liberamente** senza consumare un "uso". *(ex 2.4)*
- Una volta consumata (flag 0) la ricetta esce dal pool: **matematicamente non può riuscire di nuovo** finché il pool non si azzera/ripristina. *(ex 2.5, polarità corretta)*
- **Regola affettati**: se l'affettato è la proteina del pasto, **sovrascrive qualunque carboidrato con Panino (pane)**. È l'unica regola dell'affettato. *(ex 2.6)*
- **Regola patate (dettata in fase di sviluppo, dopo la spec originale)**: se una ricetta proteica/secondo **contiene patate come ingrediente** (es. "Merluzzo in umido con patate"), le patate **sovrascrivono qualsiasi carboidrato già selezionato E qualsiasi verdura richiesta**. Il pasto diventa automaticamente **piatto unico** (classe `unico_completo`). Distinta dal caso "patate scelte come cereale del budget settimanale" (quella resta gestita in Sez.5): qui il trigger è la presenza di patate **dentro la ricetta del secondo**, non una scelta di budget.
- **Priorità salvafrigo dentro la generazione automatica (nuova, dettata in sviluppo)**: la scarsità fisica non esclude mai una ricetta (già stabilito, Sez.3/9 — "spesa bypassata"), ma l'**urgenza di scorte può guidare positivamente la scelta**. Prima del roll cieco (Fase 7), il pool già ammesso (macro+gradimento+stock rotazione+cap) viene controllato in quest'ordine, stessa priorità del Salvafrigo manuale (Sez.7 5.3):
  1. Ingrediente con variante in scadenza ≤2gg → priorità a quelle ricette (roll solo se più di una)
  2. Altrimenti, avanzo scomodo (quantità residua insufficiente per un'altra porzione futura) → priorità a quelle
  3. Altrimenti, freezer da smaltire → priorità a quelle
  4. Nessuna urgenza da nessuna parte → roll normale, cieco, ciclico (comportamento di oggi, invariato)

  Regola "soft", mai un'esclusione: se applicarla svuota le opzioni o non trova nulla, si ricade sempre al roll normale del punto 4.
- **Campo `richiedeCottura` (nuovo, dettato in sviluppo)**: ogni ricetta **di pranzo/cena** (`tipoPortata` unico/primo/secondo/contorno) è classificata true/false — richiede cottura o è pronta/fredda così com'è. **Colazione e spuntini sono mondi a parte, il campo non li riguarda** — non applicato lì. Serve alla logica "poco tempo" (Sez.10, già esistente in index.html come `pocoTempoPranzo`/`pocoTempoCena`): un piatto freddo è più veloce di uno cucinato, quindi quando "poco tempo" è attivo per uno slot, il pool va **preferito verso `richiedeCottura:false`** (soft, non esclusivo — se non ce ne sono di adatte si ricade sul pool cucinato normale). Compilato su 236 ricette pranzo/cena in `ricette_lavoro.json` tramite rilevamento automatico (verbi di cottura nel procedimento + parole chiave nel nome, es. "al forno"/"risotto"/"in umido") — inferenza automatica, non verificata riga per riga dall'utente.

---

## 5. CARBOIDRATI

- Budget settimanale di **14 caselle** (7 giorni × 2 pasti) deciso dall'utente. *(ex 3.1)*
- **Nessun controllo a monte** della scelta: tutti i carboidrati girano; la composizione concessa (primo reale o sugo compatibile) si cerca **dopo** la scelta. *(ex 3.2)*
- **Niente "jolly"**: pane e patate sono carboidrati normali con regole proprie. *(ex 3.3)*
- Tabella **cereale→condimenti**: ogni cereale ha i suoi condimenti; **eccezioni polenta e patate** (regole proprie, niente sugo standard). *(ex 3.4)*
- Aggiunti i condimenti **"pomodoro e basilico"** e **"pomodoro e origano"** per tutti i cereali tranne le patate. *(ex 3.5)*
- Classi dei carboidrati *(ex 3.6)*:
  - **Primo semplice** (solo carboidrato) → richiede secondo + contorno.
  - **Primo composto** (carboidrato+proteina) → il secondo mostra **"proteina compresa nel primo"**; il contorno resta richiesto.
  - **Piatto unico** (tutto in uno) → secondo **e** verdura mostrano **"compresa nel primo"**.
- **`classe` come copertura esplicita P/C/V, non solo etichetta (chiarito in sviluppo)**: ogni ricetta deve dichiarare esattamente quali componenti copre già da sola — Proteina/Carboidrato/Verdura — includendo gli effetti delle regole automatiche (affettati→pane rende una ricetta "solo P" automaticamente "P+C"; patate→tutto la rende "P+C+V"). Questo permette al motore di **ragionare sulla compatibilità invece di affidarsi al random puro**, che altrimenti può tentare abbinamenti incoerenti (es. cercare un contorno su un piatto già completo, o un cereale su un piatto che la regola patate ha già chiuso). Collegato a `richiedeCottura` (Sez.4) per la logica "poco tempo": il filtro diventa `richiedeCottura:false AND copertura≥P+C` come primo pool, prima di scomporre in pezzi separati da assemblare a mano.
- **Sigla granulare per macrocategoria proteica (ulteriore livello, dettato in sviluppo)**: la "P" della copertura non è generica, porta già la macro specifica — stesse 5 macro usate ovunque (Sez.4): **PC**=carne, **PP**=pesce, **PF**=formaggi, **PU**=uova, **PL**=legumi. Una ricetta "Farro con gamberetti" → sigla `PP+C` (pesce+carboidrato già coperti, il motore sa che serve solo cercare V). "Pasta e fagioli" → `PL+C+V` se ha già verdura sufficiente dentro, altrimenti `PL+C` e serve ancora V. Quando il Set assegna "oggi tocca legumi" a uno slot, il motore filtra direttamente sulle ricette con sigla che inizia per `PL`, senza dover riaprire e rideterminare il sottotipo ogni volta — il dato è già nella sigla.
- **Campo `copertura` calcolato su tutte le 253 ricette pranzo/cena (Lotto 0, completato)**: sigla scritta direttamente su ogni ricetta in `ricette_lavoro.json`. Regola di calcolo, **sempre basata sulle porzioni del PDF** ("il PDF è la bibbia"), non su soglie arbitrarie:
  - Soglia verdura **specifica per tipo**, non un unico numero: **70g** per l'insalata (`Insalata mista`), **200g** per tutti gli altri ortaggi — dal PDF ("1 porzione ≈ 200-250g di ortaggi o 70-80g di insalata"), usato il minimo del range.
  - Gli **aromatici** (Aglio, Basilico fresco, Peperoncino, Prezzemolo) sono sempre esclusi dal conteggio "verdura presente": si usano in quantità da condimento, non possono mai costituire la porzione verdura di un pasto, indipendentemente dalla quantità scritta.
  - **Piselli confezionati (surgelati/barattolo)**: soglia **120g** (porzione legumi cotti scatola/vetro dal PDF) per contare come PL. Sotto quella soglia non contano né come P né come V (i piselli confezionati restano esclusi da verdura per definizione PDF, a differenza dei freschi).
  - **Effetto collaterale importante da ricordare in fase di motore**: con soglie corrette (invece del vecchio criterio impreciso ≥50g flat), la maggior parte dei primi composti (es. "Pasta con zucchine e pomodorini") **non raggiunge più la soglia +V** — 100-150g di verdura mescolata in un primo non equivalgono a una porzione contorno reale. Coerente con la regola originale (Sez.6, "se la ricetta contiene già verdura sufficiente → niente contorno"): questi primi ora correttamente segnalano che serve ancora un contorno vero a fianco, invece di sembrare erroneamente "già completi".
  - **20 ricette contorno pre-esistenti corrette nelle quantità** per raggiungere la vera porzione PDF invece di restare sotto-dosate (es. "Zucchine grigliate" 100g→200g, "Insalata mista condita" 40g→70g, "Piselli in barattolo conditi"/"Piselli saltati" 100g→120g + `gruppoProteico:'legumi'`). Decisione esplicita di Cwe: il PDF è la fonte di verità sulle dosi, sempre — modifiche successive di quantità vanno fatte da Impostazioni, non lasciando ricette sotto-porzionate nel database.
- **Il pezzo C dentro una ricetta composta non è bloccato al cereale di default**: es. "Pasta con zucchine, pancetta e pomodorini" ha C=pasta di default, ma nel roll manuale (giorno per giorno o in revisione menù settimanale) l'utente può scegliere **qualsiasi carboidrato**, non solo quello con cui la ricetta è nata — coerente con il principio già stabilito (Sez.3): i vincoli del Set valgono solo per "genera menù" automatico, mai per la modifica manuale dell'utente.
- **Interscambiabilità libera dentro lo stesso sottotipo (anche da sistema, non solo da utente)**: filetto di nasello/orata/branzino sono tutti `pesce_bianco` — quando serve PP, sia l'utente che il sistema in generazione automatica possono scegliere liberamente tra loro, senza vincolo. Diverso dal caso carboidrato-in-ricetta sopra: lì il sistema deve rispettare il cereale specifico assegnato dal Set durante la generazione automatica; qui invece, dentro lo stesso sottotipo proteico, la scelta specifica è libera per entrambi — il Set vincola la macro/sottotipo (Sez.4), non quale ingrediente preciso al suo interno.
- **Correzione bug di calcolo copertura**: le patate NON vanno forzate come "V presente" nella sigla — sono già `gruppo:carboidrati` in ingredienti.json, contribuiscono naturalmente a C. La "regola patate" (sopra) resta valida a runtime (il motore non cerca più un contorno separato), ma è una regola di comportamento, non un dato falso da scrivere nella sigla statica.
- **Preparazioni universali per PC e PP (dettato in sviluppo)**: qualunque ricetta PC (carne) o PP (pesce) può esistere nelle varianti **alla piastra, al vapore, al limone** — sono modalità di cottura compatibili di default con questi due gruppi, usate come base per generare rapidamente varianti "solo P" e "P+V" quando manca copertura su un ingrediente. Applicato finora solo agli ingredienti nuovi aggiunti (Arista di maiale, Magro di vitello) — non ancora retroattivo su tutte le ricette PC/PP esistenti, sarebbe un lavoro a parte.
- **Cous cous non richiede vera cottura**: bastano 5 minuti in acqua/brodo bollente a fuoco spento, quindi passa il controllo per "piatto veloce" — `richiedeCottura:false` anche se tecnicamente c'è un passaggio con liquido caldo. Corretto su tutte le ricette pranzo/cena con cous cous (10 ricette).

---

## 6. VERDURE

- Finché c'è verdura **fresca** con quantità ≥ porzione, **niente verdure cotte di default**; il fresco si **alterna** per non ripetere lo stesso contorno. *(ex 4.1)*
- Flag stato iniziale: **fresche = 1 (disponibili)**, lunga conservazione = 0, surgelate = 0. *(ex 4.2, polarità corretta)*
- Controllo freschezza + stock + peso: **finché peso > porzione, stock resta 1**. Quando tutti gli ingredienti a un livello di freschezza sono a 0 (finiti), si passa al livello successivo: fresche esaurite → lunga conservazione torna a 1; lunga esaurita → surgelate tornano a 1. Questo permette di usare con certezza matematica ciò che deperisce. *(ex GEN-3 + 4.3, unificati, polarità corretta)*
- Compro una fresca (la carico in inventario col peso) → il suo flag torna a **1** e, siccome il filtro parte sempre dal fresco, **viene usata subito**. *(ex 4.4, polarità corretta)*
- Se non ho impostato nulla nel Set, **prima quello che scade prima** (fresco = alta deperibilità). La deperibilità è gestita con **numeri** (classi di perishability), ma conta la **logica d'ordine**, non il valore esatto. *(ex 4.5)*
- Disattivate = escluse HARD; ricorrente = HARD nei pasti marcati; stagione = soft (la disponibilità batte la stagione). *(ex 4.6)*
- Se la ricetta contiene già verdura sufficiente → requisito assolto, **niente contorno**. *(ex 4.7)*
- Roll di alternanza: chi è stato estratto a pranzo **non può essere estratto anche la sera** come contorno. *(ex GEN-5)*
- Verdure da aggiungere: **pomodorini, radicchio, carote, finocchi**. *(ex 4.8)*
- Insalate da aggiungere: insalata di pomodori, insalata con pomodori, insalata mista con carote e finocchi, julienne di carote, carote e finocchi, insalata di pomodori e basilico, misticanza di radicchio, radicchio rosso e carote. *(ex 4.9)*
- Zuppe legumi da aggiungere: zuppa cereali e legumi in brodo, zuppa di lenticchie, zuppa di ceci, zuppa di fagioli al rosmarino. *(ex 4.10)*

---

## 7. INVENTARIO

- **Quasi esaurito**: ingrediente sotto porzione → **triangolo giallo ⚠️** accanto alle ricette che lo usano. **Non esclude la ricetta dal pool**: resta proposta, con avviso. *(ex 5.2, confermato — decisione punto 2)*
- **Salvafrigo**: priorità scadenza imminente > avanzo scomodo > freezer; propone ricette della macro del pasto che usano quell'ingrediente. *(ex 5.3)*

---

## 8. STORICO E CONSUMO

- Lo **storico contiene tutto ciò che l'utente ha consumato**; è immutabile; sopravvive ai reset; si cancella solo su richiesta esplicita. *(ex 6.1)*
- **Ogni ingrediente usato deve risultare usato**. *(ex 6.2)*
- Un pasto è consumato solo se: registrato a mano, **oppure** la finestra oraria è passata **e** il pasto era programmato **prima** della finestra. *(ex 6.3)*
- Un pasto generato **dopo** il passaggio della sua finestra **non deve comparire consumato** (e non va generato). *(ex 6.4)*
- Giorni passati: **sola lettura**, mai generati, **mai presupposti** da niente (spesa, frequenze, rotazione). *(ex 6.5)*
- Generazione menù **solo da domani in poi** (giorno > oggi). *(ex 6.6)*
- **I tre scopi del flag consumo (chiariti in sviluppo, da non confondere con lo stock)**: quando un pasto passa a consumato, il flag fa TRE cose distinte, non una: (1) storna i materiali mangiati dalla giacenza (scalo inventario, già coperto da "ogni ingrediente usato deve risultare usato"); (2) memorizza esattamente cosa è stato mangiato, per statistiche; (3) rende la ricetta **non più modificabile**. Punto 3 da definire meglio in fase di codice: se il blocco modifica vale sulla ricetta-modello per sempre, o solo sulla voce storico di quel pasto specifico.
- **Stock (diverso dal flag consumo)**: serve solo a evitare ripetizioni **dentro la stessa generazione settimanale** (es. non uscire "peperoni saltati" 6 volte). Si azzera e ripristina ad ogni nuova generazione, indipendentemente dal consumo reale. Vale su ingredienti in generale (proteine, verdure, contorni), non solo proteine. **Perché a livello di ingrediente specifico e non di macrocategoria**: pesce 3 volte nella stessa settimana deve poter uscire come salmone, merluzzo e tonno fresco (varietà reale) invece di rischiare lo stesso pesce ripetuto solo perché la categoria "pesce" ha ancora margine.

---

## 9. PROGRAMMAZIONE SETTIMANALE — natura e lista spesa

- La programmazione settimanale è una **linea guida consigliata**. L'utente può modificarla e salvarla dall'apposita sezione. Anche se salvata **resta modificabile**.
- In funzione di ciò che la compone, al netto di inventario, viene definita la **lista spesa**.
- **Meccanismo esatto (chiarito in sviluppo)**: la verifica disponibilità ingredienti e la lista spesa sono la STESSA operazione, non due calcoli separati. Per ogni ingrediente di ogni ricetta scelta: c'è abbastanza per la porzione? Sì → si scala dalla dispensa, nessuna aggiunta alla spesa. No (poco o zero) → la differenza esatta (richiesto − disponibile) va diretta in lista spesa, e la ricetta resta comunque scelta (mai esclusa). La lista spesa finale è la somma di questi "carenti" su tutte le ricette della settimana — non un ricalcolo "settimana − inventario" fatto a parte.
- L'utente può vedere e modificare la programmazione settimanale sulla sezione **Pasto**, scorrendo i giorni.
- Genera menù settimanale può assegnare pasti da **today+1**: oggi genero il menù, la programmazione parte da **domani mattina colazione** in poi.

---

## 10. INTERFACCIA

- **Revisione della disposizione del pasto — requisito registrato, definizione ancora in corso (NON implementare finché Cwe non conclude le indicazioni):** il pannello deve essere immediatamente leggibile e composto, nell'ordine, dalle seguenti tre righe:
  1. **Carboidrato:** alimento scelto + comando **"Scegli sugo"**, solo quando il carboidrato prevede un sugo.
  2. **Proteine:** alimento scelto + indicazione/selezione **"cotto così"**, solo quando è prevista una cottura configurabile.
  3. **Verdure:** alimento scelto + indicazione/selezione della **cottura**, solo quando è prevista.
- A destra di **ciascuna** delle tre righe devono comparire, con disposizione coerente e sempre riconoscibile:
  - **refresh 🔄** della singola componente;
  - **informazioni nutrizionali ⓘ** della singola componente.
- Nella testata del pannello, sul lato opposto rispetto al punto in cui viene visualizzato il **livello della ricetta**, deve esserci **un solo pulsante di switch** tra:
  - **Pasto**;
  - **Pasto speciale**.
  Lo switch deve mantenere **lo stesso pulsante e le stesse dimensioni** nei due stati, cambiando scritta, stato e funzione associata senza spostare gli altri elementi della testata.
- Le precedenti tab separate non sono il riferimento grafico: il passaggio Pasto/Pasto speciale avviene tramite lo switch unico nella testata.
- **Vista compatta ed espansione — Colazione, Pranzo e Cena:** nello stato normale ciascun blocco deve mostrare **soltanto le informazioni essenziali definite sopra**. Per Pranzo e Cena: Carboidrato (+ sugo se previsto), Proteine (+ cottura se prevista), Verdure (+ cottura se prevista), con refresh e informazioni nutrizionali a destra. Per Colazione dovrà essere mostrata soltanto la sua composizione essenziale, secondo le specifiche che verranno completate da Cwe.
- Tutte le altre funzioni già previste per cambio, modifica, sostituzione, salvafrigo, conferma e ulteriori impostazioni **non vengono eliminate**: restano disponibili ma sono **nascoste nello stato compatto** e diventano visibili esclusivamente aprendo il pannello espandibile del relativo pasto.
- **Controllo grafico di apertura:** al centro del bordo inferiore di ogni blocco Colazione/Pranzo/Cena va collocato un piccolo pulsante circolare sovrapposto al bordo:
  - `⌄` quando il pannello è chiuso;
  - `⌃` quando il pannello è aperto.
  Il cerchio deve avere il fondo coerente con la card, bordo sottile e un'area cliccabile indicativa di **36–40 px**. L'apertura non deve cambiare la larghezza della card né spostare la testata; deve espandere verticalmente il contenuto secondario.
- Il pulsante circolare è l'unico comando per mostrare o nascondere le impostazioni secondarie del blocco. Lo stato iniziale è **chiuso**.
- **Comportamento tecnico dell'espansione (precisazione confermata):** il contenuto secondario e tutte le relative funzioni sono già presenti all'interno della card anche quando questa è chiusa. La vista compatta limita l'altezza della card e ne ritaglia/nasconde la parte inferiore; il pulsante `⌄` rimuove tale limite e rende visibile il contenuto già esistente. Il pulsante `⌃` ripristina il limite e torna a nasconderlo. Apertura e chiusura sono quindi una variazione esclusivamente visiva: **non devono creare, distruggere, ricaricare, rigenerare o azzerare** contenuti, selezioni, bozze, listener o stato del pasto.
- **Contenuto espanso di Pranzo/Cena (definizione confermata):** la parte nascosta contiene in alto tre celle selezionabili, graficamente analoghe ai selettori del Set, ciascuna con icona e descrizione: **Carboidrati**, **Proteine**, **Verdure**. **Non devono contenere radio button:** vale il click sulla cella stessa, che viene evidenziata come attiva e comunica lo stato anche tramite `aria-pressed`. È attiva inizialmente Carboidrati. Sotto le tre celle esiste una sola area dinamica, riutilizzata per la componente selezionata:
  - Carboidrati: pulsanti **Analogo**, **Cambia sugo** (solo se applicabile), **Imposta**;
  - Proteine: pulsanti **Analogo**, **Cambia cottura** (solo se applicabile), **Imposta**;
  - Verdure: pulsanti **Cambia verdura**, **Imposta**.
- Sotto i pulsanti compare una barra di ricerca dinamica per nome. Durante la digitazione mostra al massimo le **prime 5 ricette ammesse** pertinenti alla componente attiva. Una ricetta può essere selezionata dalla lista; **Imposta** applica la selezione alla componente del pasto. Cliccando una delle celle in alto cambiano comandi, risultati e destinazione dell'impostazione, sempre nella stessa area sottostante.
- Il precedente comando generale **"Usa questi come pasto programmato" / "Imposta questo"** deve essere rimosso dal pannello: l'impostazione viene eseguita dal pulsante contestuale **Imposta** della componente attiva. Le altre funzioni esistenti non eliminate da queste regole restano nel contenuto espanso, organizzate senza duplicazioni.
- **Loading:** l'avvio deve mostrare un solo ciclo di caricamento. Il cambio/aggiornamento del service worker non deve provocare un secondo reload immediato e quindi una seconda animazione di loading consecutiva.
- **Patate — composizione non ambigua:** le patate sono una fonte di carboidrati e hanno `haPoolSughi:false`: non devono mai ricevere un sugo né mostrare il comando “Cambia sugo”. Come carboidrato autonomo possono essere realizzate da una ricetta dedicata (es. Patate al forno). Se sono già contenute nella ricetta proteica, il pasto non deve aggiungere un secondo carboidrato. Le ricette a doppio carboidrato, come Pasta e patate, restano fallback e non vengono scelte se esiste un'alternativa semplice. Le preparazioni di patate non devono entrare nel selettore Verdure soltanto perché archiviate come `contorno`: quel selettore accetta esclusivamente componenti modulari classificati come verdura.
- **Stato del requisito:** definizione sufficiente per l'implementazione corrente. Eventuali dettagli futuri possono affinare il contenuto essenziale della Colazione e le ulteriori interazioni senza ripristinare la vecchia struttura confusa.
- **Refresh combinatorio con registro di sessione**: nessuna combinazione ripetuta finché il giro non è esaurito, poi riparte. *(ex 7.3)*
- Set: bottone **"Genera menù" in alto** dopo la descrizione; **giorni non programmabili (≤ oggi) disattivati**; salvataggio **non automatico** con **Annulla / Sì / Rigenera** in fondo. *(ex 7.4)*

---

## 11. ALTRI PASTI E USCITE

- Colazione a gruppi; preferita sui giorni scelti; speciali ≤2/sett; premio dopo 5 colazioni regolari. *(ex 8.1)*
- Spuntini facoltativi con tetti (da limitare ≤2/sett, grana/crackers/pane+marmellata ≤3/sett, frutta secca ≤1/giorno). *(ex 8.2)*
- Pasti speciali ≤2/sett, solo scelta deliberata, nessuna compensazione automatica. *(ex 8.3)*
- **Precisazione piatto speciale/asporto**: i valori nutrizionali della ricetta (es. Pizza da asporto) NON entrano nel calcolo del bilancio nutrizionale settimanale — restano solo dato informativo, pensato per un eventuale grafico futuro che mostri quanto ci si scosta dalla media raccomandata quando si sceglie uno speciale. Il motore, nel calcolo dei totali settimanali P/C/V/kcal, deve escludere ogni ricetta con `piattoSpeciale:true`. Tracciato solo come evento/frequenza (soft, max 1-2/settimana condiviso tra tutti i piatti speciali insieme), mai come voce di macro.
- Lista spesa = settimana pianificata − inventario, arrotondata ai formati; i comprati non si toccano. *(ex 8.4)*
- Nutrizione per 1 persona; target giornaliero della guida; indicatore integrale; frutta derivata dai pasti. *(ex 8.5)*
- Scambio pranzo/cena se nessuno dei due è consumato. Promemoria giovedì. *(ex 8.6)*

---

## 12. METODO DI LAVORO

- Nessun blocco rigido: sfori ammessi ma **mai silenziosi** (allarme con conferma). *(ex 9.1)*
- **Niente codice** finché la struttura non è esattamente come la vuoi; quando scritto, deve essere funzionale al 200%. *(ex 9.2)*
- Si parte **dalla logica** e si scrive tutto il codice, poi lo si mette dove serve; **non** si corregge il vecchio codice per non farsi influenzare dallo schema vecchio. *(ex 9.3)*
- Non riproporre punti già implementati: prima si controlla il file attuale e si tolgono dalla lista. *(ex 9.4)*

---

## 13. SVILUPPO APP WEB — regole dominanti

1. **Regola 1**: Regole flusso logico è la dominante assoluta. Tutto quello che è scritto in questo file deve essere programmato, funzionale e funzionante in app.
2. **Regola 2**: non farsi traviare dal file html o dai js o dai json. Effettuare tutte le modifiche necessarie, senza mai scegliere soluzioni ritenute sommariamente più facili e veloci. Unica soluzione accettabile è quella che fa rispettare tutti i criteri chiesti.
3. **Regola 3**: usare il file html come uno scheletro su cui applicare il motore. Nessun cambiamento grafico se non richiesto o autorizzato.

---

## 14. SET — logica tabelle carboidrati e proteine

1. Se l'utente non compila la tabella, ne viene creata una dal sistema conforme alle specifiche della linea guida.
2. In caso di compilazione parziale, il sistema completa la distribuzione in modo casuale conforme alle specifiche.
3. Se l'utente vuole una disposizione casuale, il sistema rigenera combinazioni casuali valide conformi alle specifiche.
4. Se l'utente non attiva i carboidrati complessi con restrizione (i tipi `limitato:true`: friselle, gnocchi, pasta ripiena, gallette, crackers, taralli/grissini/crostini, piadina, pasta sfoglia), il sistema li ignora nella distribuzione automatica — non li forza nel totale.
5. Le caselle compilate dal sistema hanno un colore più opaco rispetto alle caselle compilate dall'utente (distinzione visiva).

Risultato: si esce sempre con dati matematici completi per le query alle ricette, mai una tabella a metà.

### Pulsanti tabella (carboidrati E proteine) — struttura

Entrambe le tabelle (giorno×cereale per carbo, giorno×categoria per proteine) hanno gli stessi 4 pulsanti, stesso comportamento concettuale:

**Pulisci**
- Azzera TUTTE le celle (utente e sistema) a stato vuoto.
- Non salva subito — resta bozza finché non si preme Salva.
- Se si salva subito dopo Pulisci → si applica la Regola 1 (sistema genera da zero).

**Completa**
- Riempie SOLO le celle mancanti, casuale ma conforme alle specifiche (tetti, cap individuali, esclude i carboidrati limitati non attivati — Regola 4).
- Le celle già presenti (utente o sistema) NON vengono toccate.
- Applica la Regola 2 su richiesta esplicita, invece che solo al salvataggio.
- Le celle aggiunte sono marcate "sistema" (Regola 5).

**Casuale**
- Rigenera TUTTA la tabella da zero, sostituendo anche le celle già presenti (utente incluso).
- Applica la Regola 3.
- Tutte le celle risultanti sono marcate "sistema" (l'utente può poi ricliccarne alcune per riprenderne il possesso).
- **Garanzia matematica**: non genera-poi-controlla — pesca solo dentro lo spazio combinatorio già ammesso (rispetta F1/F2 per proteine, cap individuali/tetto limitati per carboidrati per costruzione). Una combinazione non valida non è nemmeno raggiungibile dal generatore, non serve validarla a posteriori.
- **Fonte unica di validità**: il controllo delle possibilità concesse è a monte, condiviso tra utente e sistema — la stessa funzione che dice "questa cella è cliccabile dall'utente" è quella che vincola dove può pescare il generatore casuale. Non due logiche separate: se una scelta è preclusa all'utente (tetto raggiunto, max 2/giorno...), è preclusa allo stesso modo al Casuale/Completa.

**Salva**
- Valida completezza prima di persistere (14/14 per carbo, tetti rispettati per proteine).
- Se incompleta: applica automaticamente Regola 1 o 2 come fallback, poi salva.
- Persiste in `impostazioni` (`configCarboidrati` per carbo, `giornoCategoria` per proteine).
- Il motore userà la configurazione alla prossima generazione.

### Struttura dati necessaria per distinguere origine cella (Regola 5)
Oggi `statoCaselleCarb[chiave] = numero` (solo un contatore, nessuna origine). Serve diventare per-cella con origine tracciata, es. `statoCaselleCarb[chiave] = {utente:N, sistema:M}` o, se le caselle sono individualmente assegnate a slot, un oggetto per cella `{origine:'utente'|'sistema'}`. Stesso discorso per `giornoCategoria[giorno]`: oggi è un array di stringhe categoria, deve diventare un array di oggetti `{categoria, origine}`.

### Buco tecnico da colmare per i carboidrati (prerequisito ai pulsanti)
Non esiste oggi un equivalente di `costruisciGrigliaBase` (che le proteine hanno già) per i carboidrati: serve una funzione che distribuisca le unità del totale (14) sui 14 slot giorno×pasto specifici — oggi `configCarboidrati` è solo un sacco di conteggi per tipo, senza nessuna assegnazione a slot. Va scritta da zero, rispettando: pool dei 9 tipi non limitati sempre disponibile; tipi limitati (`limitato:true`) solo se già attivati dall'utente (almeno 1 click, Regola 4); cap individuali (`maxIndividuale`) e tetto complessivo limitati (`CONFIG_CARB_TETTO_LIMITATI=3`) sempre rispettati.

**Chiarimento (colmato un buco reale nella documentazione, non era scritto da nessuna parte)**: anche i 9 tipi **non limitati** hanno un tetto individuale di default nella generazione casuale — **max 6 su 14** — altrimenti un solo tipo (es. "pasta") potrebbe teoricamente riempire tutte le 14 caselle. Stesso numero già usato altrove nel codice come default (`CONFIG_CARB_MAX_CASELLE`), qui confermato come decisione esplicita e non più "perché il vecchio file lo aveva".

---

## 15. SET — tetti di frequenza personalizzati per ingrediente

Distinto dai tetti della guida PDF (quelli sono su macrocategorie/sottotipi, es. "pesce grande ≤1/sett"): questo è un **tetto scelto dall'utente su un singolo ingrediente**, per gusto proprio, non per la guida. Esempio dato: "non più di N volte a settimana con pomodoro".

- Struttura: l'utente sceglie un ingrediente da `ingredienti.json` e un numero massimo di occorrenze/settimana. Non è un caso speciale hardcoded per "pomodoro" — è un meccanismo generale, applicabile a qualunque ingrediente.
- Salvato in `impostazioni` come mappa ingrediente→tetto (es. `tettiIngredienteSettimanali: {"Pomodoro fresco": 3}`).
- Applicazione nel motore: **stesso principio "nessun blocco rigido"** già usato ovunque — quando si costruisce il pool per uno slot (proteina, sugo, contorno...), le ricette che usano un ingrediente il cui tetto settimanale è già raggiunto vengono escluse dal pool; se questo svuota il pool, si ricade sul pool intero con segnalazione di sforo, mai un blocco vero.
- È trasversale: non è legato a una sola fase (proteina/carboidrato/verdura) — un tetto su un ingrediente vale ovunque quell'ingrediente compaia, in qualunque ruolo nella ricetta.

---

## 16. SET — cereali non graditi + esclusione verdure per stagionalità

**Cereali non graditi**: nessuna struttura nuova di dati — usa il campo `gradimento` già presente su ogni cereale in `ingredienti.json` (è uniforme su tutti i 127 ingredienti). Manca solo il pannello Set per attivarlo/disattivarlo, stesso pattern già esistente di `renderSetVerdure` (toggle attiva/disattiva), applicato ai cereali invece che alle verdure.

**Limite preventivo sui selettori "non gradito"**: non è una funzione nuova da costruire — riusa lo stesso pattern di limite massimo già presente nel Set per i carboidrati (`maxIndividuale`, tetto complessivo). Applicato anche ai toggle "non gradito" su qualsiasi ingrediente (verdure, cereali, proteine...): impedisce di escludere tutte le opzioni di una macrocategoria/sottotipo obbligatorio.

**Esclusione verdure per stagionalità**: meccanismo **manuale e distinto** dalla regola automatica SOFT già esistente (`verdureDiStagione()`, che resta invariata — ordina per stagionalità da calendario, non esclude). Questo è un secondo meccanismo, parallelo a `setVerdureDisattivate` (esclusione per gusto):
- L'utente sceglie quali verdure escludere e quando, **indipendentemente dal calendario automatico** — è una scelta sua, non derivata dal mese.
- Funziona come HARD exclusion nel motore, stesso effetto di `setVerdureDisattivate` (esclusa dal pool contorno, mai un blocco vero se svuota tutto).
- Va **tracciata separatamente** dall'esclusione per gusto (motivo diverso), così l'utente può rimuovere le esclusioni stagionali senza toccare quelle di gusto — es. struttura `{variantId, motivo:'gusto'|'stagionalita'}` invece di un'unica lista piatta come oggi.

---

## 17. RICETTE SOLO-MANUALI + "CERCA RICETTA" (bypass criteri)

Principio alla base: *"ti raccomando quello che sarebbe giusto mangiassi ma se vuoi altro ok, basta che sia saltuario e nelle dosi corrette"*. Esiste una categoria di ricette che il sistema non deve mai proporre da solo (troppo laboriose o non compatibili col tempo disponibile in automatico), ma che l'utente deve poter scegliere deliberatamente quando vuole.

**Flag nuovo `soloManuale:true`** su ricetta, distinto da `piattoSpeciale`:
- generico e riusabile — non hardcoded per una ricetta specifica, applicabile a qualunque ricetta futura giudicata troppo laboriosa per la generazione automatica.
- il motore di generazione automatica **esclude sempre** dal pool le ricette con `soloManuale:true` — non vengono mai proposte in "genera menù", nemmeno come fallback.
- selezionabile **solo** tramite lo strumento "cerca ricetta" (vedi sotto).
- **conta normalmente** nel bilancio nutrizionale settimanale (a differenza di `piattoSpeciale`, che ne è escluso — vedi Sez.11).
- **scala l'inventario normalmente** come qualsiasi altra ricetta (viene cucinata con ingredienti reali, non comprata pronta).
- **nessun tetto di frequenza imposto dal sistema**: la laboriosità stessa è il freno naturale, non serve un limite artificiale.

**Nuova funzione UI "cerca ricetta"**: un selettore/ricerca per nome nell'interfaccia di editing pasto (accanto/dentro `renderBloccoCompleto`), che permette di scegliere **qualunque ricetta del database** — non solo quelle `soloManuale` — e la imposta direttamente in quello slot pasto, **bypassando i criteri Set/automatici** solo per quel singolo slot. È un bypass generale di comodità, non limitato alla categoria soloManuale.

**Nato da un caso concreto (Cwe)**: pasto già completo ma poca fame/voglia, si vorrebbe cambiare solo il carboidrato con crackers. Il roll 🔄 esistente non basta: pesca a caso, non garantisce crackers, e un click successivo (anche su un'altra riga, per sistemare qualcos'altro) può far perdere la scelta appena fatta — nessun modo per "fissarla". **Chiarito con Cwe**: questo non è un caso da lucchetto-per-componente (quel concetto si applica solo al Menù generato dal sistema, dove l'utente può solo "girare la ruota" o bloccare un'estrazione — F6, già esistente, invariato). Il **pasto** è invece un ponte diretto tra cosa vuole l'utente in quel momento e cosa è realmente possibile: una scelta diretta (non un'estrazione) non necessita di un lucchetto separato — resta lì finché non è l'utente stesso a toccarla di nuovo (roll o nuova ricerca).

**Design UI confermato (Cwe), riusa il pattern già esistente di `apriModalEditorPasto`** (`#editorRicerca`: casella di ricerca testuale + lista cliccabile, già live in "Cosa hai mangiato?"):
- **Titolo per questa variante**: *"Cosa ti va di mangiare oggi?"* — distinto dal titolo "Cosa hai mangiato?" del modal di consumo reale (stesso pattern UI, intento diverso: qui si pianifica cosa mangiare ora, non si registra cosa è già stato mangiato).
- **3 radio sopra la ricerca**: Carbo / Prot / Verdura — indicano a quale riga del pasto corrente va assegnato il risultato scelto.
- **Ricerca testuale** (stile identico a `editorRicerca`): filtro per nome, lista cliccabile. Mostra **tutto**, anche ricette con ingredienti fuori stock (principio invariato, Sez.1: la disponibilità non esclude mai una ricetta) — **ma esclude** le ricette il cui ingrediente/categoria ha già raggiunto il tetto massimo di frequenza settimanale (qualunque tetto si applichi al contesto: macrocategoria proteica, sottotipo extra, tipo carboidrato, o tetto personalizzato per ingrediente, Sez.15). **Qui l'esclusione per tetto è vera e diretta**, non soft-con-fallback come nel resto del motore (Sez.14) — eccezione dichiarata da Cwe per questo strumento specifico, coerente col fatto che è una scelta deliberata dell'utente, non una generazione automatica da salvare a ogni costo.
- **Pulsante "Imposta pasto"**: assegna la ricetta scelta esattamente alla riga selezionata (Carbo/Prot/Verdura) del pasto corrente.
- **Tendina collassata di default**: tutta questa modalità di ricerca è chiusa dentro un pannello a comparsa, aperto cliccando un simbolo a triangolo rovesciato (⌄/▽) — riduce l'affollamento visivo dell'interfaccia pasto, che altrimenti avrebbe sempre visibile un blocco di ricerca sopra le 3 righe roll+salvafrigo.

**Caso concreto — Ramen Giapponese**: `soloManuale:true`, richiede brodo di pollo fatto in casa (sovracosce), tagliolini all'uovo (confezione intera da 500g, non 100g), uovo, condimenti asiatici (salsa di soia, zenzero, cipollotto, dado). Diverso dai due Ramen rapidi già esistenti in ricette.json ("Ramen con tofu e verdura", "Ramen con pollo e verdura", entrambi con noodles secchi pronti, non soloManuale). Cuocendo la confezione intera di tagliolini si genera un avanzo di pasta già cotta, riutilizzato il giorno dopo in ricette **normali** (proponibili liberamente dal motore, NON soloManuale): "Tagliolini al salmone", "Tagliolini ai funghi", "Tagliolini al pomodoro fresco e basilico".

**Nuovo gruppo ingrediente `condimento`**: per ingredienti da dispensa comprati raramente e che durano a lungo (salsa di soia, dado, zenzero, cipollotto — quest'ultimo comprato fresco, tagliato tutto e congelato in piccole dosi). Tutti flaggati `nonRichiedeInventario:true`: non ha senso tracciarne le scorte, si usano in quantità minime (cucchiaino) e si ricomprano di rado. Stesso principio già usato per Pizza margherita/Granita, ma applicato qui a condimenti invece che a piatti pronti.

---

## 18. PAGINA MENÙ — ridisegno (carosello settimane, bozza/salva, blocco today+1, proposto+consumato)

**NOTA: solo analisi/decisioni, nessun codice scritto.** Da sviluppare quando richiesto esplicitamente, leggendo questa sezione prima di iniziare.

### Stato reale verificato nel codice (index__20_.html, versione con batch Set tab)
- Pagina Menù attuale: **non** ha uno scroller — solo 2 bottoni fissi "Questa settimana"/"Settimana prossima" (`menuSettimanaTab`, `menuSettimanaScarto` 0/1). Footer attuale (`renderMenuFooter`) ha solo 2 bottoni: "Genera menù da Set" e "🛒 Vai alla spesa".
- Lo scroller giornaliero reale (quello da prendere come riferimento di stile) è `giorniFinestraScorrevole()` in pagina Piano: striscia **continua** or­izzontale di singoli giorni (±90 giorni), classi `.giorno-numero`/`.giorno-testo`, stato `.active`/`.oggi`. **Non è però il pattern scelto per le settimane** — vedi decisione sotto, il nuovo frame settimane sarà invece un carosello (1 settimana per schermata), stile visivo da studiare a parte pur restando coerente.
- Lucchetto F6 (blocco pasto da rigenerazione): **già esistente e funzionante**, non richiede modifiche. Vive nel summary del riepilogo pasto (`data-blocca-menu`), toggle `voce.bloccata`, il motore lo rispetta già (F6 in `sviluppaGrigliaCrossWeek`).
- Riconciliazione con inventario per lista spesa: **già esistente** (`calcolaListaSpesa`), invariata.
- Editor "Cosa hai mangiato?" (`apriModalEditorPasto`): oggi **sovrascrive** `voce.ricettaId`/campi equivalenti con la scelta corretta e imposta `voce.consumato=true` — il proposto originale viene perso, non recuperabile.
- `elaboraConsumoAutomatico()` (in `renderPiano`): transizione automatica a "consumato" quando l'orario del pasto è superato — scala inventario, gira ogni volta che si apre Piano. **Real-time, basato sull'orologio reale**, non è un'azione manuale dell'utente.

### Decisioni prese (da rispettare alla lettera in fase di sviluppo)

1. **Frame settimane fisso, sotto il titolo**: carosello — **1 settimana intera per schermata**, swipe orizzontale per passare a quella prima/dopo. Multi-settimana (non solo "questa"/"prossima" come oggi) — l'utente deve poter scorrere più avanti/indietro nel tempo, non solo ±1 settimana.

2. **Frame fisso in basso con 4 pulsanti**: Annulla, Resetta, Rigenera, Salva.

3. **Modello "bozza poi salva" — CAMBIO ARCHITETTURALE IMPORTANTE**: confermato esplicitamente. Oggi ogni interazione scrive **subito** nello store `piano` di IndexedDB (vedi `put('piano', ...)` sparso in tutte le funzioni di editing pasto). Il nuovo comportamento richiede uno **strato di bozza separato dallo stato committato**: le modifiche fatte nella settimana aperta (blocchi, scelte, rigenerazioni) restano in sospeso finché non si preme **Salva**.

   **Risolto — bozza vs consumo automatico**: la bozza riguarda **solo le modifiche manuali alla programmazione futura**. `elaboraConsumoAutomatico()` (transizione a "consumato" per orario superato) resta **invariata e in tempo reale**, indipendente dallo stato di bozza — non è mai una modifica in sospeso, è un fatto della vita reale (hai mangiato o no).

   **Risolto — significato esatto dei 4 pulsanti** (Cwe, testuale):
   - **Annulla**: chiude la pagina e scarta tutta la bozza — torna allo stato salvato in precedenza, nessuna modifica in sospeso sopravvive.
   - **Resetta**: svuota **tutta** la bozza della settimana aperta, **lucchetti F6 inclusi**, poi rigenera da zero — tabula rasa completa, nessun vincolo residuo (a differenza di Rigenera, qui anche ciò che era bloccato viene cancellato e riproposto).
   - **Rigenera**: richiama la generazione automatica da Set **rispettando i lucchetti F6 esistenti** — sovrascrive solo gli slot non bloccati, lascia intatto ciò che l'utente aveva fissato.
   - **Salva**: persiste la bozza come nuovo stato committato.

4. **Blocco "nulla modificabile prima di today+1"**: **risolto — errore di framing mio, corretto due volte da Cwe** (stesso equivoco già fatto per "pasto vs menù generato", Sez.17). Il blocco today+1 **riguarda SOLO la generazione automatica di sistema** (Rigenera/Casuale/genera menù): questi non toccano MAI oggi o il passato, solo da domani in poi. **Non ha alcun rapporto** con la possibilità dell'utente di modificare manualmente il pasto di "oggi" — quello resta governato dalla regola oraria già esistente (`fasciaPastoSuperata`/consumo automatico), un asse **completamente separato e indipendente**. Le due regole non "convivono" perché non si toccano affatto: una vincola cosa il sistema può rigenerare, l'altra vincola fino a che ora l'utente può ancora agire di persona.

5. **Giorni chiusi (passato): mostrare il consumato reale, idealmente insieme al proposto**. Nuovo campo nello schema `piano` per **conservare il proposto originale** prima che l'editor "Cosa hai mangiato?" lo sovrascriva (oggi quel dato va perso). **Struttura del campo delegata a Claude** (Cwe: "fai come credi sia meglio tu, esula da me") — verrà decisa e documentata al momento di scrivere il codice.

6. **Lista spesa**: tutto ciò che è programmato deve continuare a confrontarsi con l'inventario per generare la differenza (spesa richiesta) — nessuna modifica, comportamento già esistente da preservare intatto nel nuovo flusso bozza/salva.

---

## 19. PAGINA "CONFIGURAZIONE AVANZATA" — parametri globali + gestione ingredienti + allergeni

**NOTA: solo analisi/decisioni, nessun codice scritto.** Da sviluppare quando richiesto esplicitamente, leggendo questa sezione prima di iniziare.

### Concetto — UNA pagina sola, in Impostazioni
Non è una pagina "mega-generica": è **una pagina unica**, pensata in futuro per essere riservata alla nutrizionista (accesso protetto — **rimandato**, si decide come gestirlo più avanti; per ora si costruisce come normale sotto-pagina di Impostazioni, senza alcuna protezione). Raccoglie in un solo posto due cose che oggi sono sparse/hardcoded nel codice JS:

### Sezione A — Parametri globali (frequenza/dose/target)
Scoperta importante: **esiste già un meccanismo-ponte pensato per questo, mai completato** — 3 funzioni (`getConfigProteine()`, `getFrequenzeConsigliateEffettive()`, `getExtraCapSottotipiEffettivi()`) che oggi restituiscono solo le costanti JS fisse, ma **il motore le chiama già** al posto delle costanti dirette (verificato: `frequenzeEffettive`/`extraCapEffettivi` usati in almeno 3 punti del motore). Questo è l'aggancio naturale: la pagina scrive in `impostazioni`, queste funzioni leggono da lì con fallback alla costante originale se non configurato.

**Principio chiave (chiarito da Cwe)**: tutti i numeri di questa sezione sono **valori di default configurabili**, non costanti fisse — la nutrizionista li può modificare dalla pagina Configurazione avanzata. Il range originale del PDF resta visibile in interfaccia come informazione di contesto sopra il campo (Lotto 3/4, non di competenza del motore puro). Coerente con Sez.15 (tetti personalizzati per ingrediente, meccanismo generale): più tetti configurabili = più supporto a varietà e anti-ripetizione, non solo restrizione.

**Convenzione per i default iniziali**: quando il PDF esprime un range (sia per porzioni in grammi che per tetti di frequenza), il **default di partenza è il minimo del range** — decisione esplicita di Cwe, applicata uniformemente. Esempio: "fino a 2-3 volte a settimana" → default 2, non 3. Restano MODIFICABILI dalla nutrizionista, il minimo è solo il punto di partenza prudente.

**Risolto — `CONFIG_PROTEINE_DEFAULT` (era in sospeso)**: confermato dead code (Lotto 0), duplicava `FREQUENZE_CONSIGLIATE`+`EXTRA_CAP_SOTTOTIPI` senza mai essere richiamata. Non riportata nel nuovo motore.

**Risolto — `TARGET_GIORNALIERO` (era in sospeso)**: verificato nel PDF originale con `pdftotext`/rasterizzazione — **zero occorrenze della parola "kcal" in tutto il documento**. Il percorso di Miria Spiller è basato su frequenze settimanali e porzioni, esplicitamente "non rigide" ("è fondamentale ascoltarsi ed essere flessibili"), non su un target calorico numerico. Decisione di Cwe: NON un parametro impostabile — ha senso solo come **stima calcolata** dalle frequenze/porzioni effettivamente configurate (per un eventuale grafico futuro, Sez.11), non come numero fisso in Impostazioni. Rimosso dall'elenco dei parametri configurabili.

**Valori reali verificati nel PDF** (sostituiscono ogni numero precedente non verificato, alcuni erano invenzioni del vecchio codice mai controllate):

| Parametro | Default (minimo del range PDF) | Fonte |
|---|---|---|
| `FREQUENZE_CONSIGLIATE` | carne{min:1,max:3}, pesce{min:2,max:3}, formaggi{min:2,max:3}, uova{min:1,max:2}, legumi{min:2,max:null — "2-3+" nessun tetto superiore esplicito} | PDF pag. proteine |
| `EXTRA_CAP_SOTTOTIPI` | carne_rossa:1, affettati:1, pesce_grande:1, pesce_conservato:1 (tutti "0-1/sett", nessuna ambiguità di range) | PDF |
| `MAX_FONTI_PROTEICHE_GIORNO` (nuovo, mancava) | 2 | PDF: "max 2 fonti proteiche al giorno" |
| `CAP_SPUNTINO_SETTIMANALE` | granita:2, grana_parmigiano:2, crackers_spuntino:2, pane_marmellata:2, patatine_grisbi:1 | PDF pag. spuntini (pag.14 area ESEMPI) — **nota**: "Crackers da spuntino" è un parametro DIVERSO dal tipo carboidrato "Crackers" di pranzo/cena (quello non ha alcun tetto, vedi sotto) |
| `CAP_SPUNTINO_GIORNALIERO` | frutta_secca:1 | PDF: "fino a 1 volta al giorno" (unico, non un range) |
| `FRUTTA_GIORNALIERA` | {min:2, max:3}, porzione 150-200g (non un "tetto", è un range-obiettivo, non collassato a un singolo numero) | PDF |
| `CAP_COLAZIONE_SPECIALE` | 1 | PDF: "1-2 volte a settimana" |
| `COOLDOWN_GIORNI_SENZA_GRUPPO` | **differenziato per tipo** (non un numero unico): carboidrati:7, verdure:2 — dettato da Cwe, non da PDF (scelta applicativa di varietà). Per le verdure: "oggi scelta, dopodomani può uscire di nuovo" + va favorita la presenza di almeno un pasto al giorno con la verdura selezionata (nota aggiuntiva legata a Sez.6 verdura ricorrente, non un tetto a sé) |
| `CONFIG_CARB_MAX_CASELLE` / `TOTALE_OBBLIGATORIO` / `TETTO_LIMITATI` | 6 / 14 / 3 (già fissati e testati nel Lotto 1) | Cwe (non PDF, decisione applicativa Set) |
| `CONFIG_CARB_TIPI` — **corretto** | 9 non limitati: pasta:70g, pasta_fresca:90g, riso:70g, farro:70g, orzo:70g, cous_cous:70g, pane:100g, patate:300g, polenta:70g, **gallette e crackers NON sono limitati** (correzione: erano classificati male, ereditato senza verifica dal vecchio file) — nessun tetto di frequenza per loro dal PDF. 6 limitati (0-2/sett, **tutti uguali**, incluso friselle — non ha un tetto speciale a 1 come erroneamente impostato prima): gnocchi:150g, pasta_ripiena:125g, friselle (2 piccole/1 grande, count-based), **taralli/grissini/crostini insieme come UNA SOLA voce** (`chiave:'taralli'`, un tetto condiviso — corretto per combaciare col codice reale, dove è già una sola voce cliccabile, non 3 separate), piadina (1 unità, count-based), pasta_sfoglia:60g — `maxIndividuale:2` uniforme per tutti e 6. **Totale 17 tipi** (11 non limitati + 6 limitati), combacia col numero reale già presente in `index.html` | PDF pag.14, verificato con rasterizzazione visiva per risolvere ambiguità di layout colonne; struttura di raggruppamento verificata contro il codice reale in fase di Lotto 4 |
| `ALLOCAZIONE_CONDIMENTO_PASTO.olio_evo` | 10g/pasto (2 cucchiaini, conversione assunta 5g/cucchiaino — **assunzione dichiarata**, il PDF dà cucchiaini non grammi) | PDF: "2-3 cucchiaini" |
| `FASCE_ORARIE_PASTO` | pranzo entro le 15:00, cena entro le 22:00 | Cwe (non PDF, scelta pratica) |

**Porzioni cereali — risolto il dubbio "due tabelle parallele"**: la tabella sopra (`CONFIG_CARB_TIPI`) è ora l'unica fonte con dati reali verificati; l'eventuale altra tabella parallela nel vecchio codice (`CEREALI_PRIMI`) non viene portata avanti — si riparte da questa.

**Cadenza primi speciali**: `PRIMI_SPECIALI_CONFIG[].cadenzaSettimane` per gnocchi/pasta ripiena — già coperto dal tetto 0-2/sett della tabella sopra, non serve un parametro separato: non riportato.

**Esclusi dalla pagina** (restano hardcoded, sono tassonomia/struttura non parametri di dieta): `SOTTOTIPO_A_GRUPPO`, `MAPPATURA_DADINI_INTEGRALE`, `COLAZIONE_GRUPPI`, `COLAZIONI_AUTOMATICHE_COHERENTI`, `CEREALI_MODULARI`, `CARBOIDRATI_ROTAZIONE`, `CARBOIDRATI_LIMITATI`, `TIPO_PORTATA_MODULARE`, `SOTTOCATEGORIE_MODULARI`, `COTTURE_STANDARD`, `VERDURE_STAGIONALI`, etichette/icone UI.

### Sezione B — Due meccanismi distinti, non uno con due modalità

**Corretto dopo chiarimento di Cwe** — errore mio nella prima stesura: avevo presentato il blocco hard come motivato dall'allergene. In realtà sono **due cose separate**:

**B.1 — Profilo allergie (salute, automatico)**: un "profilo allergie/intolleranze" dove si selezionano quali dei 14 allergeni UE riguardano la persona che usa l'app. Selezionarne uno **blocca automaticamente, a cascata, tutti gli ingredienti taggati con quell'allergene** (vedi classificazione sotto) — nessuna azione manuale ingrediente-per-ingrediente richiesta, è conseguenza diretta della classificazione.

**B.2 — Blocco ingrediente (arbitrario, manuale, stile alimentare)**: strumento generico e manuale che la nutrizionista usa ingrediente-per-ingrediente, per **qualsiasi motivo di stile alimentare**, non necessariamente salute — es. impostazioni per vegani, vegetariani, celiaci, scelte etiche/culturali/professionali. Indipendente dal profilo allergie: un ingrediente può essere bloccato qui senza essere legato a nessun allergene (es. "niente carne rossa" per scelta, non per allergia).

Entrambi i meccanismi, una volta attivi (da B.1 o da B.2), producono lo **stesso effetto reale**: esclusione totale e hard di ogni ricetta che contiene l'ingrediente, dalle proposte del motore, ovunque (generazione automatica, "cerca ricetta", tutto) — nessuna eccezione, nessun avviso soft. Eccezione deliberata al principio "nessun blocco rigido" (Sez.1 punto 2), qui giustificata da sicurezza/scelta esplicita, non da preferenza di gusto.

Diverso e distinto anche dal blocco "gusto"/"stagionalità" già esistente per le verdure (Sez.16) — quello è verdure-only e soft-per-contorno; questi due (B.1 e B.2) sono generali a **qualsiasi ingrediente** e hard-per-qualsiasi-ricetta lo contenga.

**Futuro, non ora**: interfacce Set specifiche e pre-costruite per intere "classi alimentari" (es. un toggle unico "Vegano" che attiva in blocco tutti i blocchi ingrediente coerenti, invece di spuntarli uno per uno) — Cwe ha detto esplicitamente che si vedrà più avanti come implementarle. Non è nello scopo di questa sezione, solo annotato per non perderlo.

### Sezione B.1 — Classificazione allergeni (14 allergeni UE)

Elenco ufficiale, Allegato II del Regolamento (UE) n. 1169/2011 (verificato via ricerca web, non da memoria):

| # | Allergene | Icona proposta |
|---|---|---|
| 1 | Cereali contenenti glutine (grano, segale, orzo, avena, farro, kamut) | 🌾 |
| 2 | Crostacei | 🦐 |
| 3 | Uova | 🥚 |
| 4 | Pesce | 🐟 |
| 5 | Arachidi | 🥜 |
| 6 | Soia | 🌱 |
| 7 | Latte (incluso lattosio) | 🥛 |
| 8 | Frutta a guscio (mandorle, nocciole, noci, anacardi, pecan, noci del Brasile, pistacchi, macadamia) | 🌰 |
| 9 | Sedano | 🥬 |
| 10 | Senape | 🟡 *(nessuna emoji dedicata esiste — approssimazione, da rivedere con icona custom in fase di design)* |
| 11 | Semi di sesamo | ⚪ *(approssimazione, come sopra)* |
| 12 | Anidride solforosa e solfiti (>10mg/kg) | 🍷 *(approssimazione — associazione comune ma non esclusiva)* |
| 13 | Lupini | 🫘 *(approssimazione, condivisa concettualmente con legumi)* |
| 14 | Molluschi | 🐚 |

- Ogni ingrediente ottiene un campo `allergeni: []` (array di chiavi tra le 14 sopra), selezionabile in Gestione ingredienti tramite un **selettore multiplo** con le icone sopra — così quando si inserisce un ingrediente nuovo lo si classifica subito, senza doverci ripensare dopo.
- **Stile UI del selettore**: icona **bianca quando l'allergene è assente**, **verde quando è presente** — toggle diretto al click sull'icona stessa, dentro l'editor ingrediente (niente checkbox separate, l'icona È il controllo).
- **Per i ~133 ingredienti già esistenti**: non classificati a mano ora. Pianificato uno **script Python separato** (fuori da questa sessione/chat, da scrivere quando richiesto) che interroga fonti online per ciascun ingrediente e propone la classificazione allergeni automaticamente, poi Cwe verifica/corregge. Non è un'azione da fare dentro l'app — è uno script di supporto una tantum per popolare il campo su tutto il database esistente.
- Questo campo `allergeni: []` è la base dati che rende possibile B.1 (profilo allergie → blocco a cascata). Il blocco manuale B.2 non dipende da questo campo — è indipendente, ingrediente per ingrediente, qualunque sia (o non sia) la sua classificazione allergeni.

---

## 20. BUG DA CORREGGERE — modal coperto dalla tastiera mobile

**NOTA: solo istruzioni, nessun codice applicato/caricato.** Da correggere quando si sviluppa (questa sezione o un passaggio dedicato ai bug).

**Problema osservato da Cwe**: nell'editor ingrediente (`#modalIngrediente`, e potenzialmente ogni altro modal con lo stesso pattern), su mobile la tastiera virtuale copre il campo che si sta compilando — "compilazione alla cieca".

**Causa individuata nel codice**: `.modal-overlay` è `position:fixed; inset:0; display:flex; align-items:flex-end` (bottom sheet), `.modal` ha `max-height:88vh`. Quando appare la tastiera su mobile, è il **visualViewport** a restringersi, non il layout viewport — un elemento `position:fixed` non si riadatta da solo, quindi il modal resta ancorato alla vecchia altezza e la tastiera copre la parte bassa (dove tipicamente si trova il campo appena toccato).

**Correzione proposta** (due parti indipendenti, entrambe necessarie):
1. Ascoltare `window.visualViewport` (eventi `resize`/`scroll`) e riadattare dinamicamente altezza (`height`) e posizione (`top`) di ogni `.modal-overlay:not(.hidden)` allo spazio effettivamente visibile.
2. Su `focusin` di un campo (`input`/`select`/`textarea`) dentro `.modal`, chiamare `scrollIntoView({block:'center', behavior:'smooth'})` con un piccolo ritardo (~300ms, la tastiera impiega un istante ad aprirsi/animarsi).

**Portata**: la correzione è generica (si applica a `.modal-overlay`/`.modal` come classe CSS, non solo a `#modalIngrediente`) — risolverebbe lo stesso problema su ogni modal esistente che usa quel pattern, non solo quello ingredienti. Va verificato in fase di sviluppo se questo effetto collaterale positivo è desiderato ovunque o se va limitato solo a `#modalIngrediente`.

---
