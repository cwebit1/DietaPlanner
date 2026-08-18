/* SET v17 — configurazione parziale: ciò che manca viene completato dal motore. */
(function(){const fris=CONFIG_CARB_TIPI.find(x=>x.chiave==='friselle');if(fris)fris.maxIndividuale=1;aggiornaStatoConfigCarb=function(){const totale=contaTotaleCaselleCarb(),el=document.getElementById('cfgCarboidratiTotale');if(el){el.textContent='Configurati: '+totale+' / 14';el.style.color=totale?'var(--accent)':'var(--text-dim)';}};renderSetTabellaGiorno=async function(){const el=document.getElementById('setTabellaGiorno');if(!el)return;const rec=await getOne('impostazioni','tabellaGiornoCategoria'),tab=rec&&rec.valore?rec.valore:{},giorni=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'],cats=[{chiave:'carne',label:'Carne'},{chiave:'pesce',label:'Pesce'},{chiave:'formaggi',label:'Formaggi'},{chiave:'uova',label:'Uova'},{chiave:'legumi',label:'Legumi'}],head=giorni.map(g=>`<th style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:.68rem;padding:4px 2px;min-width:26px;text-align:center;">${g}</th>`).join(''),rows=cats.map(c=>{const max=FREQUENZE_MOTORE_BIBBIA[c.chiave].max,used=giorni.reduce((n,g,i)=>n+((tab['giorno_'+i]||[]).includes(c.chiave)?1:0),0),cells=giorni.map((g,i)=>{const arr=tab['giorno_'+i]||[],on=arr.includes(c.chiave),off=(arr.length>=2||used>=max)&&!on;return `<td class="cella"><button data-set-cella="${i}|${c.chiave}" class="${on?'active':''} ${off?'al-tetto':''}" ${off?'disabled':''} style="min-height:28px;min-width:28px;padding:4px;"></button></td>`;}).join('');return `<tr><td class="riga-label" style="text-align:left;padding-right:4px;">${c.label}</td>${cells}</tr>`;}).join('');el.innerHTML=`<table class="tabella-giorno"><tr><th class="col-label"></th>${head}</tr>${rows}</table>`;el.querySelectorAll('[data-set-cella]').forEach(b=>b.addEventListener('click',async()=>{const[ix,cat]=b.dataset.setCella.split('|'),k='giorno_'+parseInt(ix);tab[k]=tab[k]||[];const pos=tab[k].indexOf(cat);if(pos>=0)tab[k].splice(pos,1);else{const max=FREQUENZE_MOTORE_BIBBIA[cat].max,used=giorni.reduce((n,g,i)=>n+((tab['giorno_'+i]||[]).includes(cat)?1:0),0);if(used>=max){await avviso('Massimo settimanale raggiunto per '+cat+'.');return;}if(tab[k].length>=2){await avviso('Massimo 2 fonti proteiche per giorno.');return;}tab[k].push(cat);}await put('impostazioni',{chiave:'tabellaGiornoCategoria',valore:tab});renderSetTabellaGiorno();}));};function abilitaSalvataggioParziale(){const oldAll=document.getElementById('btnSalvaSetCompleto');if(oldAll&&!oldAll.dataset.v9){const b=oldAll.cloneNode(true);b.dataset.v9='1';oldAll.replaceWith(b);b.addEventListener('click',async()=>{await put('impostazioni',{chiave:'configCarboidrati',valore:statoCaselleCarb});const st=document.getElementById('setSalvaStato');if(st){st.textContent='✅ Configurazione salvata. Le parti non impostate saranno completate in rotazione.';st.style.color='var(--accent)';setTimeout(()=>st.textContent='',3000);}});}aggiornaStatoConfigCarb();}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',abilitaSalvataggioParziale);else abilitaSalvataggioParziale();document.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('[data-casella-carb]'))setTimeout(()=>put('impostazioni',{chiave:'configCarboidrati',valore:statoCaselleCarb}),0);});})();
COTTURE_STANDARD.carne_bianca=['alla piastra','al forno','al limone','a dadini','in padella'];COTTURE_STANDARD.affettati=[];COTTURE_STANDARD.pesce_conservato=[];const COTTURE_PER_PROTEINA_V10={'bresaola':[],'prosciutto crudo':[],'tonno in scatola':[],'sgombro in scatola':[],'mozzarella':[],'parmigiano':[]};scegliCotturaStandard=function(gruppoProteico,nomeProteina){const chiave=(nomeProteina||'').trim().toLowerCase(),cotture=Object.prototype.hasOwnProperty.call(COTTURE_PER_PROTEINA_V10,chiave)?COTTURE_PER_PROTEINA_V10[chiave]:COTTURE_STANDARD[gruppoProteico];if(!cotture||!cotture.length)return null;return cotture[Math.floor(Math.random()*cotture.length)];};

