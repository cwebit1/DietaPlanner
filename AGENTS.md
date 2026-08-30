# Istruzioni operative DietaPlanner

## Percorso di sviluppo e ricettario vincolante

- Lo sviluppo dei Lotti della revisione prosegue esclusivamente sui file applicativi della **root** del repository (`index.html`, `nutrition-config.js`, `engine-core.js`, `motor-v12.js`, `db-ricette.json`, `ingredienti-new.json` e relativi test/documenti). Non deve esistere né essere ricreata una seconda cartella applicativa parallela.
- **DIVIETO ASSOLUTO DI USARE IL VECCHIO DATABASE `ricette.json` COME SORGENTE DEL MOTORE O DELLA REVISIONE.** Il file può essere letto soltanto come riferimento storico durante una conversione espressamente autorizzata; non va corretto, esteso, assunto come catalogo corrente né collegato a nuove funzioni.
- Il solo database ricette destinato al sistema finale è `db-ricette.json`, nel nuovo formato a gruppi. Il relativo catalogo ingredienti è `ingredienti-new.json`.
- Ogni integrazione della root deve leggere il nuovo formato tramite il motore/adattatore dedicato; non deve riconvertire silenziosamente le ricette nel vecchio schema e non deve aggiungere fallback al vecchio `ricette.json`.
- La conversione sufficiente alla release v2 è conclusa. L'assenza futura di una ricetta nel nuovo database non autorizza a recuperarla dal vecchio database: va lasciata come copertura mancante fino alla sua conversione esplicita secondo `docs/METODOLOGIA-CONVERSIONE-RICETTE.md`.
- Le modifiche dei lotti possono essere preparate e testate nella root locale, ma **non devono essere pubblicate sull'app usata dagli utenti** finché conversione, integrazione e stress test finale non sono conclusi e Cwe non autorizza esplicitamente la release.

- Prima di modificare il progetto, rileggere integralmente le sezioni pertinenti di `docs/SPECIFICA_FUNZIONALE_CORRENTE.md`.
- Per qualsiasi intervento su nutrizionista, Set utente, frequenze, quantità, limiti alimentari, `motor-v12.js`, `engine-core.js`, `ingredienti-new.json` o `db-ricette.json`, rileggere anche `docs/BASELINE_NUTRIZIONISTA_PDF_V1.md`. Per i dati nutrizionali verificati sul PDF, questa baseline prevale su commenti/costanti legacy in conflitto, salvo istruzione successiva esplicita dell'utente.
- Prima di intervenire sul comportamento rileggere `docs/SPECIFICA_FUNZIONALE_CORRENTE.md`; per responsabilita dei moduli, realizzazioni e confini v12 rileggere `docs/ARCHITETTURA_MOTOR_V12.md`.
- `nutrition-config.js` è il resolver canonico. Non duplicare in `index.html`, `motor-v12.js` o `engine-core.js` una seconda logica di precedenza, limiti PDF/User/Nutrizionista, semantica carboidrati AUTO/EXCLUDED/FIXED o residuo verdura.
- I fallback che violano budget/cap non vanno reintrodotti; i conteggi settimanali devono includere consumi e pasti preservati; il residuo verdura va applicato atomicamente a realizzazioni, nutrizione, inventario, spesa e storico, senza scorciatoie sul catalogo.
- Setting e Set usano il resolver canonico: il Setting non riscrive ricette, i contesti colazione/pasto/spuntino restano separati e i cap personali possono soltanto restringere il piano clinico.
- Dopo il Lotto F, rileggere anche `docs/LOTTO_F_CATALOGO_NUOVO.md`: preservare le classificazioni verificate del catalogo nuovo, le decisioni utente su Riso/Farina 00/burro di arachidi e non confondere i metadati di deperibilita con la logica operativa del Lotto G.
- Dopo il Lotto G, rileggere anche `docs/LOTTO_G_GENERAZIONE_MANUALE_UI.md`: quantità e residuo appartengono allo snapshot della realizzazione; programmazione e pasto odierno usano priorità di deperibilità diverse; Roll e Salvafrigo devono ricalcolare atomicamente la copertura senza mutare i template.
- Usare `docs/STATO_LOTTI_E_TEST.md` come unica fonte dello stato di avanzamento e `docs/REQUIREMENTS-MATRIX.md` per il criterio di chiusura dei requisiti.
- I documenti marcati `[STORICO]`, `[STORICO 1.0]`, `[STORICO CONSOLIDATO]` o `[SUPERATO]` non sono fonti operative anche se nel testo conservano vecchie formule come "dominante" o "leggere per primo".
- Implementare esclusivamente quanto richiesto e autorizzato dall'utente.
- Non modificare dati, valori predefiniti, ricette, ingredienti, quantità, versioni o logiche adiacenti senza un'istruzione esplicita.
- Gli esempi grafici o numerici non diventano vincoli funzionali.
- Se una modifica ulteriore sembra necessaria, fermarsi, descriverla e chiedere autorizzazione prima di applicarla.
- I vincoli nuovi devono essere funzionali e verificati, non soltanto rappresentati nell'interfaccia.
- Prima del push, controllare diff, sintassi e test; pubblicare solo i file appartenenti al compito autorizzato.
