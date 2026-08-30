'use strict';

const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const target=path.join(root,'db-ricette.json');
const db=JSON.parse(fs.readFileSync(target,'utf8'));

if(db.versione!==67)throw new Error('Conversione v68 attesa su db-ricette.json v67, trovata v'+db.versione);
if(!Array.isArray(db.ricette)||db.ricette.length!==38)throw new Error('Catalogo iniziale inatteso');

const item=(nome,dose,extra)=>Object.assign({nome,stack:1,roll:1},dose===undefined?{}:{dose},extra||{});
const none=()=>({testo1:'',categoria:'Nessuno',ingredienti:[],cotture:[],testo2:'',mostraNomi:false});
const group=(categoria,ingredienti,testo1,testo2,mostraNomi,cotture,composizioni)=>{
  const out={testo1:testo1||'',categoria,ingredienti:ingredienti||[],cotture:cotture||[],testo2:testo2||'',mostraNomi:!!mostraNomi};
  if(composizioni&&composizioni.length)out.composizioni=composizioni;
  return out;
};
const composition=(nome,ingredienti)=>({nome,stack:1,roll:1,ingredienti});

const coldCarbs=['Cous cous','Farro perlato','Orzo perlato','Riso'].map(n=>item(n));
const coldVegetables=[
  composition('pomodorini e cetriolo',[item('Pomodorini',112.5,{categoria:'V'}),item('Cetriolo',112.5,{categoria:'V'})]),
  composition('pomodorini e carote',[item('Pomodorini',112.5,{categoria:'V'}),item('Carote',112.5,{categoria:'V'})]),
  composition('pomodorini e peperoni',[item('Pomodorini',112.5,{categoria:'V'}),item('Peperoni',112.5,{categoria:'V'})])
];
const coldRecipe=(id,proteinToken,proteins,withSesame)=>({
  id,
  stackScope:'insalate_fredde_cereali',
  gruppi:[
    group('C',coldCarbs,'insalata fredda di','con',false),
    group(proteinToken,proteins.map(n=>item(n)),'','e',true),
    group('V',[],'','',true,[],coldVegetables),
    withSesame?group('Condimenti',[item('Semi di sesamo')],'','',false):none()
  ],
  classe:['C',proteinToken,'V']
});

const byId=new Map(db.ricette.map(r=>[r.id,r]));
byId.set(10,coldRecipe(10,'PF',['Emmental','Mozzarella','Feta'],false));
byId.set(16,coldRecipe(16,'PP',['Tonno','Salmone affumicato'],true));
byId.delete(15); // sostituito dalla famiglia fredda completa C+P+V
byId.delete(17); // verdure cotte non associate ai cereali freddi
byId.set(42,coldRecipe(42,'PL',['Tofu'],false));

const sauceCarbs=[
  'Pasta corta','Tagliolini all\'uovo','Pasta integrale','Riso','Orzo perlato',
  'Farro perlato','Cous cous','Ravioli ricotta e spinaci','Gnocchi'
].map(n=>item(n));
const sauces=[
  composition('zucchine e melanzane',[item('Zucchine',40,{categoria:'V'}),item('Melanzane',40,{categoria:'V'})]),
  composition('zucchine e carote',[item('Zucchine',40,{categoria:'V'}),item('Carote',40,{categoria:'V'})]),
  composition('zucchine e pomodoro',[item('Zucchine',40,{categoria:'V'}),item('Pomodoro fresco',40,{categoria:'V'})]),
  composition('pomodoro e melanzane',[item('Pomodoro fresco',40,{categoria:'V'}),item('Melanzane',40,{categoria:'V'})]),
  composition('piselli e carote',[item('Piselli surgelati',40,{categoria:'V'}),item('Carote',40,{categoria:'V'})]),
  composition('piselli e pomodoro fresco',[item('Piselli surgelati',40,{categoria:'V'}),item('Pomodoro fresco',40,{categoria:'V'})]),
  composition('pomodoro e basilico',[item('Pomodoro fresco',70,{categoria:'V'}),item('Basilico fresco',undefined,{categoria:'Condimenti'})]),
  composition('aglio, olio e pomodorini',[
    item('Aglio',undefined,{categoria:'Condimenti'}),
    item('Olio extravergine oliva',undefined,{categoria:'Condimenti'}),
    item('Pomodorini',70,{categoria:'V'})
  ])
];
byId.set(43,{
  id:43,
  stackScope:'sughi_verdure',
  gruppi:[
    group('C',sauceCarbs,'','con',false),
    group('V',[],'','',true,[],sauces),
    none(),none()
  ],
  classe:['C','V']
});

byId.set(44,{
  id:44,
  stackScope:'uovo_piselli',
  gruppi:[
    group('C',['Riso','Orzo perlato','Farro perlato','Cous cous'].map(n=>item(n)),'','con',false),
    group('PU',[item('Uova',1)],'','e',true,[item('strapazzate')]),
    group('PL',[item('Piselli surgelati',60)],'','',true),
    group('V',[],'','',false)
  ],
  classe:['C','PU','PL','V']
});

db.versione=68;
db.ricette=[...byId.values()].sort((a,b)=>a.id-b.id);
fs.writeFileSync(target,JSON.stringify(db,null,2)+'\n');
console.log('db-ricette.json aggiornato a v68 con '+db.ricette.length+' template');
