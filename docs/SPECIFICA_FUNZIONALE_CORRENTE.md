# DietaPlanner — specifica funzionale corrente

**Stato:** fonte funzionale consolidata
**Data:** 2026-08-30

Questo documento raccoglie soltanto le decisioni ancora valide per la root
basata sul nuovo formato. In caso di conflitto nutrizionale prevale
`BASELINE_NUTRIZIONISTA_PDF_V1.md`; per il metodo di lavoro prevale
`AGENTS.md`.

## 1. Sorgenti e confini

- La root è l'unica applicazione attiva.
- Il motore attivo è `motor-v12.js`, API `DietaPlannerMotorV12`.
- I soli cataloghi attivi sono `db-ricette.json` e
  `ingredienti-new.json`.
- `Vecchia versione 1.0/` è archivio non operativo.
- Una copertura mancante nel nuovo ricettario non autorizza fallback al
  vecchio database.
- Nessuna pubblicazione prima del Lotto H e dell'autorizzazione esplicita di
  Cwe.

## 2. Configurazione nutrizionale

- `nutrition-config.js` è l'unico resolver dei vincoli.
- PDF, regole APP-CWE, Setting nutrizionista, profilo e Set utente restano
  livelli distinti.
- L'esclusione clinica prevale; il cap utente può solo restringere.
- I profili vegetariano e vegano eliminano le macro incompatibili senza
  inventare nuove frequenze.
- Il Setting non modifica mai ricette o ingredienti al salvataggio.
- La dose effettiva dipende da ingrediente e contesto: colazione, pasto
  principale o spuntino.

## 3. Carboidrati

- Pranzo e cena automatici richiedono una fonte di carboidrati, salvo pasto
  speciale o override esplicito.
- Il piano settimanale ordinario contiene 14 slot.
- Stati persistenti:
  - `AUTO`: riempimento casuale con sole voci prive di tetto PDF;
  - `EXCLUDED`: zero esplicito, mai proposto automaticamente;
  - `FIXED`: numero settimanale esatto scelto dall'utente.
- Gnocchi, pasta ripiena, gallette, crackers, friselle,
  taralli/grissini/crostini, piadina e sfoglia/brisée hanno tetto PDF 0–2.
- Un tetto non è un obiettivo: una voce limitata entra soltanto se scelta
  esplicitamente.
- Nessun fallback può riattivare una voce esclusa o superare un numero fisso.

## 4. Proteine

- Frequenze e limiti derivano dal resolver.
- Carne rossa, affettati/salumi/insaccati, pesce di grande taglia e pesce
  conservato hanno contatori settimanali di famiglia.
- Speck, pancetta, prosciutti, bresaola e tutte le salsicce contribuiscono al
  contatore affettati/insaccati.
- Tonno e sgombro conservati e salmone affumicato contribuiscono al pesce
  conservato anche quando non sono la proteina dominante della ricetta.
- Pasti preservati e consumi reali della settimana concorrono ai contatori.

## 5. Verdure e residuo quantitativo

- Pranzo e cena richiedono verdura secondo copertura strutturale.
- Patate non sono verdura; fagiolini, funghi e zucca lo sono. I piselli
  possono coprire occasionalmente il ruolo verdura secondo i dati.
- Porzione di riferimento: ortaggi 200–250 g; insalata 70–80 g.
- La copertura è quantitativa: la verdura contenuta in C, P, sugo o ricetta
  completa contribuisce per la propria frazione di porzione.
- La classe del catalogo distingue direttamente il ruolo della quota vegetale:
  `V` indica esclusivamente una vera porzione di verdura; `S` indica la quota
  vegetale parziale del sugo associato a un carboidrato; `G` indica la quota
  vegetale parziale usata come guarnizione o condimento di una proteina.
- La conversione dei template è esplicita e non viene dedotta a runtime:
  una ricetta oggi classificata `P+V` diventa `P+G` quando la verdura è una
  guarnizione parziale; una ricetta oggi classificata `C+V` diventa `C+S`
  quando la verdura è un sugo parziale. `V` resta presente soltanto quando la
  quantità vegetale costituisce realmente una porzione completa.
- `S` e `G` non soddisfano mai da soli e per semplice presenza del token il
  requisito `V`. Il bilancio resta quantitativo:
  `V_residuo = max(0, V_richiesta - S - G - V_presente)`.
- Nei piatti freddi composti con verdure, la quantità di verdura interna
  coincide con la porzione completa prevista: il piatto copre quindi `V` e non
  deve ricevere automaticamente un ulteriore contorno o residuo.
- Le insalate fredde di cereali usano combinazioni vegetali valide a porzione
  totale piena e proteine consumabili senza ulteriore cottura. Per la famiglia
  corrente: tonno conservato, salmone affumicato, emmental, mozzarella, feta e
  tofu.
- Le verdure cotte o saltate non vengono associate ai cereali freddi: sono
  contorni per secondi di carne o pesce insieme alle verdure fresche. Risotto
  di zucca e zucca al forno restano ricette future da definire, non vanno
  inventate durante questa conversione.
