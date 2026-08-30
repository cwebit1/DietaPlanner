'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const ip=path.join(root,'ingredienti.json'),rp=path.join(root,'ricette.json');
const iDoc=JSON.parse(fs.readFileSync(ip,'utf8')),rDoc=JSON.parse(fs.readFileSync(rp,'utf8'));
const I=iDoc.ingredienti;
const macro={carne_bianca:'PC',carne_rossa:'PC',affettati:'PC',pesce_bianco:'PP',pesce_azzurro:'PP',pesce_grande:'PP',pesce_conservato:'PP',crostacei:'PP',molluschi:'PP',formaggio_fresco:'PF',formaggio_stagionato:'PF',uova:'PU',legumi:'PL'};
const aromatic=new Set(['Aglio','Basilico fresco','Peperoncino','Prezzemolo','Cipollotto','Zenzero']);
const cap=s=>s?String(s).trim().charAt(0).toLocaleUpperCase('it-IT')+String(s).trim().slice(1):s;
function portionGrams(name,meta){if(Number(meta.pesoPorzioneGrammi)>0)return Number(meta.pesoPorzioneGrammi);if(meta.unitaPorzione==='pezzi')return Number(meta.pesoPezzo)||60*(Number(meta.porzione)||1);return Number(meta.porzione)||Infinity;}
function proteinScores(r){const scores={},subtypes={};for(const [name,q0] of r.ingredienti||[]){const m=I[name],code=m&&macro[m.sottotipo];if(!code)continue;const ratio=(Number(q0)||0)/portionGrams(name,m);scores[code]=(scores[code]||0)+ratio;if(!subtypes[code]||ratio>subtypes[code].ratio)subtypes[code]={subtype:m.sottotipo,ratio};}return {scores,subtypes};}
function normalizeStandaloneVegetable(r){if(!['contorno'].includes(r.tipoPortata)&&!(r.tipoPortata==='modulare'&&r.sottoCategoriaModulare==='contorno'))return;const peas=(r.ingredienti||[]).filter(([n])=>/Piselli (surgelati|in barattolo)/i.test(n));if(peas.length){for(const row of peas)if(Number(row[1])<120)row[1]=120;return;}const salad=(r.ingredienti||[]).find(([n])=>/Insalata mista/i.test(n));if(salad&&Number(salad[1])<70)salad[1]=70;const veg=(r.ingredienti||[]).filter(([n])=>I[n]&&I[n].gruppo==='verdura'&&!aromatic.has(n)&&!/Insalata mista/i.test(n));const total=veg.reduce((s,x)=>s+Number(x[1]||0),0);if(!salad&&total>0&&total<200){const factor=200/total;for(const row of veg)row[1]=Math.round(Number(row[1])*factor);}}
function coverage(r){const {scores,subtypes}=proteinScores(r);let proteins=Object.entries(scores).filter(([,v])=>v>=1-1e-9).map(([k])=>k);const fallback=macro[r.gruppoProteico];if(!proteins.length&&fallback)proteins=[fallback];if(proteins.length===1){const best=subtypes[proteins[0]];if(best)r.gruppoProteico=best.subtype;}const carbRatio=(r.ingredienti||[]).reduce((s,[n,q])=>{const m=I[n];return s+(m&&m.gruppo==='carboidrati'?(Number(q)||0)/portionGrams(n,m):0);},0);let salad=0,veg=0;for(const [n,q0] of r.ingredienti||[]){const m=I[n],q=Number(q0)||0;if(!m||m.gruppo!=='verdura'||aromatic.has(n))continue;if(/Insalata mista/i.test(n))salad+=q;else veg+=q;}const tokens=[...proteins];if(carbRatio>=1-1e-9)tokens.push('C');if(salad>=70||veg>=200)tokens.push('V');return {tokens,scores};}

I['Piselli in barattolo'].porzione=120;I['Piselli surgelati'].porzione=120;I.Friselle.pesoPorzioneGrammi=50;
for(const r of rDoc.ricette){r.nome=cap(r.nome);normalizeStandaloneVegetable(r);const c=coverage(r);r.copertura=c.tokens.join('+');if(c.tokens.filter(x=>/^P/.test(x)).length>=2)r.piattoSpeciale=true;else r.piattoSpeciale=!!r.piattoSpeciale;delete r.carboidratiCompatibili;}
rDoc.ricette=rDoc.ricette.filter(r=>!(r.tipoPortata==='modulare'&&r.sottoCategoriaModulare==='sugo'));

I['Pizza margherita']=Object.assign({},I['Pizza margherita'],{kcal:235,proteine:10.7,carboidrati:27.4,grassi:9.3,gruppo:'speciale',deperibilita:'bassa',conservazione:'asporto',porzione:300,stock:1,nonRichiedeInventario:true,allergeni:['glutine','latte'],fonteNutrizionale:'CREA PC0001'});
I['Pizza alle verdure']={kcal:248,proteine:7.6,carboidrati:40.7,grassi:6.6,gruppo:'speciale',deperibilita:'bassa',conservazione:'asporto',porzione:300,gradimento:1,stock:1,nonRichiedeInventario:true,formatoRiordino:{valore:null,unita:null},allergeni:['glutine'],bloccoManuale:false,fonteNutrizionale:'CREA 000710, proxy pizza con pomodoro'};
function upsertSpecial(name,ingredient,allergens){const total=I[ingredient],r={nome:name,fascia:'medio',porzioni:1,tipoPortata:'unico',piattoSpeciale:true,soloManuale:false,richiedeCottura:false,copertura:'C',ingredienti:[[ingredient,300]],procedimento:['Piatto speciale da pizzeria/asporto: non scala l’inventario.'],allergeniPresenti:allergens,nutrizioneManualeTotale:{kcal:Math.round(total.kcal*30)/10,prot:Math.round(total.proteine*30)/10,carb:Math.round(total.carboidrati*30)/10,grassi:Math.round(total.grassi*30)/10}};const at=rDoc.ricette.findIndex(x=>x.nome.toLowerCase()===name.toLowerCase());if(at>=0)rDoc.ricette[at]=Object.assign({},rDoc.ricette[at],r);else rDoc.ricette.push(r);}
upsertSpecial('Pizza Margherita','Pizza margherita',['glutine','latte']);
upsertSpecial('Pizza alle Verdure','Pizza alle verdure',['glutine']);
for(const r of rDoc.ricette){r.allergeniPresenti=[...new Set((r.ingredienti||[]).flatMap(([n])=>I[n]&&I[n].allergeni||[]))].sort();}
rDoc.versione=11;iDoc.versione=6;
fs.writeFileSync(ip,JSON.stringify(iDoc,null,2)+'\n');fs.writeFileSync(rp,JSON.stringify(rDoc,null,2)+'\n');
console.log(`ricette=${rDoc.ricette.length}; ingredienti=${Object.keys(I).length}`);
