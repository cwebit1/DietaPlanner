'use strict';
const fs=require('fs');
const p=require('path');
const root=p.resolve(__dirname,'..');
const ingredientsPath=p.join(root,'ingredienti.json');
const recipesPath=p.join(root,'ricette.json');
const ingredientsDoc=JSON.parse(fs.readFileSync(ingredientsPath));
const recipesDoc=JSON.parse(fs.readFileSync(recipesPath));
const ingredients=ingredientsDoc.ingredienti;
const extraIngredients={
  'Ravioli ricotta e spinaci':{kcal:250,proteine:10,carboidrati:35,grassi:8,gruppo:'carboidrati',deperibilita:'media',conservazione:'breve',porzione:125},
  'Gallette di riso':{kcal:385,proteine:8,carboidrati:81,grassi:3,gruppo:'carboidrati',deperibilita:'bassa',conservazione:'lunga',porzione:50},
  'Taralli':{kcal:430,proteine:10,carboidrati:67,grassi:14,gruppo:'carboidrati',deperibilita:'bassa',conservazione:'lunga',porzione:65},
  'Piadina':{kcal:340,proteine:8,carboidrati:52,grassi:11,gruppo:'carboidrati',deperibilita:'bassa',conservazione:'lunga',porzione:80}
};
for(const [name,x] of Object.entries(extraIngredients))if(!ingredients[name])ingredients[name]=Object.assign({gradimento:1,stock:1,formatoRiordino:{valore:null,unita:null},allergeni:[],bloccoManuale:false},x);

const allergens={
  glutine:/pasta|pane|orzo|farro|cous cous|noodles|fette biscottate|cereali da colazione|biscotti|friselle|cracker|farina|sfoglie|gnocchi|tagliolini/i,
  uova:/uova|tagliolini all'uovo/i,
  pesce:/tonno|nasello|sogliola|sgombro|salmone|orata|branzino|merluzzo|pesce spada|alici|sardine/i,
  crostacei:/gamberetti/i,molluschi:/polpo|cozze|seppie|totani/i,
  latte:/stracchino|parmigiano|mozzarella|brie|feta|yogurt|ricotta|crescenza|pecorino|emmental|formaggio|taleggio|tomini|provola|latte|burro|panna|gorgonzola|pizza margherita/i,
  arachidi:/burro di arachidi/i,soia:/tofu|salsa di soia/i,
  frutta_guscio:/noci|mandorle|nocciole/i
};
for(const [name,item] of Object.entries(ingredients)){
  item.allergeni=Object.entries(allergens).filter(([,rx])=>rx.test(name)).map(([key])=>key);
  item.bloccoManuale=!!item.bloccoManuale;
  if(['Salsa di soia','Dado','Zenzero','Cipollotto'].includes(name)){item.gruppo='condimento';item.nonRichiedeInventario=true;}
  else item.nonRichiedeInventario=!!item.nonRichiedeInventario;
}

const macroCode={carne_bianca:'PC',carne_rossa:'PC',affettati:'PC',pesce_bianco:'PP',pesce_azzurro:'PP',pesce_grande:'PP',pesce_conservato:'PP',crostacei:'PP',molluschi:'PP',formaggio_fresco:'PF',formaggio_stagionato:'PF',uova:'PU',legumi:'PL'};
const aromatic=new Set(['Aglio','Basilico fresco','Peperoncino','Prezzemolo','Cipollotto','Zenzero']);
const cooking=/cuoc|boll|forno|padell|rosol|grigli|salt|frig|less|vapore|fiamma|risotto|in umido|piastra|scalda|tosta/i;
function coverage(recipe){
  const tokens=[];if(macroCode[recipe.gruppoProteico])tokens.push(macroCode[recipe.gruppoProteico]);
  let carb=false,veg=0,salad=0;
  for(const row of recipe.ingredienti||[]){const name=row[0],q=Number(row[1])||0,meta=ingredients[name];if(!meta)continue;
    if(meta.gruppo==='carboidrati')carb=true;
    if(meta.gruppo==='verdura'&&!aromatic.has(name)){if(/insalata/i.test(name))salad+=q;else veg+=q;}
  }
  if(carb)tokens.push('C');if(salad>=70||veg>=200)tokens.push('V');return tokens.join('+');
}
function inferCooking(recipe){if(['colazione','spuntino'].includes(recipe.tipoPortata))return undefined;if(/insalata|bresaola|prosciutto|frisell|caprese|affumicato|al naturale|fredd/i.test(recipe.nome||''))return false;return cooking.test([recipe.nome,...(recipe.procedimento||[])].join(' '));}
for(const recipe of recipesDoc.ricette){recipe.copertura=coverage(recipe);const c=inferCooking(recipe);if(c!==undefined)recipe.richiedeCottura=c;recipe.soloManuale=!!recipe.soloManuale;}

function upsert(r){const at=recipesDoc.ricette.findIndex(x=>x.nome.toLowerCase()===r.nome.toLowerCase());r.porzioni=r.porzioni||1;r.fascia=r.fascia||'facile';r.piattoSpeciale=!!r.piattoSpeciale;r.soloManuale=!!r.soloManuale;r.copertura=coverage(r);const c=inferCooking(r);if(c!==undefined)r.richiedeCottura=c;if(at>=0)recipesDoc.ricette[at]=Object.assign({},recipesDoc.ricette[at],r);else recipesDoc.ricette.push(r);}

