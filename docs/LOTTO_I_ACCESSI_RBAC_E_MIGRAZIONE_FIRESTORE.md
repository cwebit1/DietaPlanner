# DietaPlanner — progetto accessi, whitelist e migrazione Firestore

**Stato:** progetto approvabile, non ancora implementato  
**Data:** 2026-08-30  
**Ambito:** Lotto I — autenticazione, autorizzazione, dati personali e cloud

## 1. Obiettivi

1. Mantenere il login Google persistente fino al logoff.
2. Consentire la modalità locale soltanto per l'apertura corrente.
3. Distinguere autenticazione (chi è l'utente) e autorizzazione (cosa può fare).
4. Gestire whitelist, ruoli e permessi senza controlli email scritti nel codice.
5. Rendere invisibile e inaccessibile il Setting nutrizionista ai non autorizzati.
6. Preparare più classi di servizio senza vincolare l'app a quelle iniziali.
7. Migrare progressivamente i dati personali su Firestore senza perdere né
   sovrascrivere l'IndexedDB esistente.

## 2. Invarianti da non rompere

- Nessun intervento del Lotto I modifica motore v12, resolver nutrizionale,
  ricette, ingredienti, quantità, cap o generazione dei pasti.
- `db-ricette.json` e `ingredienti-new.json` restano cataloghi globali statici:
  non vengono duplicati nel cloud per ogni utente.
- Il login non autorizza automaticamente: un account senza record di accesso
  entra nello stato limitato.
- Nascondere una vista non costituisce sicurezza: ogni dato protetto deve avere
  la stessa autorizzazione nelle Firestore Security Rules.
- La modalità locale non scrive nel profilo cloud e non può usare funzioni che
  richiedono identità o sincronizzazione.
- La prima migrazione crea sempre un backup esportabile e non elimina IndexedDB.
- Nessuna fase rende Firestore sorgente primaria prima di confronto, test di
  ripristino e autorizzazione esplicita di Cwe.

## 3. Modello di accesso scalabile

### 3.1 Stati di accesso

| Stato | Significato | Comportamento iniziale |
|---|---|---|
| `admin` | amministratore autorizzato | app completa e Setting nutrizionista |
| `user` | utente autorizzato | app completa senza Setting nutrizionista |
| `limited` | autenticato ma non ancora autorizzato | funzioni ridotte da definire |
| `local` | accesso senza Google | sessione locale e funzioni ridotte da definire |
| `blocked` | accesso revocato | nessun accesso ai dati cloud |

Le funzioni ridotte di `limited` e `local` non vengono inventate in questo
lotto: saranno una decisione funzionale separata.

### 3.2 Documento autorizzazioni

Percorso proposto: `access/{uid}`.

```json
{
  "status": "enabled",
  "roles": ["admin"],
  "permissions": {
    "app.useFull": true,
    "nutritionistSettings.read": true,
    "nutritionistSettings.write": true,
    "users.manage": false
  },
  "schemaVersion": 1,
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

- L'UID è la chiave primaria; l'email è informativa e non è il confine di
  sicurezza.
- Il client può leggere soltanto il proprio record `access/{uid}` e non può
  crearne o modificarne alcuno.
- In assenza del documento, di `status: enabled` o del permesso richiesto,
  l'app applica il comportamento più restrittivo (fail closed).
- I ruoli sono scorciatoie amministrative; le singole funzioni controllano
  permessi specifici, evitando condizioni rigide come `role === 'admin'`.

### 3.3 Bootstrap e gestione

Fase iniziale, compatibile con Spark:

1. l'utente esegue almeno un login e Firebase crea il suo UID;
2. Cwe crea o modifica manualmente `access/{uid}` dalla console Firestore;
3. il primo amministratore non può auto-promuoversi dal client;
4. l'eventuale pannello “Gestione utenti” verrà aggiunto solo dopo avere un
   ambiente privilegiato o regole che permettano esclusivamente ad admin già
   verificati di amministrare gli accessi.

Evoluzione possibile: spostare i ruoli principali nelle Firebase custom claims.
Le claims sono più efficienti, ma possono essere assegnate soltanto da Admin SDK
in un ambiente privilegiato; non vanno mai impostate dal browser.

## 4. Protezione della configurazione nutrizionista

La protezione richiede tre livelli simultanei:

1. **Navigazione:** la card e il comando non vengono renderizzati senza
   `nutritionistSettings.read`.
2. **Azioni:** ogni handler di apertura/salvataggio verifica nuovamente il
   permesso, impedendo chiamate manuali dal DOM o dalla console.
3. **Dati:** le Firestore Rules negano lettura e scrittura senza il permesso
   corrispondente.

Il Setting attuale in IndexedDB non diventa automaticamente cloud. Prima va
deciso se esiste una configurazione globale, una per utente o una assegnata da
un nutrizionista a più utenti. Il modello consigliato per la crescita è:

- `nutritionistSettings/{settingId}` — definizione protetta;
- `users/{uid}/assignments/current` — riferimento alla configurazione assegnata;
- eventuale `relationships/{id}` — relazione nutrizionista/utente futura.

## 5. Analisi di fattibilità Firestore

### 5.1 Esito

La migrazione è **tecnicamente fattibile e adatta** al progetto, purché sia
incrementale. Non è consigliabile sostituire in una sola release IndexedDB con
Firestore: il rischio principale non è la capacità del database, ma conflitti,
offline, duplicazioni e perdita dello stato locale esistente.

Il piano Spark corrente offre una sola banca dati gratuita, 1 GiB archiviato,
50.000 letture/giorno, 20.000 scritture/giorno, 20.000 cancellazioni/giorno e
10 GiB/mese di traffico in uscita. Sono valori ampi per sviluppo e primi utenti,
ma vanno monitorati prima di una distribuzione numerosa.

### 5.2 Cosa migrare e cosa no

| Dato attuale | Destinazione | Scelta |
|---|---|---|
| profilo Google | `users/{uid}` | cloud |
| whitelist/ruoli | `access/{uid}` | cloud protetto |
| Set utente | `users/{uid}/preferences/*` | cloud + cache locale |
| configurazione nutrizionale assegnata | documenti protetti dedicati | cloud |
| piano pasti | `users/{uid}/plans/{slotId}` | cloud + cache locale |
| inventario | `users/{uid}/inventory/{itemId}` | cloud + cache locale |
| consumi | `users/{uid}/consumptionEvents/{eventId}` | cloud append-only |
| proposte/cambi/roll | `users/{uid}/proposalEvents/{eventId}` | cloud append-only |
| lista spesa | derivata; snapshot opzionale | preferibilmente ricalcolata |
| cataloghi ricette/ingredienti | file globali GitHub | non duplicare per utente |
| cache ricette compilate | IndexedDB | solo locale, rigenerabile |
| bozze non confermate | IndexedDB/sessione | locale fino alla conferma |

### 5.3 Granularità documenti

- Non salvare tutto lo storico in un singolo array/documento: un documento
  Firestore ha limite 1 MiB e gli array crescenti aumentano costi e conflitti.
- Usare un documento per evento con ID idempotente (`eventId`) e timestamp.
- Piano e inventario usano documenti piccoli per elemento/slot, così una
  modifica non riscrive l'intero profilo.
- Impostazioni compatte e poco variabili possono essere raggruppate per dominio,
  ma non in un unico “mega documento”.

### 5.4 Offline e sincronizzazione

Firestore Web supporta cache persistente su Chrome, Safari e Firefox, ma sul Web
è disattivata per impostazione predefinita. Poiché DietaPlanner è una PWA Android,
si propone:

1. mantenere IndexedDB applicativo durante la migrazione;
2. introdurre un livello repository che esponga la stessa API a UI e motore;
3. usare Firestore come sync remoto, non direttamente da ogni funzione UI;
4. valutare in seguito la cache persistente Firestore multi-tab su dispositivo
   fidato;
5. mostrare stato `locale / sincronizzazione / sincronizzato / errore`.

Firestore applica “last write wins” alle modifiche offline dello stesso
documento. Per evitare che ciò distrugga dati importanti:

- eventi storici append-only, mai aggiornati in-place;
- `updatedAt`, `revision`, `deviceId` e `clientMutationId` sui documenti mutabili;
- transazioni o batch per modifiche atomiche correlate;
- conflitto esplicito quando due dispositivi modificano la stessa configurazione
  da una revisione precedente.

### 5.5 Costi e prestazioni

- Nessun listener globale su collezioni complete.
- Query limitate per settimana/intervallo e paginazione dello storico.
- Evitare una scrittura ad ogni render o apertura card.
- Accorpare soltanto scritture realmente atomiche; ogni operazione di un batch
  conta comunque come scrittura.
- Indici compositi aggiunti solo per query dimostrate dai test.
- Dashboard Usage verificata a ogni fase pilota.

### 5.6 Backup e limiti del piano gratuito

Il tier gratuito non include backup gestiti, PITR, restore o clone. Finché si
resta su Spark, DietaPlanner deve mantenere:

- esportazione JSON manuale versionata;
- IndexedDB locale durante il periodo di sicurezza;
- manifest di migrazione con conteggi e hash;
- procedura verificata di importazione/ripristino.

Il passaggio a Blaze sarà valutato soltanto se utenti, funzioni privilegiate,
backup gestiti o volumi lo richiederanno.

## 6. Schema cloud proposto

```text
access/{uid}
users/{uid}
  preferences/{domain}
  plans/{slotId}
  inventory/{itemId}
  consumptionEvents/{eventId}
  proposalEvents/{eventId}
  migrations/{migrationId}
nutritionistSettings/{settingId}
relationships/{relationshipId}        (futuro)
```

Tutti i documenti applicativi includono almeno `schemaVersion`, `createdAt` e
`updatedAt`. Gli eventi includono anche `eventType`, `eventId`, `deviceId`,
`actorUid` e riferimenti stabili a proposta, ricetta, componenti e ingredienti.

## 7. Strategia di migrazione senza perdita dati

1. **Inventario dati:** conteggio e dimensione di ogni store IndexedDB e chiave
   localStorage rilevante.
2. **Backup locale:** esportazione JSON con versione schema e checksum.
3. **Preflight:** login valido, ruolo abilitato, Firestore raggiungibile e remoto
   privo di una migrazione completata incompatibile.
4. **Upload idempotente:** scrittura con ID deterministici in piccoli batch.
5. **Verifica:** confronto conteggi, ID e hash logici locale/remoto.
6. **Marker:** `users/{uid}/migrations/indexeddb-v1` passa a `completed` soltanto
   dopo verifica completa.
7. **Dual write controllato:** IndexedDB resta primario; le scritture cloud
   fallite entrano in coda locale ripetibile.
8. **Dual read di confronto:** il cloud viene letto in ombra e confrontato senza
   cambiare ciò che vede l'utente.
9. **Pilota remoto:** Firestore diventa primario solo per un dominio alla volta.
10. **Rollback:** flag applicativo riporta immediatamente la lettura su IndexedDB;
    nessun dato locale viene cancellato.

## 8. Work plan operativo

Ogni fase produce un commit separato. Non si inizia la fase successiva senza
test verdi, diff approvabile e checkpoint documentato.

### I0 — Baseline e congelamento

- esportare fixture degli store attuali;
- aggiungere test del login già esistente e snapshot UI;
- censire tutti gli accessi diretti a IndexedDB/localStorage;
- nessun cambiamento runtime.

**Gate:** suite corrente verde e backup ripristinabile.

### I1 — Resolver autorizzazioni puro

- modulo separato `access-control.js`;
- stati `admin/user/limited/local/blocked`;
- API `can(permission)`, `require(permission)`, `getAccessState()`;
- fallback fail-closed e test unitari completi.

**Rollback:** rimuovere il modulo; nessun dato modificato.

### I2 — Documento access e regole

- lettura del solo `access/{uid}`;
- regole che vietano ogni scrittura client sulla whitelist;
- fixture Rules Emulator per admin, user, limited, blocked e anonimo;
- bootstrap manuale del primo admin.

**Gate:** nessuna auto-promozione possibile.

### I3 — Protezione UI nutrizionista

- card non renderizzata senza permesso;
- guard sugli handler di apertura e salvataggio;
- gestione caricamento ruolo senza lampeggio della vista protetta;
- test DOM e prova Android.

**Rollback:** feature flag `rbacUi=false`, lasciando attive le regole sicure.

### I4 — Modello cloud e repository

- introdurre repository senza cambiare le API consumate dal motore;
- classificare store primari, derivati e cache;
- definire schemaVersion, ID idempotenti e mapper;
- nessuna sincronizzazione automatica.

**Gate:** output motore e IndexedDB invariati byte/logicamente.

### I5 — Migrazione in ombra

- backup, preflight, upload idempotente, verifica e marker;
- IndexedDB resta sorgente primaria;
- pannello diagnostico admin con soli conteggi/stato;
- stress test con interruzione rete e ripetizione migrazione.

**Rollback:** disabilitare upload; locale intatto.

### I6 — Dual write e coda

- scrittura locale immediata + coda cloud;
- retry con idempotenza e backoff;
- eventi append-only per proposte, cambi, roll e consumi;
- batch per operazioni atomiche del pasto.

**Gate:** nessun doppio evento e nessuna perdita dopo offline/riavvio.

### I7 — Lettura cloud progressiva

- abilitare per dominio: preferenze, piano, inventario, storico;
- confronto automatico con locale prima di ogni attivazione;
- conflitti espliciti e restore da backup;
- pilota su account admin.

**Rollback:** feature flag per dominio verso IndexedDB.

### I8 — Classi limitate e gestione utenti

- definire con Cwe la matrice funzionale `limited` e `local`;
- implementare schermata amministrativa solo dopo sicurezza end-to-end;
- valutare Admin SDK/custom claims e piano Blaze se necessario.

**Gate:** test matrice permessi e tentativi ostili.

### I9 — Stress test e rilascio

- suite esistente completa;
- Rules Emulator;
- due account e due dispositivi;
- login persistente/logoff/modalità locale;
- offline, conflitto, migrazione interrotta, retry e rollback;
- verifica consumi Firestore;
- release solo dopo autorizzazione esplicita di Cwe.

## 9. Matrice minima di collaudo

| Caso | Esito atteso |
|---|---|
| admin | Setting visibile; lettura/scrittura consentite |
| user | Setting assente; accesso diretto negato |
| limited | sole funzioni future consentite; dati admin negati |
| local | nessuna chiamata dati personali cloud |
| blocked | accesso cloud negato anche con login valido |
| ruolo rimosso durante sessione | permessi revocati al refresh del record |
| offline durante consumo | locale coerente; singolo evento al ritorno online |
| migrazione ripetuta | stessi documenti, nessun duplicato |
| conflitto due dispositivi | nessuna sovrascrittura silenziosa critica |
| rollback | app riusa IndexedDB con dati completi |

## 10. Decisioni ancora richieste a Cwe

Prima di I8 devono essere definite:

1. funzioni disponibili a `limited`;
2. funzioni disponibili in modalità `local`;
3. differenza futura tra `admin` e `nutritionist`;
4. chi può assegnare un piano nutrizionale a un utente;
5. durata di conservazione di proposte, roll, cambi e consumi;
6. possibilità o meno per un utente di cancellare/esportare il proprio storico.

Queste decisioni non bloccano I0–I7, purché i permessi restino granulari.

## 11. Riferimenti tecnici ufficiali

- Firebase, [custom claims e controllo accessi](https://firebase.google.com/docs/auth/admin/custom-claims).
- Firestore, [condizioni nelle Security Rules](https://firebase.google.com/docs/firestore/security/rules-conditions).
- Firestore, [quote e limiti](https://firebase.google.com/docs/firestore/quotas).
- Firestore, [accesso e persistenza offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline).
- Firestore, [transazioni e batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions).
