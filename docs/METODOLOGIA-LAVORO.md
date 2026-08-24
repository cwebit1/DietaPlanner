# METODOLOGIA E ISTRUZIONI DI LAVORO — DietaPlanner

> Questo file raccoglie le regole di lavoro che Cwe ha dato durante le
> sessioni di correzione (dopo l'audit iniziale). Leggerlo **sempre**,
> insieme a `AGENTS.md`, prima di proporre o applicare qualunque modifica.
> Non sono regole del prodotto (quelle sono in `REGOLE_FLUSSO_LOGICO.md`) —
> sono regole su **come io (Claude) devo lavorare** su questo progetto.

## Obiettivo dichiarato del lavoro di correzione

Cwe ha definito esplicitamente l'obiettivo di questa fase: rendere
DietaPlanner **"un sistema matematico a prova di errore statistico"**. Non
si tratta di sistemare bug isolati uno a uno senza contesto — ogni
correzione deve rendere il sistema nel suo complesso più coerente e
verificabile, non solo il singolo punto toccato.

## Regole di lavoro concordate (in ordine cronologico di quando sono state date)

1. **Ottimizzare, ma sempre segnalando prima.** Se, sistemando un punto,
   emerge la possibilità di correggere anche un'altra criticità già in
   elenco (o di ottimizzare qualcosa di collegato), **va sempre segnalato
   a Cwe prima di agire** — mai inglobato in automatico in una correzione.
   Cwe decide se estendere lo scope o tenere le cose separate.

2. **Sincronia dati↔logica — è la regola più importante.** `ricette.json`
   (e gli altri dati) e la logica applicativa (motor.js, engine-core.js,
   index.html) sono due facce della stessa cosa e **vanno sempre valutati
   insieme**, mai uno senza l'altro. Prima di correggere una regola di
   generazione, verificare sempre se i dati sottostanti sono coerenti con
   quella regola — e viceversa. Un fix di codice scritto senza controllare
   i dati reali (o un fix di dati senza controllare come il codice li
   userà) rischia di introdurre un nuovo disallineamento invece di
   risolverne uno.

3. **Riconoscere i piatti già completi, non forzare un primo pieno sopra.**
   Se una ricetta ha già in copertura sia un token proteico (PC/PP/PF/PU/PL)
   sia C (carboidrato), **quel pasto è già completo sul fronte
   proteina+carboidrato** — il motore non deve aggiungere un altro primo
   intero sopra. Motivazione esplicita di Cwe: forzare un primo pieno in
   più "costringe l'utente a un primo troppo corposo per essere un primo",
   quando in realtà la ricetta può benissimo avere già i nutrienti/calorie
   del piano dietetico con anche solo 20g in più della proteina prevista,
   senza bisogno di un secondo carboidrato separato.

4. **Il nome della ricetta deve corrispondere esattamente a ciò che la
   sigla matematica riconosce — mai promettere più di quanto la copertura
   confermi.** Se una ricetta si chiama "... con verdure" ma la quantità di
   verdura contenuta non raggiunge la soglia che fa scattare il token V
   (70g insalata / 200g altri ortaggi), il nome va corretto togliendo il
   riferimento fuorviante — **non aggiungendo altra verdura reale per
   giustificarlo**, a meno che non sia una scelta esplicita. Motivo dato da
   Cwe: `ricette.json` è "un mix di più versioni mai standardizzato ad una
   sola" — l'obiettivo di questa fase è correggere proprio questo, non
   accumulare altre eccezioni. L'ingrediente vero (es. radicchio, peperoni)
   resta comunque nella ricetta per il conteggio nutrienti/calorie — si
   tocca solo il nome, non gli ingredienti, quando la correzione è di
   questo tipo.

5. **Salvare sempre, subito, quello che si analizza e si decide — non solo
   a fine sessione.** Regola data esplicitamente da Cwe: "l'incoerenza si
   risolve con la logica" — cioè con la documentazione scritta, non con la
   memoria della conversazione. Ogni volta che una discussione porta a una
   decisione architetturale o di merito (non solo un fix puntuale), va
   salvata in un file nel repo **appena la decisione è presa**, non
   rimandata a "quando è tutto pronto". Se la decisione è ampia (cambia il
   modello, non solo un dettaglio), merita un documento dedicato — vedi
   `NUOVA-ARCHITETTURA-MOTORE.md` come esempio di come è stato fatto per
   la riprogettazione del motore di generazione deciso il 2026-08-23/24.

## Metodo di verifica (eredità dell'audit iniziale, resta valido)

Ogni correzione va verificata **dal vivo**, non solo letta nel codice:
ambiente Playwright/Chromium headless già pronto e collaudato (vedi
`AUDIT-STATO-LAVORO.md` → Metodologia), profilo persistente per IndexedDB
vera. Prima e dopo ogni fix: screenshot/dump dei dati reali, non solo
ragionamento teorico sul codice. Il fix di A1 è stato verificato così
prima del push.

## Workflow operativo per ogni correzione (ricapitolando quanto già in AGENTS.md + quanto emerso in pratica)

1. Rileggere `AUDIT-STRUTTURA-LOGICA.md` per la causa radice già isolata
   (se il punto è già stato auditato) e le "peculiarità da rispettare".
2. Se la correzione tocca `ricette.json`: applicare le regole 2, 3, 4 sopra
   — verificare dati E logica insieme, non solo uno dei due.
3. Proporre lo scope esatto a Cwe (cosa cambia, cosa resta invariato,
   eventuali domande di merito aperte) **prima** di applicare.
4. Applicare la modifica minima concordata.
5. Validare sintassi (`node --check` sui file .js toccati).
6. Verificare dal vivo con l'harness Playwright (scenario del bug +
   scenario già funzionante, per escludere regressioni).
7. `git diff` di controllo — solo i file del compito autorizzato.
8. Commit descrittivo + push (token GitHub fornito da Cwe, va sempre
   mascherato negli output/log, mai stampato in chiaro).
9. Aggiornare `AUDIT-STATO-LAVORO.md` (e gli altri report se pertinente)
   segnando il punto come risolto, con riferimento al commit.
