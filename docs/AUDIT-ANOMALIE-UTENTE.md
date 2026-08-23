# REPORT 1 — Anomalie osservate usando l'app come utente reale

Vedi `AUDIT-STATO-LAVORO.md` per metodologia generale e indice. Ogni punto
qui sotto ha un corrispondente in `AUDIT-STRUTTURA-LOGICA.md` (causa radice
nel codice) quando la causa è già stata isolata.

## §0. Configurazione di partenza usata per i test

Database fresco, primo avvio. In **Set**:
- **Impostazioni Carboidrati** → pulsante "Completa" (riempimento
  automatico) → poi "Salva". Risultato salvato in `configCarboidrati`:
  `pasta:1, pasta_fresca:2, riso:1, farro:1, orzo:1, cous_cous:2, pane:1,
  patate:1, polenta:2, friselle:0, gnocchi:0, pasta_ripiena:0, gallette:1,
  crackers:1, taralli:0, piadina:0, pasta_sfoglia:0` (totale 14, corretto).
- **Impostazioni Proteine** → pulsante "Completa" → poi "Salva". Risultato
  in `tabellaGiornoCategoria`: vedi §9 sotto per il dettaglio completo.
- Tutto il resto lasciato ai valori di default (nessuna modifica in
  Impostazioni Nutrizionista, nessun allergene, profilo "onnivoro").

Poi generazione del menù per la settimana successiva (24-30 agosto 2026,
tutti giorni futuri rispetto a "oggi" 23 agosto) — unica generazione
riuscita nei test, usata come base per le analisi seguenti.

---

## §1. "Genera menù" non produce nulla, senza alcun avviso — ✅ RISOLTO

> **Stato: corretto il 2026-08-23, commit `22fe067`.** Vedi
> `AUDIT-STATO-LAVORO.md` → "Correzioni applicate" per il dettaglio
> dell'intervento e della verifica. Testo originale del problema lasciato
> sotto per riferimento storico.

**Come riprodurlo:** al primo avvio dell'app (o comunque quando la
settimana visualizzata in "Piano"/"Menù" è quella che contiene la data di
oggi), premere il pulsante verde "Genera menù" nella card di benvenuto.

**Cosa succede:** il pulsante reagisce (naviga alla vista Menù), ma **non
viene generato nessun pasto** per pranzo/cena, per nessun giorno della
settimana visualizzata. Nessun messaggio di errore, nessun avviso, nessun
segnale che qualcosa non sia andato come previsto: l'interfaccia resta
identica a prima ("— non ancora programmato —" ovunque).

**Perché è un problema reale per Cwe (uso da mobile, in produzione):** è
altamente probabile che il primo utilizzo reale dell'app in una settimana
qualunque capiti un giorno che non sia lunedì. Se capita nella seconda metà
della settimana (o peggio, l'ultimo giorno), il pulsante principale
dell'app sembra semplicemente non funzionare — nessun indizio del perché.

**Verifica effettuata:** chiamata diretta della funzione di generazione dalla
console del browser, con la settimana 17-23 agosto (oggi=23):
```
risultato: { generati: [], errori: [] }
```
mentre la stessa identica chiamata sulla settimana successiva (24-30
agosto, tutti giorni futuri) produce 14 pasti pranzo/cena + 7 colazioni
correttamente.

**Causa radice:** vedi `AUDIT-STRUTTURA-LOGICA.md` §2.

---

## §2. Il budget carboidrati impostato in Set non viene rispettato

In Set, "Impostazioni Carboidrati" presenta la spiegazione: *"Clicca le
caselle per indicare quanti pasti a settimana vuoi dedicare a ciascun tipo
di carboidrato. Il totale deve essere esattamente 14."* Questo comunica
all'utente un vincolo preciso e affidabile per tipo di carboidrato.

**Cosa succede realmente**, confrontando il budget configurato (§0) con
l'uso effettivo nella settimana generata (campo `primoCereale` di ogni
pasto):

| Tipo | Budget impostato | Uso reale osservato |
|---|---|---|
| riso | 1 | **3** |
| pane | 1 | **2** |
| pasta | 1 | 3 (ma corrisponde a pasta+pasta_fresca, vedi §3) |
| pasta_fresca | 2 | **0** |
| cous_cous | 2 | 2 ✅ |
| polenta | 2 | **1** |
| patate | 1 | 1 ✅ |
| orzo | 1 | 1 ✅ |
| farro | 1 | 1 ✅ |
| gallette | 1 | **0** |
| crackers | 1 | **0** |

