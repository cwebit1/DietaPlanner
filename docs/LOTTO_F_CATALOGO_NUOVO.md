# DietaPlanner — Lotto F: catalogo dati nuovo

**Data:** 2026-08-30
**Cataloghi attivi:** `ingredienti-new.json` v21, `db-ricette.json` v69

## Scopo

Verificare e correggere esclusivamente metadati strutturati e classificazioni
del nuovo formato. Il lotto non converte in autonomia ricette ancora mancanti,
non legge il vecchio database a runtime e non modifica quantità delle ricette
in conseguenza del Setting.

## Correzioni applicate

- `Salsiccia di maiale` e `Salsiccia di tacchino` appartengono alla famiglia
  `affettati`, usata dal motore come contatore comune per
  affettati/salumi/insaccati. In precedenza erano rispettivamente
  `carne_rossa` e `carne_bianca` e potevano aggirare il limite di famiglia.
- `Granita fatta in casa` dichiara `conservazione: surgelato`, coerente con la
  collocazione freezer già presente nell'app.
- `Sfoglie di lasagna` dichiara `conservazione: lunga`, coerente con la voce da
  dispensa già presente nell'app.
- Versione di `ingredienti-new.json` incrementata da 20 a 21.

## Decisioni utente preservate

- `Riso` resta la sola voce semplificata: non vengono ricreate le varianti
  `Riso Originario` o `Riso integrale`.
- `Burro di arachidi` resta assente.
- `Farina 00` resta assente dall'inventario perché ingrediente tecnico usato in
  quantità minime.

## Verifica automatica

`tests/lotto-f-new-catalog.test.js` controlla:

- tutte le referenze ingrediente dei 39 template, comprese le composizioni
  fisse;
- coerenza fra categoria del gruppo ricetta e gruppo ingrediente;
- famiglie affettati/insaccati, pesce conservato e pesce grande;
- classificazioni verdura principali e porzioni ortaggi/insalate;
- unità a pezzi per Uova e Friselle;
- decisioni utente su Riso, burro di arachidi e Farina 00;
- metadati di conservazione corretti.

## Confini successivi

Restano nel Lotto G/UI:

- deperibilità come priorità soft distinta fra programmazione e pasto odierno;
- generazione del carrello con verdure fresche distribuite per durata;
- uso delle scorte soltanto nella gestione del pasto odierno;
- quantità effettive e residuo verdura propagati atomicamente a nutrizione,
  inventario, spesa e storico;
- visualizzazione su righe C/P/V e Roll contestuali.
