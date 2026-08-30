# DietaPlanner — Piano vincolante: root applicativa con nuovo database

**Decisione definitiva di Cwe — 30 agosto 2026**

## Struttura fisica vincolante

- La root è l'unica area applicativa e di sviluppo corrente.
- `Vecchia versione 1.0/` è un archivio non operativo: nessun file della root
  può dipendere da un percorso interno a tale cartella.
- Non esiste più una cartella applicativa parallela `nuovo-ricettario/`: i suoi
  file correnti sono stati promossi nella root.
- Test e strumenti che lavorano sul vecchio schema restano nell'archivio e non
  costituiscono verifica della nuova applicazione.

La collocazione dei file e l'integrazione dei Lotti A–F sono state verificate.
Lo stato dimostrato e i confini ancora aperti sono mantenuti in
`STATO_LOTTI_E_TEST.md`.

## Architettura

- L'applicazione continua a essere sviluppata nella root.
- Resolver, Setting nutrizionista, Set utente, generazione, interfaccia e test appartengono alla root.
- Il vecchio `ricette.json` è escluso dal nuovo motore.
- Le uniche sorgenti catalogo ammesse sono:
  - `db-ricette.json`;
  - `ingredienti-new.json`.
- `motor-v12.js` costituisce il motore/adattatore versionato per il formato a gruppi e va integrato nella root senza ripristinare la pipeline del vecchio ricettario.

## Stato reale dei lotti

| Lotto | Stato nella root | Vincolo successivo |
|---|---|---|
| A — baseline | verificato sulla nuova root | preservare test e fonti |
| B — resolver | verificato | usare un'unica configurazione canonica |
| C — motore nutrizionale | verificato su `motor-v12.js` | preservare atomicità e conteggi settimanali |
| D — Setting nutrizionista | verificato sulla nuova root | preservare assenza di mutazione ricette |
| E — Set utente | verificato con motor v12 | preservare AUTO/EXCLUDED/FIXED e restrizioni cliniche |
| F — catalogo | verificato sui dati correnti | conversioni future solo con conferma; nessuna patch al vecchio DB |
| G — generazione/manuale | verificato automaticamente | preservare quantità atomiche, residui e doppia priorità di deperibilità |
| UI ricette | implementata, contratto verificato | resta la prova visuale browser di righe C/P/V e Roll contestuali |
| H — stress test/release | in corso | automatico superato; browser reale e autorizzazione ancora necessari |
| I — profilo e primo avvio | da progettare con Cwe | login Google, storico personale e onboarding; nessuna implementazione prima della progettazione condivisa |

Le specifiche correnti dei Lotti G–H sono consolidate in
`SPECIFICA_FUNZIONALE_CORRENTE.md`, `ARCHITETTURA_MOTOR_V12.md` e
`REQUIREMENTS-MATRIX.md`.

## Lotto I — requisito registrato, non ancora progettato

Il lotto successivo dovrà integrare identità Google, isolamento e recupero
dello storico personale e una guida di primo avvio. La guida compilerà le
tabelle reali di Set per colazione ricorrente, carboidrati e proteine, quindi
presenterà le personalizzazioni avanzate e accompagnerà l'utente al Pasto
odierno spiegando righe C/P/V e Roll contestuali.

Prima di qualsiasi implementazione, Cwe deve essere avvisato e il flusso deve
essere progettato insieme: schermate, testi, domande, valori predefiniti,
salto/ripresa e rapporto tra accesso Google e modalità locale. Questo paragrafo
registra soltanto l'ambito e non autorizza scelte definitive di UX o backend.

## Regola anti-fallback

Se il nuovo database non copre una combinazione richiesta:

1. il test segnala la copertura mancante;
2. la ricetta viene convertita esplicitamente nel nuovo formato seguendo la metodologia;
3. fino ad allora il sistema non pesca dal vecchio database;
4. non si inventano ingredienti, compatibilità, gruppi, condimenti o testi.

## Pubblicazione

I commit di sviluppo non costituiscono una release. La root pubblicata può essere aggiornata soltanto dopo:

1. completamento dei lotti;
2. conversione sufficiente del ricettario;
3. test automatici;
4. stress test end-to-end;
5. autorizzazione esplicita di Cwe.