Il totale finale è comunque 14 (nessun pasto senza carboidrato), ma la
**distribuzione per tipo che l'utente ha esplicitamente configurato non
viene rispettata**: alcuni tipi vengono usati 2-3 volte più del previsto,
altri (gallette, crackers) non compaiono mai pur essendo stati richiesti.

**Impatto pratico per Cwe:** se in Set si riduce apposta il pane (per dire,
a 1 volta a settimana per un motivo dietetico), l'app può comunque proporre
pane 2 volte; se si chiede gallette 1 volta, potrebbe non comparire mai.

**Causa radice:** vedi `AUDIT-STRUTTURA-LOGICA.md` §5.

---

## §3. "Pasta fresca" è strutturalmente invisibile

Collegato al punto precedente ma è un problema a sé: **anche quando il
motore sceglie correttamente "pasta fresca"** (rispettando internamente il
budget), il piano e ogni visualizzazione che si basa su quel dato la
mostrerà sempre come "Pasta" generica. L'utente non vedrà mai "pasta
fresca" comparire da nessuna parte, nemmeno nelle settimane in cui il
budget gliel'ha assegnata 2 volte su 2.

**Causa radice:** vedi `AUDIT-STRUTTURA-LOGICA.md` §6.

---

## §4. Regola "affettati → pane" non rispettata

`REGOLE_FLUSSO_LOGICO.md` §4 dichiara esplicitamente: *"Regola affettati:
se l'affettato è la proteina del pasto, sovrascrive qualunque carboidrato
già selezionato con Panino (pane). È l'unica regola dell'affettato."*

**Osservato:** nella settimana generata, l'unico pasto con proteina
"affettati" (cena 24 agosto, "Risotto piselli e pancetta") ha come
carboidrato **riso**, non pane.

**Causa radice:** vedi `AUDIT-STRUTTURA-LOGICA.md` §3.

---

## §5. Regola "patate nel secondo → piatto unico" non rispettata

`REGOLE_FLUSSO_LOGICO.md` §4 dichiara: se il secondo contiene patate come
ingrediente, le patate sovrascrivono carboidrato e verdura richiesti e il
pasto diventa automaticamente "piatto unico".

