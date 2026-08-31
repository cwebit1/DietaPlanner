/* DietaPlanner - ponte tra la UI (index.html) e motor-v12.js per il
   riempimento di uno slot pasto vuoto su richiesta ("garantisci slot").

   Sostituisce la vecchia garantisciRicettaSlot(), che usava i compositori
   modulari legacy (componiPastoModulare, componiPrimoModulare, motorePrimi)
   e scriveva lo schema a campi separati (primoId/secondoId/contornoId).

   Da qui in poi: unica fonte di verita' e' motor-v12.js
   (DietaPlannerMotorV12.risolviSlotSingolo, gia' con la logica completa a
   layer 1/2a/2b/3). Lo schema scritto su 'piano' e' sempre quello nuovo:
   motoreNuovo:true + realizzazioni[]. Nessun campo legacy viene piu' scritto
   da questa funzione.

   Stesso contratto esterno della funzione che sostituisce: riceve
   (giorno, pasto, voce, ignoraCopertura, preferenze), restituisce voce
   popolata e gia' salvata su IndexedDB se e' stata generata una ricetta. */
async function garantisciRicettaSlot(giorno, pasto, voce, ignoraCopertura, preferenze){
  preferenze = preferenze || {};
  if(!voce) return voce;

  /* Gia' pieno (schema nuovo): niente da fare. */
  if(voce.motoreNuovo && Array.isArray(voce.realizzazioni) && voce.realizzazioni.length) return voce;

  if(!window.DietaPlannerMotorV12 || typeof window.DietaPlannerMotorV12.risolviSlotSingolo !== 'function'){
    console.error('garantisciRicettaSlot: DietaPlannerMotorV12 non disponibile.');
    return voce;
  }

  /* voce.fascia e' il target proteico/gruppo gia' assegnato allo slot dalla
     programmazione (stesso campo che il vecchio codice usava per il fallback
     per-portata). Se assente, 'legumi' e' lo stesso default gia' usato da
     rigeneraPasto per un target generico. */
  const target = voce.fascia || voce.categoriaTarget || 'legumi';

  const candidato = await window.DietaPlannerMotorV12.risolviSlotSingolo(giorno, pasto, target, {});
  if(!candidato || !Array.isArray(candidato.realizzazioni) || !candidato.realizzazioni.length){
    return voce;
  }

  voce.modo = 'multi';
  voce.motoreNuovo = true;
  voce.realizzazioni = candidato.realizzazioni;
  voce.categoriaTarget = target;

  /* Ripulisce eventuali campi legacy residui, cosi' un record non resta mai
     un ibrido tra i due schemi. */
  delete voce.primoId;
  delete voce.secondoId;
  delete voce.contornoId;
  delete voce.cotturaSecondo;
  delete voce.primoCereale;
  delete voce.ricettaId;

  if(typeof put === 'function') await put('piano', voce);
  return voce;
}
