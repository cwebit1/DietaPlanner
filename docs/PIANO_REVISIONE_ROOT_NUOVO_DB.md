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

## Fase successiva alla stabilizzazione — catalogo visuale e descrittivo

Questa fase potrà iniziare soltanto dopo la chiusura delle correzioni
funzionali, delle migrazioni ancora aperte e delle relative verifiche reali.
Non fa parte del motore nutrizionale e non deve essere usata per correggere o
completare dati funzionali.

L'obiettivo è affiancare ai cataloghi funzionali un archivio visuale e
descrittivo separato, collegato tramite gli stessi identificatori stabili:

- ogni ID ricetta concreta può risolvere una fotografia e una ricetta
  testuale (ingredienti leggibili e passaggi di preparazione);
- ogni `variantId` ingrediente può risolvere una fotografia dell'ingrediente;
- lo stesso ID consente all'app di richiedere i dati funzionali, i contenuti
  visuali oppure entrambi, senza duplicare o fondere le due responsabilità.

Vincoli architetturali:

1. `db-ricette.json` e `ingredienti-new.json` restano le sole sorgenti dei
   dati usati da motore, nutrizione, frequenze, inventario, spesa e storico.
2. Il catalogo parallelo contiene soltanto ID, fotografia e contenuto
   descrittivo; non contiene classi, categorie, C/P/V/S/G, frequenze, limiti,
   quantità nutrizionali o compatibilità.
3. I collegamenti avvengono esclusivamente tramite ID, mai tramite nomi.
4. Le immagini restano file esterni ottimizzati; il catalogo conserva il
   relativo percorso e non incorpora immagini base64.
5. L'assenza di un contenuto visuale non blocca generazione o uso della
   ricetta: il sottosistema funzionale resta autonomo.
6. Il catalogo visuale viene caricato soltanto dalle viste che lo richiedono e
   non appesantisce l'inizializzazione o le interrogazioni del motore.
7. I contenuti prodotti esternamente ricevono soltanto l'ID necessario e le
   informazioni testuali indispensabili alla foto/ricetta; non possono
   modificare né restituire dati funzionali.

Prima dell'implementazione dovranno essere definiti e approvati: schema del
catalogo, strategia di sincronizzazione con IndexedDB, formato e dimensioni
delle immagini, comportamento del fallback, controllo di copertura degli ID e
integrazione progressiva nelle viste Ricette, Pasto e Menu. La produzione
massiva delle immagini inizierà soltanto dopo la validazione di un campione.

### Separazione operativa tra restyling e integrazione tecnica

Il lavoro è diviso in due sessioni con responsabilità non sovrapposte.

La sessione dedicata al restyling grafico realizza esclusivamente:

- la nuova interfaccia della PWA;
- le card fotografiche dei pasti;
- lo swipe orizzontale e gli indicatori di posizione;
- il fallback grafico;
- dimensioni, proporzioni e comportamento responsivo;
- immagini dimostrative caricate mediante percorsi statici diretti.

Durante il restyling, le immagini sono soltanto segnaposto visuali: non sono
associate alle ricette tramite nome o ID e non costituiscono collegamenti
funzionali definitivi.

Questa sessione tecnica non modifica il restyling. Dopo la chiusura delle
correzioni funzionali, dovrà progettare e implementare con Claude:

1. lo schema definitivo del database visuale;
2. il collegamento tra ricette concrete e contenuti visuali esclusivamente
   tramite ID;
3. il collegamento tra `variantId` e fotografie degli ingredienti;
4. la sincronizzazione o il caricamento tramite IndexedDB;
5. la verifica della copertura degli ID;
6. la risoluzione del percorso fotografico corretto per ogni ricetta;
7. la restituzione del fallback quando fotografia o descrizione mancano;
8. l'uso di fotografia e testo soltanto nelle viste Ricette, Pasto e Menu; il
   motore legge all'avvio esclusivamente il flag gestionale `disponibile`.
9. la gestione del booleano `disponibile` per ogni ID concreto, con esclusione
   dalle nuove proposte senza cancellazione del record.

Quando il database visuale sarà pronto, sostituirà soltanto la sorgente delle
immagini statiche prevista dal componente grafico. Struttura, swipe,
indicatori e comportamento responsivo dell'interfaccia resteranno invariati.

Restano vincolanti tutti i confini architetturali elencati sopra: archivio
visuale separato da quello funzionale; contenuto limitato a ID, percorso
immagine, testo descrittivo e flag gestionale `disponibile`; collegamenti mai basati sui nomi; immagini
esterne ottimizzate e mai Base64; il motore ignora foto e testi e usa soltanto
il flag leggero di disponibilità;
nessun accesso al vecchio `ricette.json`; assenza di contenuti visuali sempre
non bloccante.

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