[
 {nome:'Ramen Giapponese',fascia:'impegnativa',gruppoProteico:'carne_bianca',tipoPortata:'unico',soloManuale:true,ingredienti:[['Sovracosce di pollo',250],['Tagliolini all\'uovo',500],['Uova',60],['Salsa di soia',10],['Zenzero',5],['Cipollotto',10],['Dado',5]],procedimento:['Prepara il brodo di pollo con le sovracosce e il dado.','Cuoci l’intera confezione di tagliolini e conserva l’avanzo cotto.','Completa con uovo, salsa di soia, zenzero e cipollotto.']},
 {nome:'Tagliolini al salmone',gruppoProteico:'pesce_grande',tipoPortata:'primo',ingredienti:[["Tagliolini all'uovo",125],['Salmone',100],['Zucchine',100]],procedimento:['Scalda i tagliolini già cotti con salmone e zucchine.']},
 {nome:'Tagliolini ai funghi',tipoPortata:'primo',ingredienti:[["Tagliolini all'uovo",125],['Funghi champignon',200],['Olio extravergine oliva',10]],procedimento:['Salta i funghi e unisci i tagliolini già cotti.']},
 {nome:'Tagliolini al pomodoro fresco e basilico',tipoPortata:'primo',ingredienti:[["Tagliolini all'uovo",125],['Pomodoro fresco',200],['Basilico fresco',5],['Olio extravergine oliva',10]],procedimento:['Scalda il pomodoro, unisci i tagliolini e completa con basilico.']},
 {nome:'Zuppa cereali e legumi in brodo',gruppoProteico:'legumi',tipoPortata:'unico',ingredienti:[['Farro perlato',70],['Ceci in barattolo',120],['Carote',100],['Cipolla',50],['Dado',5]],procedimento:['Cuoci cereali, legumi e verdure nel brodo.']},
 {nome:'Zuppa di lenticchie',gruppoProteico:'legumi',tipoPortata:'secondo',ingredienti:[['Lenticchie in barattolo',150],['Carote',100],['Pomodoro fresco',100],['Cipolla',50]],procedimento:['Cuoci dolcemente tutti gli ingredienti fino a ottenere una zuppa.']},
 {nome:'Zuppa di ceci',gruppoProteico:'legumi',tipoPortata:'secondo',ingredienti:[['Ceci in barattolo',150],['Carote',100],['Zucchine',100],['Cipolla',50]],procedimento:['Cuoci dolcemente tutti gli ingredienti fino a ottenere una zuppa.']},
 {nome:'Zuppa di fagioli al rosmarino',gruppoProteico:'legumi',tipoPortata:'secondo',ingredienti:[['Fagioli borlotti in barattolo',150],['Pomodoro fresco',100],['Carote',100],['Prezzemolo',5]],procedimento:['Cuoci i fagioli con le verdure e profuma con erbe aromatiche.']},
 {nome:'Insalata di pomodori',tipoPortata:'modulare',sottoCategoriaModulare:'contorno',ingredienti:[['Pomodoro fresco',200],['Olio extravergine oliva',10]],procedimento:['Affetta e condisci.']},
 {nome:'Insalata mista con carote e finocchi',tipoPortata:'modulare',sottoCategoriaModulare:'contorno',ingredienti:[['Insalata mista',70],['Carote',70],['Finocchi',70]],procedimento:['Lava, taglia e mescola.']},
 {nome:'Julienne di carote',tipoPortata:'modulare',sottoCategoriaModulare:'contorno',ingredienti:[['Carote',200],['Olio extravergine oliva',10]],procedimento:['Taglia a julienne e condisci.']},
 {nome:'Carote e finocchi',tipoPortata:'modulare',sottoCategoriaModulare:'contorno',ingredienti:[['Carote',100],['Finocchi',100],['Olio extravergine oliva',10]],procedimento:['Affetta sottilmente e condisci.']},
 {nome:'Insalata di pomodori e basilico',tipoPortata:'modulare',sottoCategoriaModulare:'contorno',ingredienti:[['Pomodoro fresco',200],['Basilico fresco',5],['Olio extravergine oliva',10]],procedimento:['Affetta e condisci con basilico.']},
 {nome:'Misticanza di radicchio',tipoPortata:'modulare',sottoCategoriaModulare:'contorno',ingredienti:[['Radicchio',70],['Insalata mista',70],['Olio extravergine oliva',10]],procedimento:['Lava, taglia e mescola.']},
 {nome:'Radicchio rosso e carote',tipoPortata:'modulare',sottoCategoriaModulare:'contorno',ingredienti:[['Radicchio',100],['Carote',100],['Olio extravergine oliva',10]],procedimento:['Taglia finemente e condisci.']}
].forEach(upsert);

recipesDoc.versione=Math.max(8,Number(recipesDoc.versione)||0);
ingredientsDoc.versione=Math.max(5,Number(ingredientsDoc.versione)||0);
fs.writeFileSync(ingredientsPath,JSON.stringify(ingredientsDoc,null,2)+'\n');
fs.writeFileSync(recipesPath,JSON.stringify(recipesDoc,null,2)+'\n');
