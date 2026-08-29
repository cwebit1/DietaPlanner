# Istruzioni operative DietaPlanner

- Prima di modificare il progetto, rileggere integralmente le sezioni pertinenti di `docs/REGOLE_FLUSSO_LOGICO.md`.
- Per qualsiasi intervento su nutrizionista, Set utente, frequenze, quantità, limiti alimentari, `motor.js`, `engine-core.js`, `ingredienti.json` o `ricette.json`, rileggere anche `docs/BASELINE_NUTRIZIONISTA_PDF_V1.md`. Per i dati nutrizionali verificati sul PDF, questa baseline prevale su commenti/costanti legacy in conflitto, salvo istruzione successiva esplicita dell'utente.
- Dopo il Lotto B, rileggere anche `docs/LOTTO_B_RESOLVER.md`: `nutrition-config.js` è il resolver canonico dei vincoli. Non duplicare in `index.html`, `motor.js` o `engine-core.js` una seconda logica di precedenza, limiti PDF/User/Nutrizionista, semantica carboidrati AUTO/0/FISSO o residuo verdura.
- Implementare esclusivamente quanto richiesto e autorizzato dall'utente.
- Non modificare dati, valori predefiniti, ricette, ingredienti, quantità, versioni o logiche adiacenti senza un'istruzione esplicita.
- Gli esempi grafici o numerici non diventano vincoli funzionali.
- Se una modifica ulteriore sembra necessaria, fermarsi, descriverla e chiedere autorizzazione prima di applicarla.
- I vincoli nuovi devono essere funzionali e verificati, non soltanto rappresentati nell'interfaccia.
- Prima del push, controllare diff, sintassi e test; pubblicare solo i file appartenenti al compito autorizzato.
