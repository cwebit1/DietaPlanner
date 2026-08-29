# DietaPlanner — Lotto C: integrazione resolver nel motore

**Data:** 2026-08-29  
**Resolver canonico:** `nutrition-config.js`  
**Baseline:** `docs/BASELINE_NUTRIZIONISTA_PDF_V1.md` V1.2  
**Prerequisito:** `docs/LOTTO_B_RESOLVER.md`

## 1. Scopo

Collegare il motore reale e `engine-core.js` al resolver centrale senza modificare la UI del Set o il catalogo ricette/ingredienti.

Punti baseline affrontati:
- 1, 3, 6, 7;
- 24;
- 39, 41, 46;
- 51-52;
- 55-60.

Punti deliberatamente NON completati in questo lotto:
- 5: la tabella Set continua ad avere hardcode UI; verrà corretta nel Lotto E;
- 11-15: quantità contestuali;
- 53-54: il calcolo residuo verdura è disponibile nel resolver/engine ma non è ancora applicato alle quantità reali delle `realizzazioni`;
- 38: UI dei cap utente;
- manuale/ricerca completa: Lotto G.

## 2. Ordine runtime

`index.html` ora carica:

1. `nutrition-config.js?v=86`
2. `engine-core.js?v=86`
3. `motor.js?v=86`

Nessun elemento grafico del Set è stato modificato.

## 3. Engine core

`engine-core.js` dipende ora da `DietaPlannerNutritionConfig`.

I propri `DEFAULTS` derivano dai due livelli canonici:
- `PDF_BASELINE` per valori nutrizionali;
- `APP_DEFAULTS` per regole applicative.

L'engine espone inoltre:
- `resolveNutritionConfig()`;
- `vegetableCoverage()`.

In Node il modulo importa direttamente `./nutrition-config.js`; nel browser usa lo stesso oggetto globale già caricato.

## 4. Carboidrati — niente fallback contrario al Set

`chooseCarb()`:
- sceglie soltanto fra chiavi con `carbRemaining > 0`;
- non ricostruisce più un pool generale quando il residuo è esaurito;
- se non esiste scelta valida restituisce `null`;
- l'eventuale regola affettati→pane non può riattivare pane se pane non è nel budget residuo;
- la scelta fra le voci residue è randomizzata.

Quindi il motore non può più usare il vecchio fallback per violare uno zero/fuori-budget.

## 5. Materializzazione del budget 14 carboidrati

`motor.js::preparaBudgetCarboidratiMotore(resolved)` parte esclusivamente dal piano prodotto dal resolver:

- copia le quantità `FIXED`;
- completa `remainingSlots` soltanto con `autoEligibleKeys`;
- ogni inserimento AUTO è casuale;
- rispetta il massimo applicativo per singola voce;
- se il pool AUTO si esaurisce, produce errore anziché riattivare voci escluse/limitate.

La disposizione nei pasti è poi casuale perché `chooseCarb()` pesca casualmente dal residuo.

### Compatibilità IndexedDB esistente

`configCarboidratiOrigini` viene usato per distinguere ciò che l'utente aveva realmente cliccato da ciò che il vecchio completamento aveva inserito come `sistema`.

Se esistono origini:
- solo le occorrenze con origine `utente` diventano FIXED;
- quelle con origine `sistema` tornano AUTO nel nuovo motore.

Se il record è legacy e non possiede origini:
- i conteggi positivi vengono conservati come FIXED.

La vera distinzione persistente fra AUTO e zero esplicito verrà aggiunta alla UI nel Lotto E mediante `configCarboidratiStati` / chiave equivalente.

## 6. Profili alimentari

Rimossi dal motore gli override numerici arbitrari:

- vegetariano: non impone più formaggi 3-6, uova 2-4, legumi 5+;
- vegano: non impone più legumi 14.

Il resolver conserva le frequenze configurate; il profilo rende semplicemente non disponibili le macro proibite. La griglia completa gli slot usando le macro ammesse senza inventare nuovi valori clinici.

## 7. Massimi ingrediente diventati hard

`engine-core.js::applyIngredientCaps()` non restituisce più il pool originale quando tutte le ricette superano il tetto.

Ora restituisce:
- solo `allowed`;
- `blockedAll:true` se il pool originario esisteva ma ogni ricetta era vietata.

Conseguenza: un massimo clinico o utente non viene superato come fallback.

## 8. Configurazione ingrediente Nutrizionista/User