**Osservato:** nella settimana generata, il secondo "Costine di maiale con
patate al forno" (30 agosto, pranzo) compare **insieme a un primo separato
("Farro con verdure miste") e a un contorno separato ("Zucchine
grigliate")** — esattamente i due elementi che la regola dice dovrebbero
essere superflui/assorbiti dalle patate del secondo.

**Causa radice:** vedi `AUDIT-STRUTTURA-LOGICA.md` §4.

---

## §6. Tetti "≤1 a settimana" su alcuni sottotipi proteici violati

`REGOLE_FLUSSO_LOGICO.md` §4: *"Tetti interni: carne rossa ≤1, affettati
≤1, pesce grande ≤1, conservato ≤1."* Lo stesso limite è anche visibile e
modificabile in Impostazioni → Configurazione avanzata nutrizionista
("di cui carne rossa: max/sett. 1", ecc.).

**Osservato:** nella settimana generata, il sottotipo **"carne_rossa"
compare 2 volte** (30 agosto sia a pranzo che a cena — "Hamburger di suino
al pane" e "Costine di maiale con patate al forno"), violando il tetto
dichiarato di 1/settimana.

**Nota:** gli altri tre tetti (affettati, pesce grande, pesce conservato)
sono risultati rispettati in QUESTA particolare generazione (1 occorrenza
ciascuno), ma per puro caso — la causa radice (vedi struttura §7) mostra che
il meccanismo di protezione è assente in generale, non solo per carne
rossa: può ripresentarsi su uno qualsiasi dei quattro sottotipi vincolati,
in modo non prevedibile, a seconda di quale ordine casuale di scelta
capita durante la generazione.

**Causa radice:** vedi `AUDIT-STRUTTURA-LOGICA.md` §7.

---

## §7. Contorni molto ripetitivi, nonostante il "cooldown verdure"

In Impostazioni → Configurazione avanzata nutrizionista compare un campo
"Cooldown verdure: 2 giorni", che lascia intendere che la stessa verdura
non debba ripresentarsi come contorno a meno di 2 giorni di distanza.
`REGOLE_FLUSSO_LOGICO.md` §6 rinforza questo concetto ("il fresco si
alterna per non ripetere lo stesso contorno").

**Osservato nella settimana generata (13 contorni assegnati su 14 pasti,
1 pasto senza contorno perché già coperto dal secondo):**

| Contorno | Occorrenze nella settimana | Giorni |
|---|---|---|
| Spinaci saltati | **5** | 24(cena), 25(pranzo), 27(cena), 28(cena), 29(cena) |
| Insalata mista con carote e finocchi | **5** | 24(pranzo), 26(pranzo), 28(pranzo), 29(pranzo), 30(cena) |
| Insalata mista (semplice) | 2 | 25(cena), 27(pranzo) |
| Zucchine grigliate | 1 | 30(pranzo) |

Solo **4 ricette-contorno distinte** usate su 13 occasioni. In particolare
"Spinaci saltati" compare **3 giorni consecutivi di fila** (27, 28, 29,
sempre a cena) — l'opposto esatto di un cooldown di 2 giorni.

**Approfondimento (nuovo test):** disattivando manualmente le due verdure
più usate (Zucchine, Insalata mista) e rigenerando una settimana pulita,
il contorno proposto è risultato **lo stesso identico piatto
("Spinaci saltati") in 13 casi su 13 (100%)**, nonostante altri 15+
contorni con ingredienti ben riforniti in inventario (Broccoli 300g,
Carote 200g, Melanzane 200g, Peperoni 150g) fossero teoricamente
disponibili. Non è quindi un problema di sola "rotazione debole" — è
sistematico e ha una causa precisa e isolata.

**Causa radice:** vedi `AUDIT-STRUTTURA-LOGICA.md` §11 (nuova sezione
dedicata, più precisa di quanto scritto in precedenza in §8) — il filtro
che dà priorità assoluta alle verdure "fresche" collassa a un solo
candidato quando gli altri articoli dello stesso livello scarseggiano di
scorta o vengono esclusi, escludendo di fatto ogni alternativa con scorte
comunque abbondanti ma di categoria diversa.

---

## §8. Parametri di Configurazione avanzata nutrizionista senza effetto

Nella pagina "Configurazione avanzata nutrizionista" (Impostazioni → Apri
configurazione nutrizionista) sono presenti, editabili e salvabili, questi
campi che **risultano privi di qualunque effetto misurabile sulla
generazione del menù** (confermato sia da verifica nel codice sia dal
comportamento osservato):

- **Cooldown carboidrati** (giorni) e **Cooldown verdure** (giorni)
- **Fonti proteiche/giorno** (max per giorno)
- **Frutta** (min/max al giorno) e **Porzione frutta** (g)

Cwe può modificare questi valori, vedere il messaggio "✅ Configurazione
salvata", e non osservare alcun cambiamento nel comportamento del motore.
Non è ovvio dall'interfaccia che questi controlli siano "cosmetici" allo
stato attuale.

**Causa radice:** vedi `AUDIT-STRUTTURA-LOGICA.md` §8.

---

## §9. "Completa" (tabella proteica) può duplicare la stessa categoria nello stesso giorno

In Set → Impostazioni Proteine, il testo guida dice: *"Max 2 categorie
diverse per giorno."* Con "Completa" (riempimento automatico), il risultato
osservato per la settimana di test è stato:

```
giorno_0 (Lun): pesce, carne
giorno_1 (Mar): formaggi, legumi
giorno_2 (Mer): formaggi, legumi
giorno_3 (Gio): uova, pesce
giorno_4 (Ven): legumi, uova
giorno_5 (Sab): pesce, formaggi
giorno_6 (Dom): carne, carne   ← stessa categoria a pranzo E cena
```

Non è tecnicamente una violazione della frase "max 2 categorie diverse"
(usarne 1 sola resta ≤2), e i totali settimanali per categoria restano
perfettamente in target (carne 3, pesce 3, formaggi 3, uova 2, legumi 3 =
14). Ma per un utente che si aspetta varietà anche nella stessa giornata,
vedersi proporre carne sia a pranzo che a cena la domenica, generata
automaticamente, è quantomeno sorprendente.

**Causa radice:** vedi `AUDIT-STRUTTURA-LOGICA.md` §10.

---

## §10. Colonna "Quantità" precompilata anche per vincoli non attivi

In Configurazione avanzata nutrizionista, la tabella con tutti gli
ingredienti (Aglio, Alici fresche, Arista di maiale, ...) mostra sempre un
valore nella colonna "Quantità" (es. "Alici fresche: 125g", "Uova: 2 pz")
**anche quando quell'ingrediente non è stato affatto selezionato come
"limitato"** tramite i pulsanti categoria sopra la tabella. Il valore
mostrato è solo un suggerimento di riferimento che diventa attivo solo se
l'ingrediente viene esplicitamente attivato — ma visivamente, con un
numero già scritto nel campo, può sembrare che il limite sia già impostato.

Non incide sul comportamento del motore (verificato: se lo stato non è
"limitato" il valore non viene applicato), è un potenziale equivoco per
chi usa l'interfaccia, non un bug funzionale.

---

## §11. Scadenza pranzo/cena mostrata in Impostazioni non corrisponde a quella reale

In Configurazione avanzata nutrizionista, "Scadenza pranzo" mostra 15:00 e
"Scadenza cena" mostra 22:00, editabili. **Verificato dal vivo:** un pranzo
di oggi, con contenuto reale, viene marcato consumato e scala l'inventario
già **alle 14:00**, non alle 15:00 mostrate; la cena scatta alle **20:00**,
non alle 22:00. Il valore in Impostazioni non ha alcun collegamento con il
comportamento reale (che usa una costante fissa separata nel codice,
commentata come richiesta specifica di "Enrico").

**Causa radice:** vedi `AUDIT-STRUTTURA-LOGICA.md` §12.

---

## §12. Verifiche completate senza anomalie (per completezza)

Durante l'audit sono stati testati anche questi comportamenti, **senza
trovare anomalie**:

- **Profilo vegetariano**: generazione corretta, nessuna fuga di carne/pesce,
  distribuzione legumi/formaggi/uova coerente con i target attesi.
- **Profilo vegano**: generazione corretta, nessuna fuga di
  carne/pesce/formaggi/uova. Nota di design (non un bug): tutti i 14 pasti
  risultano sempre macrocategoria "legumi" per costruzione — vedi
  `AUDIT-STATO-LAVORO.md` per la domanda aperta a Cwe su questo punto.
- **Ricette "solo manuali"**: una ricetta marcata `soloManuale` è stata
  correttamente esclusa da 14/14 generazioni automatiche successive, pur
  restando trovabile tramite la ricerca manuale (bypass criteri
  funzionante come da `REGOLE_FLUSSO_LOGICO.md` §17).
- **Verdure disattivate**: le verdure disattivate in Set non sono mai
  comparse nei contorni generati (0 su 13 occasioni in un test dedicato) —
  il filtro di esclusione funziona correttamente (l'effetto collaterale di
  questo stesso test, però, ha isolato l'anomalia §7/struttura §11).
- **Reset frigo** (inventario azzerato): generazione di una settimana
  completa comunque riuscita (14/14, 0 errori) con **zero righe di
  inventario presenti** — confermata la regola "tutti i piatti possono
  essere estratti a prescindere da inventario" (`REGOLE_FLUSSO_LOGICO.md`
  §3).
- **Scalo inventario al consumo**: verificato che il consumo automatico
  per scadenza oraria decrementa correttamente e con l'aritmetica esatta
  le scorte dell'ingrediente usato (verificato con "Zucchine grigliate":
  200g richiesti, 200g disponibili → 0g dopo il consumo).

## §13. Non verificato in questa sessione (limite di tempo/complessità)

- **Roll manuale di un singolo componente** (sostituzione proteina/carbo/
  contorno dentro un pasto già proposto): la logica esiste nel codice
  (`cambiaCellaDraft`, righe ~6070+ di index.html) ma è legata a uno stato
  di editor UI complesso (`draft`) che non è stato guidato dal vivo tramite
  interazione reale in questa sessione — solo letto staticamente.
- **Limite settimanale "pasto speciale"** (max 2/settimana dichiarato):
  trovato un controllo esplicito nel codice (index.html riga ~6082,
  `if(...length>=max){avviso(...);return;}`), ma **non verificato con
  certezza che sia l'unico punto in cui `modalitaSpeciale` viene scritto**
  — un punto di salvataggio diverso (riga ~6291) imposta il campo senza
  ripetere lo stesso controllo. Da testare dal vivo (3 pasti speciali nella
  stessa settimana) prima di considerarlo confermato in un senso o
  nell'altro.
- **Verifica aritmetica dettagliata della lista Spesa**: la vista risulta
  popolata e coerente a colpo d'occhio (vedi `AUDIT-STATO-LAVORO.md`), ma
  non è stata verificata voce per voce la matematica di arrotondamento a
  formato confezione e netto da inventario.

---

## Falso allarme verificato ed escluso

Durante i test è emerso, da uno screenshot, che il selettore giorni nel
Piano sembrasse mostrare "Maggio" per il 24-25 agosto. **Verificato via
interrogazione diretta del DOM reale dell'app** (attributo `data-g` di ogni
pulsante-giorno, non uno screenshot): tutti i 181 giorni della finestra
scorrevole (fine maggio - metà novembre 2026) risultano correttamente
etichettati, incluso il 23 agosto marcato correttamente come "oggi". La
falsa lettura veniva da un selettore CSS troppo generico nel mio script di
test (prendeva i primi elementi nella lista non ancora scrollata, non
quelli visibili). **Non è un problema dell'app — annotato solo per
trasparenza sul processo di audit.**
