# DietaPlanner — matrice requisiti motor v12

| ID | Requisito corrente | Tipo | Responsabile | Verifica |
|---|---|---|---|---|
| SRC-01 | Root unica; nessuna dipendenza dall'archivio 1.0 | HARD | bootstrap/PWA | snapshot + source audit |
| SRC-02 | Solo `db-ricette.json` e `ingredienti-new.json` | HARD | `motor-v12.js` | snapshot + catalog test |
| SRC-03 | API motore versionata `DietaPlannerMotorV12` | HARD | `motor-v12.js` | integrazione Lotto C |
| CFG-01 | Unico resolver di PDF, APP, Setting, profilo e Set | HARD | `nutrition-config.js` | resolver test |
| CFG-02 | Esclusione clinica prevalente; cap utente solo restrittivo | HARD | resolver | resolver + Lotto E |
| CFG-03 | Setting non modifica cataloghi al salvataggio | HARD | UI Setting | Lotto D |
| CFG-04 | Quantità distinte per contesto | HARD | resolver/realizzazione | Lotto D + futuro Lotto G |
| CARB-01 | Quattordici slot C per la settimana ordinaria | HARD | resolver/motore | Lotto C |
| CARB-02 | AUTO usa soltanto voci senza tetto PDF | HARD | resolver/motore | resolver + Lotto C |
| CARB-03 | EXCLUDED non rientra tramite fallback | HARD | resolver/motore | resolver + Lotto C |
| CARB-04 | FIXED è un numero settimanale esatto | HARD | motore | Lotto C |
| CARB-05 | Tutti i carboidrati 0–2 della pagina 14 sono classificati | HARD | baseline/adattatore | snapshot + Lotto C |
| CARB-06 | Pasti preservati scalano il budget prima della generazione | HARD | motore | Lotto C |
| PROT-01 | Frequenze e profilo derivano dal resolver | HARD | resolver/motore | Lotto C/E |
| PROT-02 | Cap per carne rossa, affettati, pesce grande e conservato | HARD | motore | Lotto C/F |
| PROT-03 | Ingredienti secondari contribuiscono ai cap di famiglia | HARD | motore | Lotto C |
| PROT-04 | Vegetariano/vegano non ricevono override numerici inventati | HARD | resolver/motore | Lotto C |
| VEG-01 | Verdura richiesta a pranzo e cena | HARD | copertura/motore | Lotto G |
| VEG-02 | Copertura verdura quantitativa | HARD | resolver/realizzazione | engine test + Lotto G |
| VEG-03 | Aggiunta del solo residuo necessario | HARD | realizzazione | Lotto G |
| VEG-04 | Ortaggi e insalate usano porzioni distinte | HARD | catalogo/resolver | Lotto F + Lotto G |
| VEG-05 | Patate non sono verdura; classificazioni PDF preservate | HARD | catalogo | Lotto F |
| PLAN-01 | Programmazione indipendente dalla giacenza | HARD | generatore | Lotto G |
| PLAN-02 | Inventario vuoto produce piano e carrello, non blocco | HARD | generatore/spesa | Lotto G/H |
| PLAN-03 | Verdure delicate prima, durevoli dopo | SOFT obbligatoria | generatore | Lotto G/H |
| PLAN-04 | Carrello contiene varietà di durata coerente col menu | HARD | lista spesa | Lotto G/H |
| PLAN-05 | Generazione automatica soltanto da domani | HARD | motore/UI | Lotto G/H |
| PLAN-06 | Settimana salvata solo se ogni slot è valido | HARD | motore | Lotto C |
| TODAY-01 | Pasto odierno ricorda il programmato | HARD | UI/adattatore | Lotto G/H |
| TODAY-02 | Alternative odierne rispettano il piano nutrizionale | HARD | motore/UI | Lotto G/H |
| TODAY-03 | Scadenza, avanzo e deperibilità sono priorità positive | SOFT | Salvafrigo | Lotto G/H |
| TODAY-04 | Assenza di scorta non vieta una proposta | HARD | Salvafrigo | Lotto G/H |
| TODAY-05 | Scelta diretta persiste finché non viene cambiata | HARD | UI/bozza | Lotto G/H |
| DATA-01 | Ogni ingrediente ricetta risolve nel catalogo | HARD | catalog validator | Lotto F |
| DATA-02 | Categoria gruppo coerente con metadato ingrediente | HARD | catalog validator | Lotto F |
| DATA-03 | Unità `pz` restano a pezzi | HARD | resolver/materializzazione | snapshot + Lotto G |
| DATA-04 | Nessuna dose catalogo mutata dal Setting | HARD | UI/resolver | Lotto D |
| MEAL-01 | Piano, bozza e storico sono distinti | HARD | UI/IndexedDB | Lotto G/H |
| MEAL-02 | Un consumo reale non viene riscritto | HARD | storico | Lotto G/H |
| MEAL-03 | Inventario viene scalato sul consumo reale | HARD | consumo | Lotto G/H |
| MEAL-04 | Quantità condivisa da nutrizione/inventario/spesa/storico | HARD | realizzazione | Lotto G/H |
| ROLL-01 | Roll C modifica soltanto C compatibile | HARD | motor v12/UI | Lotto G/H |
| ROLL-02 | Roll P modifica soltanto P/cottura compatibile | HARD | motor v12/UI | Lotto G/H |
| ROLL-03 | Roll V modifica soltanto V/condimento compatibile | HARD | motor v12/UI | Lotto G/H |
| ROLL-04 | Roll disattivato senza alternativa reale | HARD/UX | motor v12/UI | Lotto G/H |
| COND-01 | Compatibilità condimento per ingrediente | HARD | catalogo/motore | catalog + motor test |
| COND-02 | Rotazione automatica evita ripetizione continua | SOFT obbligatoria | tracking v12 | motor + browser |
| UI-01 | Pranzo/cena mostrati su righe C/P/V | HARD/UX | UI | contratto + browser |
| UI-02 | Stessa struttura in Pasto e Programmazione | HARD/UX | UI | contratto + browser |
| UI-03 | Roll contestuale a destra di ciascuna riga | HARD/UX | UI | contratto + browser |
| UI-04 | Tastiera Android non copre il campo attivo | UX | viewport helper | browser reale |
| MIG-01 | Chiavi legacy leggibili senza reset distruttivo | HARD | adattatore IndexedDB | Lotto H |
| MIG-02 | Conteggi C legacy migrano in AUTO/FIXED correttamente | HARD | motor v12 | Lotto C + browser |
| PWA-01 | Cache include soltanto asset attivi | HARD | `sw.js` | source audit + browser |
| REL-01 | Nessuna release prima dello stress test | HARD | processo | stato lotti |
| REL-02 | Release soltanto con autorizzazione esplicita di Cwe | HARD | processo | checklist release |

## Criterio di chiusura

Un requisito è chiuso quando possiede almeno un controllo automatico. Se
coinvolge DOM, IndexedDB, responsive o service worker richiede anche una prova
browser reale. La presenza del codice o un test testuale non sono sufficienti.

## Evidenza Lotto H corrente

`tests/lotto-h-stress-migrations.test.js` copre settimane vuote/parziali/piene,
realizzazioni legacy, migrazione carboidrati e profili vegetariano/vegano.
`tests/lotto-h-pwa-source-contract.test.js` copre sorgenti attive, manifest,
icone, store IndexedDB e registrazione degli handler del service worker. I
requisiti marcati `browser` in tabella restano aperti fino a una sessione reale
raggiungibile; la release resta quindi bloccata.