`creaStatoMotoreSettimana()` non ricostruisce più a mano `Math.min(user, clinical)`.

Legge `resolved.ingredientConstraints` prodotto dal resolver e converte le regole base→variante per il motore.

Quindi la precedenza resta una sola:
- esclusione clinica → max 0;
- clinico+utente → minimo dei due;
- minimo clinico incompatibile con cap utente → configurazione invalida e generazione fermata.

## 9. Conteggi settimanali reali

Il motore ora costruisce i conteggi dei vincoli sulla **settimana target**, non usa più il totale storico a vita come contatore del cap settimanale.

Prima di generare vengono conteggiati:
- consumi reali della settimana target;
- pasti bloccati che verranno preservati;
- anche gli altri pasti già presenti quando la generazione non è forzata.

Durante la nuova generazione vengono aggiunti progressivamente i pasti estratti.

Questo vale per:
- ingredienti con cap;
- famiglie proteiche limitate.

## 10. Ricette miste: Speck e pesce conservato

Per i quattro sottotipi limitati, il conteggio non dipende più soltanto da `ricetta.gruppoProteico`.

Il motore esamina anche i metadati strutturati degli ingredienti:
- se una ricetta formaggio contiene Speck, il pasto incrementa comunque `affettati`;
- se una ricetta formaggio contiene salmone affumicato, incrementa comunque `pesce_conservato`.

La famiglia viene contata una sola volta per pasto anche se compare in più componenti.

Questo evita il bypass già individuato nel Lotto A.

## 11. Verdure disattivate

Il motore usa ora la chiave canonica:
- `setVerdureDisattivate`.

Durante la migrazione mantiene fallback in lettura:
- `verdureDisattivate`.

La UI non è stata modificata.

## 12. Configurazione non valida

Se il resolver o il budget carboidrati restituiscono errori:
- `generaPianoSettimana()` non procede;
- nessun fallback nutrizionale viene inventato;
- viene restituito l'elenco degli errori e, se disponibile, mostrato un avviso.

## 13. Residuo verdura — stato preciso

Il resolver e l'engine possiedono già `vegetableCoverage()` e il test:

- 80 g ortaggi su target 200 g → residuo 120 g.

**Non è stato ancora applicato alle realizzazioni salvate.**

Motivo anti-regressione: oggi `realizzazioni` conserva principalmente `ricettaId`; nutrizione, inventario e storico assumono l'intera quantità della ricetta. Ridurre solo visivamente/nel motore un contorno senza propagare lo stesso fattore a:
- nutrizione;
- inventario;
- lista spesa;
- storico consumato

produrrebbe dati incoerenti.

Il Lotto dedicato alle quantità/Generazione dovrà aggiungere un fattore/override strutturato della realizzazione e farlo consumare da tutti questi percorsi nello stesso intervento. Non va simulato modificando la ricetta catalogo.

## 14. Test

Aggiornati:
- `tests/engine-core.test.js`;
- `tests/nutrition-lotto-a-snapshot.test.js`.

Aggiunto:
- `tests/lotto-c-integration.test.js`.

Controlli eseguiti:
- sintassi resolver/engine/motor;
- caricamento resolver→engine;
- budget zero senza fallback;
- cap ingrediente hard;
- resolver condiviso Friselle=2 → residuo 12;
- helper residuo verdura;
- assenza override profilo arbitrari;
- chiave verdure canonica;
- conteggi settimanali e famiglie limitate;
- ordine script browser.

Smoke integrazione Lotto C: **PASS**.

## 15. File applicativi modificati

- `nutrition-config.js`: invariato rispetto al Lotto B;
- `engine-core.js`: collegato al resolver, hard cap/fallback;
- `motor.js`: collegato al resolver e conteggi settimanali;
- `index.html`: solo ordine/caricamento script e cache-busting.

Cataloghi NON modificati:
- `ingredienti.json`;
- `ricette.json`.

## 16. Prossimo lotto

Il prossimo passo previsto dalla baseline è **Lotto D — Setting nutrizionista**.

Prima di procedere dovranno essere riletti:
- `AGENTS.md`;
- baseline PDF;
- `LOTTO_B_RESOLVER.md`;
- questo documento;
- sezioni pertinenti di `REGOLE_FLUSSO_LOGICO.md`.

Il Lotto D non dovrà ancora implementare la UI dei cap personali utente: quella resta Lotto E.