/* v34 — HARD granulare senza rompere i flussi esistenti.
   Questo file è caricato prima del v10: il wrapper viene installato al load,
   quindi dopo che motor-v10.js ha definito il generatore definitivo. */
(function(){
  function installaHardGranulare(){
    if(typeof put!=='function'||typeof generaPianoSettimana!=='function')return;
    if(put._hardGranulareV34)return;
    const putRaw=put;
    const generaRaw=generaPianoSettimana;

    const putWrap=async function(store,valore){
      if(store==='piano'&&valore&&valore.origine==='utente'){
        const id=valore.id||'';
        let assegnazione=false;
        try{
          const modal=document.getElementById('modalAssegnaAPasto');
          assegnazione=!!(modal&&!modal.classList.contains('hidden')&&typeof assegnaRicettaId!=='undefined'&&assegnaRicettaId&&typeof assegnaGiornoScelto!=='undefined'&&typeof assegnaPastoScelto!=='undefined'&&id===assegnaGiornoScelto+'_'+assegnaPastoScelto);
          if(assegnazione){
            const r=await getOne('ricette',assegnaRicettaId);
            const tipo=r?(r.tipoPortata||'unico'):null;
            if(tipo==='primo')valore.hardPrimo=true;
            else if(tipo==='secondo')valore.hardSecondo=true;
            else if(tipo==='contorno')valore.hardContorno=true;
            else if(tipo==='colazione')valore.hardColazione=true;
            else if(tipo!=='spuntino')valore.hardPasto=true;
          }
        }catch(e){ console.warn('HARD granulare: marker Ricettario non applicato',e); }
        if(!assegnazione){
          if(id.endsWith('_colazione')) valore.hardColazione=true;
          else if(id.endsWith('_pranzo')||id.endsWith('_cena')){
            if(!valore.hardPrimo&&!valore.hardSecondo&&!valore.hardContorno)valore.hardPasto=true;
          }
        }
      }
      return putRaw(store,valore);
    };
    putWrap._hardGranulareV34=true;
    put=putWrap;

    const generaWrap=async function(scartoSettimane,opzioni){
      const giorniTarget=new Set(giorniSettimana(scartoSettimane||0));
      const piano=await getAll('piano');
      for(const v of piano){
        if(!v||v.origine!=='utente'||v.hardPasto||v.hardColazione||v.modo!=='multi')continue;
        const data=(v.id||'').slice(0,10); if(!giorniTarget.has(data))continue;
        if(!v.hardPrimo&&!v.hardSecondo&&!v.hardContorno)continue;
        const seed=Object.assign({},v);
        if(!seed.hardPrimo){seed.primoId=null;seed.primoCereale=null;seed.primoSugoId=null;}
        if(!seed.hardSecondo){seed.secondoId=null;seed.cotturaSecondo=null;seed.categoriaLargaE1=null;seed.sottotipoProteicoMotore=null;}
        if(!seed.hardContorno)seed.contornoId=null;
        await putRaw('piano',seed);
      }
      return generaRaw(scartoSettimane,opzioni);
    };
    generaWrap._hardGranulareV34=true;
    generaPianoSettimana=generaWrap;
  }
  if(document.readyState==='complete')setTimeout(installaHardGranulare,0);
  else window.addEventListener('load',()=>setTimeout(installaHardGranulare,0));
})();
