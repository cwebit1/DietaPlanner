from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')

start=s.find('function renderCaselleCarboidrati(){')
end=s.find('function aggiornaStatoConfigCarb(){', start)
if start<0 or end<0:
    raise SystemExit('renderCaselleCarboidrati block not found')

new_func=r'''function renderCaselleCarboidrati(){
  const contenitore=document.getElementById('cfgCarboidratiContenuto');
  if(!contenitore) return;

  const totaleAttuale=contaTotaleCaselleCarb();
  const limiteRaggiunto=totaleAttuale>=CONFIG_CARB_TOTALE_OBBLIGATORIO;
  const limitateUsate=contaCaselleLimitateCarb();
  const tettoLimitatiRaggiunto=limitateUsate>=CONFIG_CARB_TETTO_LIMITATI;

  const renderGruppo=(tipi,titolo,tipoGruppo)=>{
    const eLimitati=tipoGruppo==='limitati';
    const colore=eLimitati?'#f39c12':'#2ecc71';
    const contatore=eLimitati?` <span style="font-weight:800;margin-left:7px;">${limitateUsate}/${CONFIG_CARB_TETTO_LIMITATI}</span>`:'';
    let html=`<div style="margin:12px 0 9px;">
      <span style="display:inline-block;border:1px solid ${colore};color:${colore};border-radius:20px;padding:3px 10px;font-size:.72rem;font-weight:700;line-height:1.2;">${titolo}${contatore}</span>
    </div><div class="set-carb-grid">`;

    for(const tipo of tipi){
      const cliccate=statoCaselleCarb[tipo.chiave]||0;
      const maxIndividuale=Number.isFinite(tipo.maxIndividuale)?tipo.maxIndividuale:CONFIG_CARB_MAX_CASELLE;
      const puoAggiungere=!limiteRaggiunto && (!tipo.limitato || (!tettoLimitatiRaggiunto && cliccate<maxIndividuale));
      const badgeLimitato=tipo.limitato?`<span style="font-size:0.62rem;color:var(--warn);margin-left:3px;">⚠ max ${maxIndividuale}</span>`:'';

      html+=`<div class="set-carb-item"><div style="font-weight:600;font-size:0.78rem;margin-bottom:4px;white-space:normal;">${tipo.label}${badgeLimitato}</div><div class="set-carb-celle">`;
      for(let i=0;i<CONFIG_CARB_MAX_CASELLE;i++){
        const attiva=i<cliccate;
        const cliccabile=attiva || puoAggiungere;
        html+=`<button data-casella-carb="${tipo.chiave}" data-casella-idx="${i}"
          style="cursor:${cliccabile?'pointer':'not-allowed'};opacity:${cliccabile?'1':'0.35'};transition:background .15s,border-color .15s;"
          ${cliccabile?'':'disabled'}></button>`;
      }
      html+='</div></div>';
    }
    return html+'</div>';
  };

  const normali=CONFIG_CARB_TIPI.filter(t=>!t.limitato);
  const limitati=CONFIG_CARB_TIPI.filter(t=>t.limitato);
  contenitore.innerHTML=
    renderGruppo(normali,'Carboidrati complessi','normali')+
    renderGruppo(limitati,'Carboidrati complessi razionati','limitati');

  contenitore.querySelectorAll('[data-casella-carb]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const chiave=btn.dataset.casellaCarb;
      const idx=parseInt(btn.dataset.casellaIdx);
      const tipo=CONFIG_CARB_TIPI.find(t=>t.chiave===chiave);
      if(!tipo) return;
      const cliccateAttuali=statoCaselleCarb[chiave]||0;

      if(idx<cliccateAttuali){
        statoCaselleCarb[chiave]=cliccateAttuali-1;
      }else{
        if(contaTotaleCaselleCarb()>=CONFIG_CARB_TOTALE_OBBLIGATORIO) return;
        if(tipo.limitato){
          if(contaCaselleLimitateCarb()>=CONFIG_CARB_TETTO_LIMITATI) return;
          const maxIndividuale=Number.isFinite(tipo.maxIndividuale)?tipo.maxIndividuale:CONFIG_CARB_MAX_CASELLE;
          if(cliccateAttuali>=maxIndividuale) return;
        }
        statoCaselleCarb[chiave]=cliccateAttuali+1;
      }

      renderCaselleCarboidrati();
      aggiornaStatoConfigCarb();
    });
  });
}

'''

s=s[:start]+new_func+s[end:]
p.write_text(s,encoding='utf-8')
print('v24: bordered carbohydrate section titles + independent global 3/3 and per-item rationed limits')
# trigger v24