- Si aggiunge soltanto il residuo necessario, mai una seconda porzione intera.
- Se il residuo è almeno 50 g, viene aggiunta una vera `V` dimensionata sul
  residuo. Se è inferiore a 50 g, non viene creato un contorno dedicato e il
  residuo, condizione che per costruzione implica la presenza contemporanea
  di `S` e `G`, viene redistribuito a metà tra i due. Non esiste un caso
  operativo sotto soglia con uno solo tra `S` e `G`. La redistribuzione
  modifica soltanto le quantità della
  realizzazione, mai il template del catalogo.
- Nei sughi di verdura le alternative definite restano opzioni fisse: gli
  ingredienti appartenenti a sughi diversi non vengono incrociati tramite
  prodotto cartesiano. Il sugo usa la dose parziale prevista e la
  realizzazione completa soltanto il residuo V mancante.
- La ricetta di cereale con piselli usa 1 uovo strapazzato e 60 g di piselli
  come sugo. Le due fonti costituiscono insieme una quota proteica; la frazione
  vegetale dei piselli concorre alla copertura e viene completato soltanto il
  residuo V.
- Il residuo è salvato come dato della realizzazione e propagato atomicamente
  a nutrizione, inventario, spesa e storico.

## 6. Programmazione settimanale e pasto odierno

Sono due meccaniche collegate ma distinte.

### Programmazione

- Non usa la giacenza come vincolo: deve poter programmare anche con
  inventario vuoto e creare il carrello necessario.
- Rispetta Set, frequenze, profilo, esclusioni, cap e coperture.
- Distribuisce verdure fresche con deperibilità diversa: quelle più delicate
  nei primi giorni, quelle più durevoli verso il fine settimana.
- Deve includere nel carrello una composizione di verdure che renda possibile
  quella distribuzione.
- La deperibilità è una priorità di ordinamento e composizione, non un divieto.
- La generazione automatica modifica soltanto giorni successivi a oggi.
- La settimana viene scritta solo quando tutti gli slot richiesti sono validi.
- La costruzione procede per singolo slot. Prima viene assegnata la classe
  proteica prevista da `tabellaGiornoCategoria`; il motore sceglie la
  realizzazione proteica ammessa e il relativo dettaglio di cottura o
  guarnizione `G`. Dopo viene applicato il carboidrato determinato dalla
  configurazione `AUTO/FIXED/EXCLUDED`; il motore sceglie la realizzazione
  compatibile e il relativo sugo `S`.
- Le combinazioni P+C gia dichiarate nel catalogo restano utilizzabili soltanto
  quando rispettano sia la proteina assegnata sia il carboidrato programmato;
  non acquisiscono priorità per il solo fatto di essere già combinate.
- Dopo P e C viene calcolato matematicamente il solo residuo `V`; quindi lo
  slot viene validato, chiuso e il motore passa al successivo.
- Sono vietati sia il prodotto cartesiano fra pool indipendenti sia un
  risolutore globale che ricompili l'intera settimana in un'unica ricerca.
- Gli esempi forniti durante diagnosi e revisione servono a dimostrare una
  violazione, non diventano filtri nominativi o correzioni selettive nel codice.

### Pasto odierno

- Ricorda il pasto programmato come riferimento nutrizionale.
- Può proporre alternative compatibili con il piano del giorno.
- Usa davvero inventario, quantità disponibili, scadenze, avanzi e
  deperibilità per evitare sprechi.
- Se esiste verdura urgente la favorisce; se non esiste propone quella fresca
  prevista/acquistabile. L'assenza di scorta non blocca il pasto.
- La scelta diretta dell'utente resta finché l'utente non la cambia.
- Oggi resta modificabile manualmente fino alla relativa fascia oraria.

## 7. Piano, consumo e storico

- Piano committato, bozza, inventario, stock temporaneo di generazione e
  storico consumato sono stati distinti.
- Aprire una card non genera né salva automaticamente un pasto.
- La bozza diventa piano soltanto dopo conferma.
- Un consumo reale non viene riscritto da una rigenerazione futura.
- Un record passato non consumato non deve sopravvivere come piano futuro.
- Inventario e storico vengono aggiornati sul consumo reale, non sulla sola
  proposta.
- I piatti speciali non scaricano inventario quando il loro dato strutturale
  dichiara che non lo richiedono.

## 8. Ricette e varianti

- Le ricette sono template a quattro gruppi; i gruppi non-Condimenti si
  espandono per prodotto cartesiano.
- I Condimenti costituiscono un catalogo di varianti e non moltiplicano il
  numero delle combinazioni base.
- Le compatibilità dei condimenti sono definite per singolo ingrediente.
- La rotazione automatica usa globalmente il condimento meno recente fra
  quelli compatibili.
- Il roll manuale non genera un nuovo pasto completo:
  - C cambia soltanto gli slot carboidrato compatibili;
  - P cambia soltanto ingrediente/cottura proteica compatibile;
  - V cambia soltanto verdura/condimento compatibile.
