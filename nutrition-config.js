(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.DietaPlannerNutritionConfig=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='PDF-V1.2';

  const PDF_BASELINE={
    proteinFrequencies:{
      carne:{min:1,max:3},
      pesce:{min:2,max:3},
      formaggi:{min:2,max:3},
      uova:{min:1,max:2},
      legumi:{min:2,max:null}
    },
    subtypeCaps:{carne_rossa:1,affettati:1,pesce_grande:1,pesce_conservato:1},
    carbohydrateWeeklyCaps:{
      gnocchi:2,
      pasta_ripiena:2,
      gallette:2,
      crackers:2,
      friselle:2,
      taralli:2,
      piadina:2,
      pasta_sfoglia:2
    },
    carbohydrateUncapped:['pasta','pasta_fresca','riso','farro','orzo','cous_cous','pane','patate','polenta'],
    fruit:{dailyMin:2,dailyMax:3,portionMinGrams:150,portionMaxGrams:200},
    vegetables:{vegetablePortionMinGrams:200,vegetablePortionMaxGrams:250,saladPortionMinGrams:70,saladPortionMaxGrams:80},
    specialBreakfastMax:2,
    snackWeeklyMax:{grana_spuntino:3,crackers_spuntino:3,pane_marmellata_spuntino:3,granita_spuntino:3,patatine_grisbi:2},
    snackDailyMax:{frutta_secca_giornaliero:1},
    oil:{minGramsPerMeal:10,maxGramsPerMeal:15}
  };

  const APP_DEFAULTS={
    proteinTargets:{carne:3,pesce:3,formaggi:3,uova:2,legumi:3},
    maxProteinSourcesPerDay:2,
    specialBreakfastMax:1,
    specialMealsMax:2,
    snackWeeklyCaps:{da_limitare:2,grana_spuntino:2,crackers_spuntino:2,pane_marmellata_spuntino:2,granita_spuntino:2,patatine_grisbi:1},
    snackDailyCaps:{frutta_secca_giornaliero:1},
    cooldownDays:{carboidrati:7,verdure:2},
    oilGramsPerMeal:10,
    deadlines:{pranzo:'15:00',cena:'22:00'},
    carbSlots:14,
    carbCellMax:6,
    limitedCarbTotalMax:3
  };

  const PROFILE_FORBIDDEN_MACROS={
    onnivoro:[],
    vegetariano:['carne','pesce'],
    vegano:['carne','pesce','formaggi','uova']
  };

  /* Metadata PDF contestuali. Gli alias per nome servono soltanto a collegare
     il catalogo corrente alla baseline; il motore non deve dedurre regole dal nome.
     Quando il catalogo avrà metadata espliciti, questi alias potranno essere migrati. */
  const PDF_CONTEXT_RULES_EXACT={
    'uova':{
      colazione:{maxPerWeek:2,quantityDefault:1,quantityMin:1,quantityMax:2,unit:'pz'},
      pastoPrincipale:{quantityDefault:2,quantityMin:2,quantityMax:2,unit:'pz'}
    },
    'ricotta':{
      colazione:{quantityDefault:50,quantityMin:50,quantityMax:60,unit:'g'},
      pastoPrincipale:{quantityDefault:100,quantityMin:100,quantityMax:100,unit:'g'}
    },
    'salmone affumicato':{
      colazione:{quantityDefault:40,quantityMin:40,quantityMax:40,unit:'g'},
      pastoPrincipale:{quantityDefault:100,quantityMin:100,quantityMax:100,unit:'g'}
    },
    'burro':{
      colazione:{maxPerWeek:2,note:'1 cucchiaino; quantità in grammi da non inferire senza metadata unità'}
    },
    'crema di nocciole e cacao':{
      colazione:{maxPerWeek:2,note:'1 cucchiaino; quantità in grammi da non inferire senza metadata unità'}
    }
  };
  const PDF_CONTEXT_RULES_SUBTYPE={
    affettati:{
      colazione:{quantityDefault:40,quantityMin:40,quantityMax:40,unit:'g'},
      pastoPrincipale:{quantityDefault:60,quantityMin:60,quantityMax:60,unit:'g'}
    }
  };

  function clone(value){
    if(value===undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }
  function mergeContextRules(base,extra){
    const out=clone(base||{});
    for(const [context,rule] of Object.entries(extra||{}))out[context]=Object.assign({},out[context]||{},clone(rule));
    return out;
  }
  function contextDefaultsForIngredient(meta){
    meta=meta||{};
    const name=String(meta.nome||meta.name||'').trim().toLowerCase(),subtype=meta.sottotipo||meta.subtype||null;
    return mergeContextRules(PDF_CONTEXT_RULES_SUBTYPE[subtype],PDF_CONTEXT_RULES_EXACT[name]);
  }
  function own(obj,key){return !!obj&&Object.prototype.hasOwnProperty.call(obj,key);}
  function finite(value){const n=Number(value);return Number.isFinite(n)?n:null;}
  function nonNegative(value){const n=finite(value);return n!==null&&n>=0?n:null;}
  function positive(value){const n=finite(value);return n!==null&&n>0?n:null;}
  function clamp(value,min,max){
    let n=Number(value);
    if(!Number.isFinite(n)) return null;
    if(min!==null&&min!==undefined) n=Math.max(min,n);
    if(max!==null&&max!==undefined) n=Math.min(max,n);
    return n;
  }
  function integer(value){
    const n=finite(value);
    return n===null?null:Math.trunc(n);
  }
  function pushUnique(arr,msg){if(!arr.includes(msg))arr.push(msg);}

  function resolveProteinFrequencies(raw,warnings,errors){
    const out={};
    raw=raw||{};
    for(const key of Object.keys(PDF_BASELINE.proteinFrequencies)){
      const pdf=PDF_BASELINE.proteinFrequencies[key],req=raw[key]||{};
      const reqMin=own(req,'min')?finite(req.min):pdf.min;
      const reqMax=own(req,'max')?(req.max===null?null:finite(req.max)):pdf.max;

      let min=reqMin===null?pdf.min:reqMin;
      let max=reqMax;

      if(min<pdf.min){
        pushUnique(warnings,key+': minimo nutrizionista alzato al minimo PDF '+pdf.min+'.');
        min=pdf.min;
      }
      if(pdf.max!==null&&min>pdf.max){
        pushUnique(errors,key+': minimo nutrizionista '+min+' supera il massimo PDF '+pdf.max+'.');
        min=pdf.max;
      }

      if(pdf.max!==null){
        if(max===null||max===undefined){
          if(max===null) pushUnique(warnings,key+': massimo null non può allargare il massimo PDF '+pdf.max+'.');
          max=pdf.max;
        }else if(max>pdf.max){
          pushUnique(warnings,key+': massimo nutrizionista ridotto al massimo PDF '+pdf.max+'.');
          max=pdf.max;
        }
      }else if(max!==null&&max!==undefined&&max<0){
        pushUnique(errors,key+': massimo nutrizionista negativo.');
        max=null;
      }

      if(max!==null&&max!==undefined&&max<min){
        pushUnique(errors,key+': minimo effettivo '+min+' supera il massimo effettivo '+max+'.');
        max=min;
      }

      let target=own(req,'target')?finite(req.target):APP_DEFAULTS.proteinTargets[key];
      if(target===null) target=APP_DEFAULTS.proteinTargets[key];
      target=Math.max(min,target);
      if(max!==null&&max!==undefined) target=Math.min(max,target);

      const quantity=positive(req.quantita);
      out[key]={min,max,target,quantita:quantity};
    }
    return out;
  }

  function resolveSubtypeCaps(raw,warnings,errors){
    raw=raw||{};
    const out={};
    for(const [key,pdfMax] of Object.entries(PDF_BASELINE.subtypeCaps)){
      let value=own(raw,key)?integer(raw[key]):pdfMax;
      if(value===null) value=pdfMax;
      if(value<0){
        pushUnique(errors,key+': tetto sottotipo negativo.');
        value=0;
      }
      if(value>pdfMax){
        pushUnique(warnings,key+': tetto sottotipo ridotto al massimo PDF '+pdfMax+'.');
        value=pdfMax;
      }
      out[key]=value;
    }
    return out;
  }

  function resolveFruit(raw,warnings,errors){
    raw=raw||{};
    let min=own(raw,'min')?finite(raw.min):PDF_BASELINE.fruit.dailyMin;
    let max=own(raw,'max')?finite(raw.max):PDF_BASELINE.fruit.dailyMax;
    let portionMin=own(raw,'portionMin')?finite(raw.portionMin):PDF_BASELINE.fruit.portionMinGrams;
    let portionMax=own(raw,'portionMax')?finite(raw.portionMax):PDF_BASELINE.fruit.portionMaxGrams;

    min=min===null?PDF_BASELINE.fruit.dailyMin:min;
    max=max===null?PDF_BASELINE.fruit.dailyMax:max;
    portionMin=portionMin===null?PDF_BASELINE.fruit.portionMinGrams:portionMin;
    portionMax=portionMax===null?PDF_BASELINE.fruit.portionMaxGrams:portionMax;

    if(min<PDF_BASELINE.fruit.dailyMin){pushUnique(warnings,'Frutta: minimo giornaliero alzato al PDF.');min=PDF_BASELINE.fruit.dailyMin;}
    if(min>PDF_BASELINE.fruit.dailyMax){pushUnique(errors,'Frutta: minimo giornaliero supera il massimo PDF.');min=PDF_BASELINE.fruit.dailyMax;}
    if(max>PDF_BASELINE.fruit.dailyMax){pushUnique(warnings,'Frutta: massimo giornaliero ridotto al PDF.');max=PDF_BASELINE.fruit.dailyMax;}
    if(max<PDF_BASELINE.fruit.dailyMin){pushUnique(errors,'Frutta: massimo giornaliero sotto il minimo PDF.');max=PDF_BASELINE.fruit.dailyMin;}
    if(min>max){pushUnique(errors,'Frutta: minimo superiore al massimo.');max=min;}

    if(portionMin<PDF_BASELINE.fruit.portionMinGrams){pushUnique(warnings,'Frutta: porzione minima alzata al PDF.');portionMin=PDF_BASELINE.fruit.portionMinGrams;}
    if(portionMin>PDF_BASELINE.fruit.portionMaxGrams){pushUnique(errors,'Frutta: porzione minima supera il massimo PDF.');portionMin=PDF_BASELINE.fruit.portionMaxGrams;}
    if(portionMax>PDF_BASELINE.fruit.portionMaxGrams){pushUnique(warnings,'Frutta: porzione massima ridotta al PDF.');portionMax=PDF_BASELINE.fruit.portionMaxGrams;}
    if(portionMax<PDF_BASELINE.fruit.portionMinGrams){pushUnique(errors,'Frutta: porzione massima sotto il minimo PDF.');portionMax=PDF_BASELINE.fruit.portionMinGrams;}
    if(portionMin>portionMax){pushUnique(errors,'Frutta: porzione minima superiore alla massima.');portionMax=portionMin;}

    return {min,max,portionMin,portionMax};
  }

  function resolveIngredientConstraints(clinical,userCaps,errors){
    clinical=clinical||{};
    userCaps=userCaps||{};
    const out={};
    const keys=new Set([...Object.keys(clinical),...Object.keys(userCaps)]);
    const contexts=['colazione','pastoPrincipale','spuntino'];
    for(const id of keys){
      const c=clinical[id]||{},user=own(userCaps,id)?nonNegative(userCaps[id]):null;
      const contextRules={};
      for(const context of contexts){
        const raw=c.contesti&&c.contesti[context]||{};
        const q=raw.quantita===null||raw.quantita===undefined?null:positive(raw.quantita);
        const mx=raw.max===null||raw.max===undefined?null:nonNegative(raw.max);
        if(raw.quantita!==null&&raw.quantita!==undefined&&q===null)pushUnique(errors,'Ingrediente '+id+' ('+context+'): quantità contestuale non valida.');
        if(raw.max!==null&&raw.max!==undefined&&mx===null)pushUnique(errors,'Ingrediente '+id+' ('+context+'): massimo contestuale non valido.');
        contextRules[context]={quantity:q,max:mx};
      }
      if(c.stato==='escluso'){
        out[id]={state:'excluded',clinicalState:'escluso',min:null,max:0,quantity:null,contexts:contextRules,userMax:user};
        continue;
      }
      const clinicalLimited=c.stato==='limitato';
      let min=clinicalLimited&&c.min!==null&&c.min!==undefined?nonNegative(c.min):null;
      let clinicalMax=clinicalLimited&&c.max!==null&&c.max!==undefined?nonNegative(c.max):null;
      const quantity=clinicalLimited?positive(c.quantita):null;
      if(clinicalLimited&&c.quantita!==null&&c.quantita!==undefined&&quantity===null)pushUnique(errors,'Ingrediente '+id+': quantità non valida.');
      if(clinicalLimited&&min!==null&&clinicalMax!==null&&clinicalMax<min){
        pushUnique(errors,'Ingrediente '+id+': minimo clinico '+min+' supera il massimo clinico '+clinicalMax+'.');
        clinicalMax=min;
      }
      let max=clinicalMax;
      if(user!==null) max=max===null?user:Math.min(max,user);

      if(min!==null&&max!==null&&max<min){
        pushUnique(errors,'Ingrediente '+id+': il tetto utente '+max+' è sotto il minimo clinico '+min+'.');
        max=min;
      }
      const state=clinicalLimited?'limited':(user!==null?'user_limited':'available');
      out[id]={state,clinicalState:c.stato||'disponibile',min,max,quantity,contexts:contextRules,userMax:user};
    }
    return out;
  }

  function normalizeCarbohydrateSelection(input){
    input=input||{};
    const counts=input.counts||input.configCarboidrati||{};
    const explicitZeroKeys=new Set(input.explicitZeroKeys||input.configCarboidratiExplicitZeroKeys||[]);
    const states=input.states||{};
    const keys=[...PDF_BASELINE.carbohydrateUncapped,...Object.keys(PDF_BASELINE.carbohydrateWeeklyCaps)];
    const out={};

    for(const key of keys){
      const st=states[key];
      if(st&&typeof st==='object'&&['auto','excluded','fixed'].includes(st.mode)){
        const count=st.mode==='fixed'?Math.max(0,integer(st.count)||0):0;
        out[key]={mode:st.mode,count};
        continue;
      }
      if(st==='auto'||st==='excluded'){
        out[key]={mode:st,count:0};
        continue;
      }
      if(typeof st==='number'&&st>0){
        out[key]={mode:'fixed',count:Math.trunc(st)};
        continue;
      }

      const n=own(counts,key)?integer(counts[key]):null;
      if(explicitZeroKeys.has(key)){
        out[key]={mode:'excluded',count:0};
      }else if(n!==null&&n>0){
        out[key]={mode:'fixed',count:n};
      }else{
        // Legacy: 0 senza marcatore esplicito resta AUTO, per distinguere
        // "mai configurato" da "utente ha scelto zero".
        out[key]={mode:'auto',count:0};
      }
    }
    return out;
  }

  function resolveCarbohydratePlan(input,errors){
    const selection=normalizeCarbohydrateSelection(input);
    const fixedCounts={},excludedKeys=[],autoEligibleKeys=[];
    let fixedTotal=0,limitedFixedTotal=0;

    for(const [key,state] of Object.entries(selection)){
      const pdfCap=PDF_BASELINE.carbohydrateWeeklyCaps[key];
      if(state.mode==='excluded'){
        excludedKeys.push(key);
        continue;
      }
      if(state.mode==='fixed'){
        let n=Math.max(0,integer(state.count)||0);
        if(n>APP_DEFAULTS.carbCellMax){
          pushUnique(errors,key+': '+n+' occorrenze superano il tetto applicativo per singolo carboidrato '+APP_DEFAULTS.carbCellMax+'.');
        }
        if(pdfCap!==undefined&&n>pdfCap){
          pushUnique(errors,key+': '+n+' occorrenze superano il tetto PDF '+pdfCap+'.');
        }
        fixedCounts[key]=n;
        fixedTotal+=n;
        if(pdfCap!==undefined) limitedFixedTotal+=n;
        continue;
      }
      if(pdfCap===undefined) autoEligibleKeys.push(key);
    }

    if(limitedFixedTotal>APP_DEFAULTS.limitedCarbTotalMax){
      pushUnique(errors,'Carboidrati limitati: '+limitedFixedTotal+' occorrenze superano il tetto applicativo totale '+APP_DEFAULTS.limitedCarbTotalMax+'.');
    }
    if(fixedTotal>APP_DEFAULTS.carbSlots){
      pushUnique(errors,'Carboidrati: '+fixedTotal+' occorrenze fisse superano i '+APP_DEFAULTS.carbSlots+' slot settimanali.');
    }

    const remainingSlots=Math.max(0,APP_DEFAULTS.carbSlots-fixedTotal);
    if(remainingSlots>0&&autoEligibleKeys.length===0){
      pushUnique(errors,'Carboidrati: nessuna voce AUTO senza tetto disponibile per completare i '+remainingSlots+' slot residui.');
    }

    return {
      selection,
      fixedCounts,
      fixedTotal,
      remainingSlots,
      autoEligibleKeys,
      excludedKeys,
      limitedFixedTotal,
      totalSlots:APP_DEFAULTS.carbSlots,
      randomizeNature:true,
      randomizePlacement:true,
      autoInsertWeeklyCapped:false
    };
  }

  function resolveVegetablePortions(raw,warnings){
    raw=raw||{};
    let vegetable=positive(raw.vegetablePortionGrams)||PDF_BASELINE.vegetables.vegetablePortionMinGrams;
    let salad=positive(raw.saladPortionGrams)||PDF_BASELINE.vegetables.saladPortionMinGrams;
    if(vegetable<PDF_BASELINE.vegetables.vegetablePortionMinGrams){
      pushUnique(warnings,'Verdura: porzione ortaggi alzata al minimo PDF.');
      vegetable=PDF_BASELINE.vegetables.vegetablePortionMinGrams;
    }
    if(vegetable>PDF_BASELINE.vegetables.vegetablePortionMaxGrams){
      pushUnique(warnings,'Verdura: porzione ortaggi ridotta al massimo PDF.');
      vegetable=PDF_BASELINE.vegetables.vegetablePortionMaxGrams;
    }
    if(salad<PDF_BASELINE.vegetables.saladPortionMinGrams){
      pushUnique(warnings,'Verdura: porzione insalata alzata al minimo PDF.');
      salad=PDF_BASELINE.vegetables.saladPortionMinGrams;
    }
    if(salad>PDF_BASELINE.vegetables.saladPortionMaxGrams){
      pushUnique(warnings,'Verdura: porzione insalata ridotta al massimo PDF.');
      salad=PDF_BASELINE.vegetables.saladPortionMaxGrams;
    }
    return {vegetablePortionGrams:vegetable,saladPortionGrams:salad};
  }

  function vegetableCoverage(entries,portionConfig){
    entries=Array.isArray(entries)?entries:[];
    const cfg=Object.assign({vegetablePortionGrams:200,saladPortionGrams:70},portionConfig||{});
    let rawFraction=0;
    for(const row of entries){
      if(!row) continue;
      const qty=nonNegative(row.quantity);
      if(qty===null||qty<=0) continue;
      const target=row.kind==='salad'?cfg.saladPortionGrams:cfg.vegetablePortionGrams;
      if(target>0) rawFraction+=qty/target;
    }
    const coveredFraction=Math.min(1,rawFraction);
    const remainingFraction=Math.max(0,1-coveredFraction);
    return {
      coveredFraction,
      remainingFraction,
      rawFraction,
      residualVegetableGrams:remainingFraction*cfg.vegetablePortionGrams,
      residualSaladGrams:remainingFraction*cfg.saladPortionGrams
    };
  }

  function resolveNutritionConfig(input){
    input=input||{};
    const warnings=[],errors=[];
    const nutritionist=input.nutritionist||{};
    const config=nutritionist.config||input.configAvanzata||{};
    const user=input.user||{};

    const profileName=PROFILE_FORBIDDEN_MACROS[config.dietProfile]?config.dietProfile:'onnivoro';
    if(config.dietProfile&&!PROFILE_FORBIDDEN_MACROS[config.dietProfile]){
      pushUnique(warnings,'Profilo alimentare sconosciuto: usato onnivoro.');
    }

    const proteinFrequencies=resolveProteinFrequencies(config.proteinFrequencies,warnings,errors);
    const subtypeCaps=resolveSubtypeCaps(config.subtypeCaps,warnings,errors);
    const fruit=resolveFruit(config.fruit,warnings,errors);
    const vegetablePortions=resolveVegetablePortions(config.vegetables,warnings);

    const specialBreakfastRequested=own(config,'specialBreakfastMax')?nonNegative(config.specialBreakfastMax):APP_DEFAULTS.specialBreakfastMax;
    let specialBreakfastMax=specialBreakfastRequested===null?APP_DEFAULTS.specialBreakfastMax:specialBreakfastRequested;
    if(specialBreakfastMax>PDF_BASELINE.specialBreakfastMax){
      pushUnique(warnings,'Colazioni speciali: massimo ridotto al PDF '+PDF_BASELINE.specialBreakfastMax+'.');
      specialBreakfastMax=PDF_BASELINE.specialBreakfastMax;
    }

    const snackWeeklyCaps=Object.assign({},APP_DEFAULTS.snackWeeklyCaps,config.snackWeeklyCaps||{});
    for(const [key,pdfMax] of Object.entries(PDF_BASELINE.snackWeeklyMax)){
      let n=nonNegative(snackWeeklyCaps[key]);
      if(n===null) n=APP_DEFAULTS.snackWeeklyCaps[key];
      if(n>pdfMax){
        pushUnique(warnings,'Spuntino '+key+': massimo ridotto al PDF '+pdfMax+'.');
        n=pdfMax;
      }
      snackWeeklyCaps[key]=n;
    }
    const snackDailyCaps=Object.assign({},APP_DEFAULTS.snackDailyCaps,config.snackDailyCaps||{});
    for(const [key,pdfMax] of Object.entries(PDF_BASELINE.snackDailyMax)){
      let n=nonNegative(snackDailyCaps[key]);
      if(n===null) n=APP_DEFAULTS.snackDailyCaps[key];
      if(n>pdfMax){
        pushUnique(warnings,'Spuntino '+key+': massimo giornaliero ridotto al PDF '+pdfMax+'.');
        n=pdfMax;
      }
      snackDailyCaps[key]=n;
    }

    let oilGramsPerMeal=positive(config.oilGramsPerMeal)||APP_DEFAULTS.oilGramsPerMeal;
    if(oilGramsPerMeal<PDF_BASELINE.oil.minGramsPerMeal){
      pushUnique(warnings,'Olio: quantità alzata al minimo PDF '+PDF_BASELINE.oil.minGramsPerMeal+' g.');
      oilGramsPerMeal=PDF_BASELINE.oil.minGramsPerMeal;
    }
    if(oilGramsPerMeal>PDF_BASELINE.oil.maxGramsPerMeal){
      pushUnique(warnings,'Olio: quantità ridotta al massimo PDF '+PDF_BASELINE.oil.maxGramsPerMeal+' g.');
      oilGramsPerMeal=PDF_BASELINE.oil.maxGramsPerMeal;
    }

    const userIngredientCaps=user.ingredientWeeklyCaps||user.tettiIngredienteSettimanali||{};
    const clinicalIngredients=nutritionist.ingredientConstraints||input.vincoliIngredientiNutrizionista||{};
    const ingredientConstraints=resolveIngredientConstraints(clinicalIngredients,userIngredientCaps,errors);

    const carbInput=user.carbohydrates||{
      counts:user.configCarboidrati||{},
      explicitZeroKeys:user.configCarboidratiExplicitZeroKeys||[],
      states:user.configCarboidratiStati||{}
    };
    const carbohydrates=resolveCarbohydratePlan(carbInput,errors);

    const maxProteinSourcesPerDay=positive(config.maxProteinSourcesPerDay)||APP_DEFAULTS.maxProteinSourcesPerDay;
    const specialMealsMax=nonNegative(config.specialMealsMax);
    const cooldownDays=Object.assign({},APP_DEFAULTS.cooldownDays,config.cooldownDays||{});
    const deadlines=Object.assign({},APP_DEFAULTS.deadlines,config.deadlines||{});

    const allergens=[...new Set(nutritionist.allergens||input.allergeniAttivi||[])];
    const blockedIngredientIds=[...new Set(nutritionist.blockedIngredientIds||input.ingredientiBloccati||[])];

    return {
      version:VERSION,
      valid:errors.length===0,
      errors,
      warnings,
      profile:{name:profileName,forbiddenProteinMacros:PROFILE_FORBIDDEN_MACROS[profileName].slice()},
      proteinFrequencies,
      subtypeCaps,
      ingredientConstraints,
      carbohydrates,
      fruit,
      vegetables:vegetablePortions,
      maxProteinSourcesPerDay,
      specialBreakfastMax,
      specialMealsMax:specialMealsMax===null?APP_DEFAULTS.specialMealsMax:specialMealsMax,
      snackWeeklyCaps,
      snackDailyCaps,
      oilGramsPerMeal,
      cooldownDays,
      deadlines,
      safety:{allergens,blockedIngredientIds}
    };
  }

  return {
    VERSION,
    PDF_BASELINE:clone(PDF_BASELINE),
    APP_DEFAULTS:clone(APP_DEFAULTS),
    PROFILE_FORBIDDEN_MACROS:clone(PROFILE_FORBIDDEN_MACROS),
    PDF_CONTEXT_RULES_EXACT:clone(PDF_CONTEXT_RULES_EXACT),
    PDF_CONTEXT_RULES_SUBTYPE:clone(PDF_CONTEXT_RULES_SUBTYPE),
    contextDefaultsForIngredient,
    normalizeCarbohydrateSelection,
    resolveCarbohydratePlan:function(input){const errors=[];const plan=resolveCarbohydratePlan(input,errors);return Object.assign({valid:errors.length===0,errors},plan);},
    vegetableCoverage,
    resolveNutritionConfig
  };
});
