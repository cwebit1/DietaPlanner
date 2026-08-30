# DietaPlanner — piano di ricostruzione integrale [SUPERATO]

> Piano storico sostituito da `PIANO_REVISIONE_ROOT_NUOVO_DB.md`. Non usarlo
> per stabilire file, ordine dei lotti o stato corrente.

## 1. Fonti e precedenza

1. `REGOLE_FLUSSO_LOGICO.md` è la fonte dominante per il comportamento.
2. Il piano nutrizionale/PDF determina frequenze, porzioni e valori preimpostati della configurazione nutrizionista.
3. `ingredienti_lavoro.json` è una sorgente di lavoro da validare e convertire nello schema reale dell'app.
4. L'`index.html` corrente è lo scheletro grafico e funzionale da integrare; la grafica non cambia salvo necessità esplicite.
5. Il codice legacy serve solo per ricostruire contratti e compatibilità, non come fonte della nuova logica.

In caso di conflitto prevale l'ordine sopra. Le decisioni più recenti dentro `REGOLE_FLUSSO_LOGICO.md` prevalgono sulle descrizioni storiche del vecchio piano di lavoro.

## 2. Strategia di sviluppo

- Un solo motore reale: `motor.js`.
- Nessun override duplicato in fondo al file.
- Logica pura separata da IndexedDB e DOM quando possibile.
- Adattatori espliciti tra schema JSON, IndexedDB e motore.
- Ogni componente nasce con test automatici prima dell'integrazione.
- La versione pubblicata resta utilizzabile fino al collaudo della sostituzione.
- Backup Git tramite commit/tag; nessun archivio ZIP duplicato nella release finale.

## 3. Fase A — specifica eseguibile e audit

### A1. Matrice requisiti

Trasformare ogni regola del documento dominante in un requisito numerato con:

- input;
- output;
- priorità HARD/SOFT;
- fallback;
- stato persistente o di sessione;
- funzione responsabile;
- test associato.

### A2. Audit del codice reale

Inventariare:

- funzioni globali chiamate da `index.html`;
- funzioni esportate/ridefinite da `motor.js`;
- store IndexedDB e loro schema effettivo;
- chiavi di `impostazioni`;
- riferimenti a ogni file del repository;
- duplicati, override e codice morto;
- formato reale di `ingredienti.json`, `varianti` e `ricette.json`.

### Gate A

- Nessuna regola senza responsabile.
- Nessuna API UI necessaria dimenticata.
- Elenco documentato dei file candidati alla rimozione, senza ancora eliminarli.

## 4. Fase B — schema dati definitivo

### B1. Ingredienti

Definire schema canonico con almeno:

- identità e nome;
- gruppo e sottotipo;
- porzione e unità;
- deperibilità/conservazione;
- gradimento;
- allergeni;
- blocco manuale;
- eventuale `nonRichiedeInventario`;
- formato di riordino.

Convertire `ingredienti_lavoro.json` nello schema realmente consumato dall'app senza perdere i riferimenti delle varianti.

### B2. Ricette

Validare e completare:

- `copertura` granulare (`PC`, `PP`, `PF`, `PU`, `PL`, `C`, `V`);
- `richiedeCottura` per pranzo/cena;
- `soloManuale`;
- `piattoSpeciale`;
- quantità coerenti con le porzioni del piano nutrizionale;
- ingredienti tutti risolvibili nello schema canonico.

### B3. Stato applicativo

Separare formalmente:

- piano committato;
- bozza menù;
- inventario fisico;
- stock temporaneo della singola generazione;
- storico immutabile dei consumi;
- proposto originale e consumato reale;
- configurazione nutrizionista;
- configurazione utente.

### Gate B

- Validazione JSON e referenziale completa.
- Nessun ingrediente di ricetta senza base/variante valida.
- Migrazione IndexedDB idempotente e testata.

## 5. Fase C — nuovo motore puro

Costruire da zero moduli logici testabili per:

1. configurazione effettiva e valori predefiniti;
2. filtri hard: allergie, blocco manuale, esclusioni esplicite;
3. filtri soft con fallback e segnalazione sforo;
4. frequenze macro e cap dei sottotipi;
5. griglia proteica settimanale;
6. griglia carboidrati completa sui 14 slot;
7. stock anti-ripetizione per singola generazione;
8. selezione proteina-first;
9. adattamento del carboidrato dopo la proteina;
10. interpretazione della copertura P/C/V;
11. affettati→pane;
12. secondo con patate→`unico_completo`;
13. verdure per porzione, livello di freschezza, alternanza e regole hard;
14. priorità Salvafrigo automatica;
15. poco tempo tramite `richiedeCottura` e copertura;
16. esclusione automatica delle ricette `soloManuale`;
17. storico/rotazione da consumi reali;
18. bilancio che esclude i piatti speciali;
19. generazione automatica solo per giorni `> todayISO()`;
20. lista della spesa calcolata contestualmente sulle carenze esatte.

