# DietaPlanner — Lotto E: Set utente

**Data di verifica:** 2026-08-30  
**Resolver canonico:** `nutrition-config.js`  
**Prerequisiti:** `BASELINE_NUTRIZIONISTA_PDF_V1.md`, `LOTTO_B_RESOLVER.md`, `LOTTO_C_MOTORE.md`, `LOTTO_D_SETTING_NUTRIZIONISTA.md`

## 1. Scopo

Collegare il Set utente ai vincoli risolti del nutrizionista senza creare una seconda logica di precedenza e senza modificare i cataloghi `ingredienti.json` o `ricette.json`.

Il lotto comprende:

- frequenze e disabilitazioni proteiche derivate dal resolver;
- stati carboidrati `AUTO`, `EXCLUDED` e `FIXED` persistenti;
- cap personali per ingrediente come solo restringimento;
- controlli clinici applicati a verdure, preferenze, cereali e colazione;
- salvataggio complessivo del Set con validazione preventiva.

## 2. Carboidrati

La UI usa tre stati canonici:

- `AUTO`: il motore può usare la voce soltanto se priva di tetto settimanale PDF;
- `EXCLUDED`: zero esplicito, esclusione hard dalla generazione automatica;
- `FIXED`: numero settimanale esatto scelto dall'utente.

Persistenza:

- `configCarboidratiStati` è la sorgente canonica nuova;
- `configCarboidratiExplicitZeroKeys` conserva gli zeri espliciti;
- `configCarboidrati` e `configCarboidratiOrigini` restano scritti per compatibilità legacy.

Il riempimento automatico del Set usa soltanto voci non limitate e non escluse. Le voci con tetto PDF entrano soltanto come `FIXED` esplicite. Il motore riceve la stessa selezione attraverso il resolver centrale e non può ricostruire pool contrari al Set.

## 3. Proteine

La tabella settimanale deriva:

- frequenze effettive;
- sottotipi limitati;
- profilo alimentare;
- massimo di categorie proteiche giornaliere;

da `resolveNutritionConfig()`.

Le macro escluse dal profilo o dal piano non sono selezionabili. Il completamento verifica che gli slot liberi siano sufficienti a rispettare i minimi e non superi gli eventuali massimi.

## 4. Cap personali ingredienti

Il Set espone cap personali per tutti i gruppi di ingredienti presenti nel catalogo.

Regole:

- campo vuoto: nessun limite personale aggiuntivo;
- valore intero non negativo;
- `0`: non proporre automaticamente l'ingrediente, salvo conflitto con un minimo clinico;
- il cap utente non può superare il massimo del nutrizionista;
- un cap sotto il minimo clinico rende la configurazione non valida;
- gli ingredienti clinicamente esclusi restano disabilitati e non generano cap utente ridondanti.

La combinazione effettiva resta responsabilità esclusiva del resolver canonico.

## 5. Altri controlli del Set

- Verdure escluse clinicamente: visibili come bloccate e non selezionabili.
- Verdura ricorrente: non può essere scelta se esclusa clinicamente o disattivata dall'utente.
- Cereali non graditi: derivati dagli ingredienti ammessi; deve restare almeno una fonte consentita.
- Colazione: opzioni clinicamente escluse rimosse; i carboidrati semplici rispettano il massimo contestuale.
- Preferenze: non riattivano ingredienti o macro esclusi dal piano.

## 6. Salvataggio

`Salva tutta la configurazione` valida prima:

1. selezione carboidrati;
2. cap personali;
3. fattibilità della tabella proteine.

Se una validazione fallisce, il Set segnala l'errore e non dichiara il salvataggio completato. Il salvataggio non modifica ricette o ingredienti.

## 7. Test

`tests/lotto-e-user-set.test.js` verifica:

- presenza del resolver canonico nel Set;
- persistenza dei tre stati carboidrati;
- esclusione delle voci limitate dal completamento AUTO;
- lettura degli stessi stati da parte del motore;
- schema AUTO da 14 slot;
- `Friselle=2` e `Piadina=0`;
- combinazione cap clinico/utente;
- rifiuto di cap utente incompatibili con un minimo clinico;
- controlli clinici e salvataggio unico del Set.

## 8. Confini del lotto

Non appartengono al Lotto E:

- correzioni dei cataloghi dati: Lotto F;
- applicazione atomica delle quantità/residui alle realizzazioni, nutrizione, inventario, spesa e storico: Lotto G;
- nuova visualizzazione delle ricette e Roll contestuali: lotto grafico successivo già specificato;
- stress test end-to-end e release: Lotto H.

## 9. Stato

Il Lotto E è considerato chiuso soltanto quando il test dedicato e i contratti B–D passano. I due test legacy `data.test.js` e `ui-contract.test.js` restano anomalie preesistenti separate: non vanno corretti incidentalmente dentro questo lotto.
