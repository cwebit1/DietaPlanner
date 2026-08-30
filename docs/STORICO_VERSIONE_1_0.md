# DietaPlanner — storico sintetico versione 1.0

Questo documento conserva esclusivamente le lezioni utili dei vecchi audit e
dei report V72–V79. Non è una fonte normativa per la root corrente.

## Problemi storici accertati

- Il vecchio motore conteneva funzioni duplicate e override tardivi: leggere
  soltanto la prima definizione portava a conclusioni errate sul runtime.
- Genera menù poteva terminare senza output e senza errore quando la settimana
  comprendeva oggi.
- Budget carboidrati, cap settimanali e configurazioni mostrate in UI potevano
  essere salvati ma non applicati dal motore.
- I cap di sottotipo guardavano lo storico ma non sempre i pasti già generati
  nella stessa settimana.
- Speck e pesce conservato potevano nascondersi dentro ricette con proteina
  dominante diversa.
- La priorità assoluta al fresco poteva collassare il pool delle verdure e
  produrre ripetizioni.
- Le fasce orarie visualizzate e quelle realmente applicate erano divergenti.
- Salvare il Setting poteva riscrivere globalmente le quantità delle ricette.
- Dati, UI e motore avevano più sorgenti concorrenti per frequenze, quantità e
  classificazioni.

## Lezioni preservate nella nuova architettura

- Un solo resolver della configurazione.
- Testare la funzione realmente chiamata, non una definizione morta.
- Conteggiare consumi, pasti preservati e nuovi pasti nello stesso ciclo.
- Nessun fallback che violi esclusioni o massimi.
- Costruire l'intera settimana in un buffer prima di scriverla.
- Separare piano, bozza, consumo, inventario e storico.
- Verificare insieme struttura dati e logica che la consuma.
- Non attribuire al PDF regole applicative non presenti nel documento.

## Cronologia V72–V79

I report di quelle versioni documentavano progressivamente test di
conformità, UI Pasto/Speciale, selettori, nomi ricette, allergeni, algebra di
copertura e migrazioni del vecchio catalogo da oltre 300 ricette. Quei conteggi,
file e funzioni non descrivono la root attuale e non devono guidare nuovi
interventi.

## Archivio fisico

I file applicativi e i test della versione 1.0 restano in
`Vecchia versione 1.0/`. Possono essere consultati soltanto per una conversione
esplicitamente autorizzata o per ricostruire una migrazione, mai come fallback
runtime.
