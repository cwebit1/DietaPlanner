# DietaPlanner — architettura tecnica motor v12

**Runtime attivo:** `motor-v12.js`
**API browser:** `DietaPlannerMotorV12`

## 1. Ordine di caricamento

`index.html` carica, in questo ordine:

1. `nutrition-config.js` — resolver canonico;
2. `engine-core.js` — regole pure e testabili;
3. `motor-v12.js` — adattatore del formato a gruppi e IndexedDB;
4. script applicativo inline — UI e bridge legacy necessari.

I cataloghi remoti sono esclusivamente `ingredienti-new.json` e
`db-ricette.json`.

## 2. Responsabilità

### Resolver

Combina baseline PDF, default APP, Setting, profilo e Set. Produce frequenze,
cap, stati carboidrati, quantità contestuali, porzioni verdura, warning ed
errori. Nessun altro modulo deve duplicarne la precedenza.

### Engine core

Contiene helper puri per copertura, griglie, cap, scadenze, profili, deficit di
spesa e consumo automatico. Alcune API conservano contratti della versione 1.0
per i test; non costituiscono una seconda pipeline runtime.

### Motor v12

- carica i due cataloghi nuovi;
- espande i template a gruppi;
- materializza ingredienti, quantità, nutrienti e nomi;
- applica configurazione risolta, profilo, allergie, esclusioni e cap;
- costruisce sequenze settimanali C e P;
- genera l'intera settimana in memoria e la salva solo a esito completo;
- mantiene tracking, cooldown e rotazione condimenti;
- espone rigenerazione, Roll C/P/V, Salvafrigo e accesso alle ricette.

## 3. Formato ricetta

Ogni template contiene quattro gruppi. Ogni gruppo dichiara categoria,
ingredienti, eventuali cotture, testo di collegamento e visibilità del nome.
Gli ingredienti e le cotture possiedono `stack` e `roll`; `dose` è riservata a
eccezioni esplicite.

Le combinazioni concrete derivano dal prodotto cartesiano degli slot
non-Condimenti. Il gruppo Condimenti fornisce varianti compatibili e non
moltiplica le combinazioni base.

## 4. Generazione settimanale

1. Risolve la configurazione nutrizionale.
2. Conta consumi della settimana e pasti da preservare.
3. Costruisce la sequenza carboidrati: FIXED residui più AUTO ammessi.
4. Costruisce la sequenza proteica coerente con frequenze e profilo.
5. Per ogni slot cerca soltanto combinazioni ammesse da copertura, cap,
   esclusioni e carboidrato pianificato.
6. Aggiorna progressivamente i contatori in memoria.
7. Se uno slot non è costruibile, restituisce errore senza scritture parziali.
8. Se tutti gli slot sono validi, salva il buffer completo.

La programmazione non filtra negativamente per inventario. Ordina le verdure
secondo la priorità di deperibilità della programmazione e costruisce il
carrello coerente senza trasformare la scorta in requisito.

## 5. Realizzazioni

Una voce piano nuova contiene `realizzazioni`, ognuna collegata a una ricetta
concreta. Lo schema quantitativo v1 salva quantità effettive, nutrienti e
residuo verdura senza modificare il template catalogo.

Lo stesso snapshot quantitativo viene letto da:

- calcolo nutrizionale;
- consumo inventario;
- lista della spesa;
- storico consumato immutabile;
- rendering della ricetta.

Una quantità applicata soltanto in UI o soltanto nell'inventario è invalida.

## 6. Roll e rigenerazione

- `rigeneraPasto` propone un nuovo pasto conservando il carboidrato
  pianificato quando richiesto.
- `ruotaPasto` cambia una sola dimensione C/P/V della realizzazione.
- Lo stato del Roll deriva dalle alternative effettive: una sola variante
  significa pulsante disabilitato.
- La rotazione manuale non consuma il cursore automatico dei condimenti.

## 7. Compatibilità e migrazione

Le vecchie chiavi IndexedDB restano leggibili tramite adattatori mirati. Per i
carboidrati, conteggi legacy utente diventano FIXED e conteggi creati dal
sistema diventano AUTO. Le nuove chiavi sono canoniche; la compatibilità non
autorizza letture runtime del vecchio database ricette.

## 8. Confini ancora aperti

Quantità atomiche, residuo verdura, priorità di programmazione, alternative
del pasto odierno e UI C/P/V sono implementati e verificati automaticamente.
Restano aperti soltanto:

- prova browser reale di DOM, IndexedDB, reset, responsive Android e tastiera;
- verifica runtime del service worker e della cache;
- completamento della conversione delle ricette effettivamente destinate al
  nuovo catalogo;
- checklist finale e autorizzazione esplicita di Cwe alla release.