- `Proponi nuovo pasto` è l'azione separata che sostituisce l'intero pasto.

## 9. Interfaccia compatta C/P/V

In Programmazione e Pasto, pranzo e cena devono essere mostrati su righe
separate:

- icona Carboidrato: ricetta/ingrediente e condimento previsto;
- icona Proteina: ricetta/ingrediente e cottura prevista;
- icona Verdura: ricetta/ingrediente e cottura o condimento previsto.

A destra di ogni riga compare il Roll contestuale, attivo soltanto quando
esiste una variante reale. Le tre righe non devono essere ricostruite come un
flusso testuale continuo.

## 10. Menu, bozza e comandi

- La pagina Menu deve lavorare su una vera bozza separata dal piano
  committato.
- `Annulla` scarta la bozza; `Resetta` svuota bozza e blocchi prima di
  rigenerare; `Rigenera` rispetta i blocchi; `Salva` committa atomicamente.
- Chiudere o cambiare vista senza Salva non modifica il piano.
- La navigazione prevista è un carosello di settimane, una settimana per
  schermata, non limitato a questa/prossima.
- Il consumo automatico è un fatto reale e non resta sospeso nella bozza.

## 11. Ricerca diretta e sicurezza

- La ricerca manuale è distinta dall'estrazione casuale; a campo vuoto non
  mostra risultati e durante la digitazione mostra al massimo i primi cinque
  risultati pertinenti alla categoria selezionata.
- La scelta manuale può cambiare liberamente alimento dentro la macrocategoria,
  ma allergie, esclusioni cliniche e blocchi di sicurezza restano HARD.
- Le preferenze di gusto e stagionalità producono priorità o avvisi, non
  riattivano ingredienti clinicamente esclusi.
- Gli allergeni derivano dagli ingredienti strutturati; un campo ricetta può
  essere soltanto cache derivata.

## 12. Colazione, spuntini e speciali

- Colazione ordinaria: carboidrato complesso e proteina richiesti; grassi,
  carboidrati semplici e frutta facoltativi.
- I limiti di colazione e spuntino restano contestuali, non diventano cap
  globali dell'ingrediente.
- Il contatore della colazione morigerata aumenta al consumo di una colazione
  regolare; grassi o carboidrati semplici lo azzerano. Al raggiungimento di 7
  viene mostrata la proposta speciale e il contatore si azzera al consumo
  successivo, qualunque sia la composizione scelta. Reset consumi lo azzera.
- I piatti speciali sono scelti deliberatamente, restano fuori dal bilancio
  ordinario e non scaricano inventario quando marcati
  `nonRichiedeInventario`.

## 13. Reset e responsive

- Reset piano non cancella lo storico consumato.
- Reset storico è un'azione separata ed esplicita.
- I reset che coinvolgono un pasto puliscono anche le relative bozze in
  memoria, compreso ogni flag di generazione forzata.
- Su Android i modal devono adattarsi al `visualViewport`; il campo attivo va
  riportato nell'area visibile quando compare la tastiera.
- La configurazione nutrizionista deve restare utilizzabile entro la larghezza
  del display mobile e non produrre tabelle fuori schermo.

## 14. Account e dati personali

- All'avvio senza una scelta precedente, l'app chiede prima l'accesso Google;
  si entra senza account soltanto scegliendo esplicitamente la modalità locale.
- La scelta locale vale soltanto per l'apertura corrente e non viene
  memorizzata: a ogni nuovo avvio senza sessione Google l'app ripropone
  l'accesso.
- La sessione Google è persistente e resta valida ai riavvii finché l'utente
  non preme esplicitamente `Esci dall'account`; soltanto la modalità locale
  termina alla chiusura o al riavvio dell'app.
- La futura whitelist delle email autorizzate e le funzioni ridotte per utenti
  non autenticati o locali restano da definire con Cwe prima di implementarle.
- Ogni finestra sovrapposta che attende una risposta attenua e sfoca il
  contenuto sottostante, mantenendo nitido il pannello attivo. Lo stesso
  linguaggio visivo verrà riutilizzato nella futura guida di benvenuto.
- Il profilo cloud usa l'UID Firebase come confine di sicurezza; un utente può
  leggere e scrivere soltanto i documenti sotto `users/{uid}`.
- Il primo collegamento non sovrascrive né importa automaticamente IndexedDB.
- La sincronizzazione completa e lo storico relazionale vengono attivati solo
  dopo avere definito migrazione, conflitti e tracciamento degli eventi.

## 15. Criteri di chiusura

- Ogni vincolo funzionale deve avere un test automatico.
- DOM e IndexedDB richiedono anche prova browser reale.
- Nessuna release finché quantità atomiche, programmazione/pasto odierno,
  migrazioni e stress test non sono verificati end-to-end.
- La sequenza e l'esito dei controlli pre-release sono registrati in
  `LOTTO_H_CHECKLIST_RELEASE.md`.
