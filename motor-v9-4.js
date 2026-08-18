/* SET v9 — consente configurazione parziale: ciò che manca viene completato dal motore. */
(function(){
  const fris=CONFIG_CARB_TIPI.find(x=>x.chiave==='friselle');
  if(fris) fris.maxIndividuale=2;

  aggiornaStatoConfigCarb = function(){
    const totale=contaTotaleCaselleCarb();
    const el=document.getElementById('cfgCarboidratiTotale');
    const btn=document.getElementById('btnSalvaConfigCarboidrati');
    if(el){
      el.textContent='Configurati: '+totale+' / 14 — le caselle mancanti saranno completate in rotazione';
      el.style.color=totale?'var(--accent)':'var(--text-dim)';
    }
    if(btn) btn.disabled=false;
  };

  renderSetTabellaGiorno = async function(){
    const el=document.getElementById('setTabellaGiorno'); if(!el)return;
    const rec=await getOne('impostazioni','tabellaGiornoCategoria');
    const tab=rec&&rec.valore?rec.valore:{};
    const giorni=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
    const cats=[
      {chiave:'carne',label:'Carne'},{chiave:'pesce',label:'Pesce'},
      {chiave:'formaggi',label:'Formaggi'},{chiave:'uova',label:'Uova'},{chiave:'legumi',label:'Legumi'}
    ];
    const head=giorni.map(g=>`<th style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:.68rem;padding:4px 2px;min-width:26px;text-align:center;">${g}</th>`).join('');
    const rows=cats.map(c=>{
      const max=FREQUENZE_MOTORE_BIBBIA[c.chiave].max;
      const used=giorni.reduce((n,g,i)=>n+((tab['giorno_'+i]||[]).includes(c.chiave)?1:0),0);
      const cells=giorni.map((g,i)=>{
        const arr=tab['giorno_'+i]||[];
        const on=arr.includes(c.chiave);
        const dayFull=arr.length>=2&&!on;
        const capFull=used>=max&&!on;
        return `<td class="cella"><button data-set-cella="${i}|${c.chiave}" class="${on?'active':''} ${(dayFull||capFull)?'al-tetto':''}" ${dayFull||capFull?'disabled':''} style="min-height:36px;min-width:36px;"></button></td>`;
      }).join('');
      const lim=max>=14?'':` <span class="meta">(max ${max})</span>`;
      return `<tr><td class="riga-label">${c.label}${lim}</td>${cells}</tr>`;
    }).join('');
    el.innerHTML=`<table class="tabella-giorno"><tr><th class="col-label"></th>${head}</tr>${rows}</table>`;
    el.querySelectorAll('[data-set-cella]').forEach(b=>b.addEventListener('click',async()=>{
      const [ix,cat]=b.dataset.setCella.split('|'); const k='giorno_'+parseInt(ix);
      tab[k]=tab[k]||[]; const pos=tab[k].indexOf(cat);
      if(pos>=0) tab[k].splice(pos,1); else{
        const max=FREQUENZE_MOTORE_BIBBIA[cat].max;
        const used=giorni.reduce((n,g,i)=>n+((tab['giorno_'+i]||[]).includes(cat)?1:0),0);
        if(used>=max){await avviso('Massimo settimanale raggiunto per '+cat+'.');return;}
        if(tab[k].length>=2){await avviso('Massimo 2 fonti proteiche per giorno.');return;}
        tab[k].push(cat);
      }
      await put('impostazioni',{chiave:'tabellaGiornoCategoria',valore:tab});
      renderSetTabellaGiorno();
    }));
  };

  // Sostituisce i due pulsanti di salvataggio che prima obbligavano a compilare 14 caselle.
  function abilitaSalvataggioParziale(){
    const old=document.getElementById('btnSalvaConfigCarboidrati');
    if(old&&!old.dataset.v9){
      const b=old.cloneNode(true); b.dataset.v9='1'; b.disabled=false; old.replaceWith(b);
      b.addEventListener('click',async()=>{
        await put('impostazioni',{chiave:'configCarboidrati',valore:statoCaselleCarb});
        await avviso('✅ Configurazione carboidrati salvata. Le caselle non definite saranno completate dal motore.');
      });
    }
    const oldAll=document.getElementById('btnSalvaSetCompleto');
    if(oldAll&&!oldAll.dataset.v9){
      const b=oldAll.cloneNode(true); b.dataset.v9='1'; oldAll.replaceWith(b);
      b.addEventListener('click',async()=>{
        await put('impostazioni',{chiave:'configCarboidrati',valore:statoCaselleCarb});
        const st=document.getElementById('setSalvaStato');
        if(st){st.textContent='✅ Configurazione salvata. Le parti non impostate saranno completate in rotazione.';st.style.color='var(--accent)';setTimeout(()=>st.textContent='',3000);}
      });
    }
    aggiornaStatoConfigCarb();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',abilitaSalvataggioParziale);
  else abilitaSalvataggioParziale();

  // Salvataggio live delle caselle carboidrati: rende realmente persistente anche un Set parziale.
  document.addEventListener('click',e=>{
    if(e.target&&e.target.closest&&e.target.closest('[data-casella-carb]')){
      setTimeout(()=>put('impostazioni',{chiave:'configCarboidrati',valore:statoCaselleCarb}),0);
    }
  });
})();