Il motore espone un'API unica e documentata. Un sottile livello di compatibilità mantiene temporaneamente le firme richieste dall'UI, senza duplicare la logica.

### Gate C

- Test unitari per tutte le regole.
- Test deterministici con generatore casuale iniettato/seeded.
- Test di proprietà su centinaia di settimane generate.
- Nessuna ripetizione vietata e nessun giorno automatico ≤ oggi.

## 6. Fase D — configurazione nutrizionista

Creare bridge con fallback per tutti i parametri realmente configurabili:

- frequenze proteiche e cap sottotipi;
- massimo due fonti proteiche al giorno;
- porzioni e struttura carboidrati;
- tetti spuntini e colazioni speciali;
- frutta giornaliera;
- cooldown;
- olio per pasto;
- fasce orarie;
- tetti personalizzati per ingrediente.

Il target calorico non è un campo configurabile: resta eventualmente una stima derivata. I range del piano nutrizionale sono visibili come contesto; il default parte dal minimo del range quando stabilito dalle regole.

### Gate D

- Ogni campo salva, ricarica e influenza davvero il motore.
- Reset ai default verificati.
- Nessuna costante viva che bypassi il bridge.

## 7. Fase E — integrazione UI progressiva

Ordine di cablaggio:

1. editor ingredienti, allergeni e blocchi;
2. Set proteine e carboidrati con Pulisci/Completa/Casuale/Salva e origine celle;
3. pannello Pasto con sole tab Pasto/Speciale;
4. roll di Proteina/Carboidrato/Verdura con conservazione della macrocategoria;
5. Salvafrigo per ogni componente pertinente;
6. ricerca diretta “Cosa ti va di mangiare oggi?”;
7. storico consumato reale e proposto originale;
8. avvisi quasi-esaurito senza esclusione;
9. fix generico della tastiera mobile sui modal;
10. configurazione avanzata.

### Gate E

- Test DOM degli handler critici.
- Nessuna scrittura involontaria nel piano committato.
- Nessuna scelta diretta persa dopo un roll su un'altra componente.

## 8. Fase F — Menù e bozza reale

Implementare un vero write-buffer della settimana, non un rollback a snapshot:

- apertura da piano committato;
- modifiche soltanto in bozza;
- Annulla scarta la bozza;
- Resetta svuota bozza e lucchetti, poi rigenera;
- Rigenera rispetta i lucchetti;
- Salva committa atomicamente;
- carosello multi-settimana;
- generazione automatica solo da domani;
- oggi modificabile manualmente finché la fascia non è superata;
- passato in sola lettura;
- lista spesa basata sul piano committato o su anteprima esplicitamente indicata.

### Gate F

- Test di isolamento bozza/committato.
- Chiusura senza Salva non modifica IndexedDB.
- Consumo automatico resta reale e indipendente dalla bozza futura.

## 9. Fase G — collaudo integrato

- Validazione sintattica di tutti gli script.
- Test schema e migrazioni.
- Test generazione settimanale con Set vuoto, parziale e completo.
- Test inventario vuoto, parziale, quasi esaurito, scadenza e freezer.
- Test allergie e blocchi hard in ogni percorso, inclusa ricerca diretta.
- Test colazioni, spuntini, speciali, premio Budino e swap pranzo/cena.
- Test reset: piano, settimana, storico e inventario.
- Test grafici e frequenze dopo reset del piano.
- Test responsive reale con tastiera mobile.
- Test PWA/service worker e aggiornamento cache.

## 10. Fase H — cleanup e pubblicazione

Solo dopo tutti i gate:

- rimuovere motori v9/v10 e altri file non referenziati;
- rimuovere ZIP e chunk di esportazione obsoleti dopo verifica;
- consolidare documentazione, mantenendo regole dominanti e manuale tecnico finale;
- aggiornare `sw.js` con la nuova lista cache/versione;
- aggiornare manifest soltanto se necessario;
- creare release/tag stabile;
- pubblicare GitHub Pages;
- verificare il link web senza cache;
- consegnare report test, commit e link applicazione.

## 11. Regola di avanzamento

Una fase passa a completata solo quando il relativo gate è dimostrato. “Codice presente” non significa “funzione completata”. Ogni regressione blocca il passaggio alla fase successiva.
