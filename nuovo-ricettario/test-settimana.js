/*
 * Simulazione settimanale — nuovo ricettario (v2: stack + estrazione casuale)
 * -----------------------------------------------------------------------
 * Aggiunge rispetto alla v1: stack persistente (no ripetizioni nella
 * finestra simulata), estrazione CASUALE tra i candidati vivi (non piu'
 * "primo del pool"), e la deperibilita' reale (da ingredienti.json) mostrata
 * per ogni pasto generato, per verificare a occhio il problema descritto da
 * Cwe (verdure deperibili comprate a inizio settimana ma usate tardi).
 */
const fs = require('fs');
const path = require('path');

const ricettario = JSON.parse(fs.readFileSync(path.join(__dirname, 'ricette.json'), 'utf8'));
const ricette = ricettario.ricette;
const DEPERIBILITA = {"Pasta corta": "bassa", "Patate": "bassa", "Farina per polenta": "bassa", "Orzo perlato": "bassa", "Piselli surgelati": "bassa", "Piselli in barattolo": "bassa", "Cipolla": "bassa", "Zucchine": "alta", "Pomodoro fresco": "alta", "Insalata mista": "alta", "Broccoli": "media", "Carote": "bassa", "Melanzane": "media", "Peperoni": "media", "Cetriolo": "media", "Radicchio": "alta", "Petto di pollo": "alta", "Uova": "alta", "Stracchino": "alta", "Parmigiano grattugiato": "alta", "Mozzarella": "alta", "Tonno in scatola": "bassa", "Filetto di nasello surgelato": "bassa", "Gamberetti surgelati": "bassa", "Ceci in barattolo": "bassa", "Fagioli borlotti in barattolo": "bassa", "Lenticchie in barattolo": "bassa", "Tofu": "alta", "Cous cous": "bassa", "Farro perlato": "bassa", "Noodles per ramen": "bassa", "Friselle": "bassa", "Spinaci freschi": "alta", "Basilico fresco": "alta", "Nodino di maiale": "alta", "Prosciutto crudo": "alta", "Sogliola surgelata": "bassa", "Brie": "alta", "Feta": "alta", "Fagioli cannellini in barattolo": "bassa", "Ricotta": "alta", "Crackers": "bassa", "Petto di tacchino": "alta", "Fettina di manzo": "alta", "Bresaola": "alta", "Prosciutto cotto": "alta", "Sgombro fresco": "bassa", "Salmone": "bassa", "Orata surgelata": "bassa", "Polpo surgelato": "bassa", "Crescenza": "alta", "Pecorino": "alta", "Funghi champignon": "alta", "Cavolfiore": "media", "Fagiolini": "media", "Pasta integrale": "bassa", "Riso integrale": "bassa", "Pane integrale": "bassa", "Farina 00": "bassa", "Salmone affumicato": "alta", "Branzino surgelato": "bassa", "Emmental": "alta", "Formaggio spalmabile": "alta", "Taleggio": "alta", "Tomini": "alta", "Provola": "alta", "Sovracosce di pollo": "alta", "Pollo a dadini": "alta", "Costine di maiale": "alta", "Hamburger di suino": "alta", "Hamburger di pollo": "alta", "Hamburger di tacchino": "alta", "Hamburger di vitello": "alta", "Zucca": "media", "Verza": "media", "Crauti in barattolo": "bassa", "Finocchi": "media", "Pomodorini": "alta", "Arista di maiale": "alta", "Magro di vitello": "alta", "Salsiccia": "alta", "Pancetta a cubetti": "alta", "Aglio": "bassa", "Prezzemolo": "alta", "Peperoncino": "media", "Asparagi": "alta", "Carciofi": "media", "Cime di rapa": "alta", "Cozze": "alta", "Seppie": "alta", "Totani": "alta", "Merluzzo": "alta", "Pesce spada": "alta", "Alici fresche": "alta", "Sardine fresche": "alta", "Tonno fresco": "alta", "Sgombro in scatola": "bassa", "Speck": "alta", "Gorgonzola": "alta", "Tagliolini all'uovo": "bassa", "Ravioli ricotta e spinaci": "media", "Gallette di riso": "bassa", "Taralli": "bassa", "Piadina": "bassa", "Riso Originario": "bassa", "Panino": "bassa", "Gnocchi": "media", "Sedano": "media", "Rucola": "alta", "Lattuga": "alta", "Valeriana": "alta", "Songino": "alta", "Ravanelli": "alta"};

function normalizzaClasse(classe) { return Array.isArray(classe) ? classe : [classe]; }
function prodottoCartesiano(arrays) {
  return arrays.reduce((acc, arr) => {
    const lista = arr && arr.length ? arr : [null];
    const out = [];
    for (const combo of acc) for (const voce of lista) out.push([...combo, voce]);
    return out;
  }, [[]]);
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function componiNome(r, c, p, k, v) {
  const pezzi = [];
  if (c) pezzi.push(cap(c.nome));
  if (p) pezzi.push(p.nome);
  if (r.nome) pezzi.push(r.nome);
  if (k) pezzi.push(k.nome);
  if (v) pezzi.push(v.nome);
  return pezzi.filter(Boolean).join(' ').trim() || '(senza nome)';
}

// deperibilita' massima tra gli ingredienti coinvolti in questa istanza
function ordineDeperibilita(liv) { return { alta: 3, media: 2, bassa: 1, undefined: 0 }[liv] || 0; }
function deperibilitaIstanza(c, p, v) {
  const nomi = [];
  if (c) nomi.push(cap(c.nome));
  if (p) nomi.push(cap(p.nome));
  if (v) nomi.push(cap(v.nome));
  let max = null;
  for (const n of nomi) {
    const liv = DEPERIBILITA[n];
    if (liv && ordineDeperibilita(liv) > ordineDeperibilita(max)) max = liv;
  }
  return max || 'n/d';
}

function espandiRicetta(r) {
  const carb = r.carboidratiCompatibili || [];
  const prot = r.proteineCompatibili || [];
  const cott = r.tipiCotturaCompatibili || [];
  const verd = r.verdureCompatibili || [];
  const combinazioni = prodottoCartesiano([carb, prot, cott, verd]);
  return combinazioni.map(([c, p, k, v]) => ({
    classe: normalizzaClasse(r.classe), carboidrato: c,
    nomeFinale: componiNome(r, c, p, k, v),
    // chiave stack: il CONDIMENTO/protagonista, SENZA il cereale — Farro
    // con taleggio e speck e Orzo con taleggio e speck sono lo stesso
    // condimento, devono condividere un solo stack (vedi architettura,
    // correzione 2026-08-24)
    stackKey: componiNome(r, null, p, k, v),
    deperibilita: deperibilitaIstanza(c, p, v),
  }));
}

const TUTTE_BASE = ricette.flatMap(espandiRicetta);
// STACK: mappa stackKey -> true (disponibile) / false (usato, escluso).
// Piu' istanze (con cereali diversi) condividono la stessa stackKey.
const stack = new Map(TUTTE_BASE.map(i => [i.stackKey, true]));

const TOKEN_PROTEINA = ['PC', 'PP', 'PF', 'PU', 'PL'];
function haQualcheProteina(classe) { return TOKEN_PROTEINA.some(t => classe.includes(t)); }

function vivi(lista) { return lista.filter(i => stack.get(i.stackKey) !== false); }
function scegliCasuale(lista) {
  if (!lista.length) return null;
  return lista[Math.floor(Math.random() * lista.length)];
}
function consuma(istanza) {
  stack.set(istanza.stackKey, false);
  // reset del pool se questa era l'ultima rimasta viva nella sua classe (regola pool-esaurito)
}

function poolUnico(tokenProteina) {
  return vivi(TUTTE_BASE.filter(i => { const s = new Set(i.classe); return s.has(tokenProteina) && s.has('C') && s.has('V'); }));
}
function poolDuePortate(tokenProteina) {
  return vivi(TUTTE_BASE.filter(i => {
    const s = new Set(i.classe);
    // niente proteine SBAGLIATE (una proteina presente ma diversa da quella del giorno)
    const proteinePresenti = TOKEN_PROTEINA.filter(t => s.has(t));
    if (proteinePresenti.some(t => t !== tokenProteina)) return false;
    const haProt = s.has(tokenProteina), haC = s.has('C'), haV = s.has('V');
    // caso A: proteina corretta + esattamente uno tra C/V
    if (haProt && ((haC && !haV) || (haV && !haC))) return true;
    // caso B: C+V insieme, nessuna proteina (la proteina si completa dopo)
    if (!haProt && haC && haV) return true;
    return false;
  }));
}
function poolProteinaDaSola(tokenProteina) {
  return vivi(TUTTE_BASE.filter(i => { const s = new Set(i.classe); return s.has(tokenProteina) && !s.has('C') && !s.has('V'); }));
}
function poolCarboDaSolo() {
  return vivi(TUTTE_BASE.filter(i => { const s = new Set(i.classe); return s.has('C') && !s.has('V') && !haQualcheProteina(i.classe); }));
}
function poolVerduraDaSola() {
  return vivi(TUTTE_BASE.filter(i => { const s = new Set(i.classe); return s.has('V') && !s.has('C') && !haQualcheProteina(i.classe); }));
}
function applicaPreferenzaCereale(pool, cereale) {
  if (!cereale) return pool;
  const con = pool.filter(i => i.carboidrato && i.carboidrato.nome === cereale);
  return con.length ? con : pool;
}

function generaPasto(nScelto, tokenProteina, cereale) {
  const sequenza = [nScelto, ...[1, 2, 3].filter(x => x !== nScelto)];
  for (const nTentativo of sequenza) {
    if (nTentativo === 1) {
      const scelto = scegliCasuale(applicaPreferenzaCereale(poolUnico(tokenProteina), cereale));
      if (scelto) { consuma(scelto); return { nTrovato: 1, pezzi: [scelto] }; }
    }
    if (nTentativo === 2) {
      const pool = applicaPreferenzaCereale(poolDuePortate(tokenProteina), cereale);
      const primo = scegliCasuale(pool);
      if (primo) {
        const s = new Set(primo.classe);
        const mancaProt = !s.has(tokenProteina), mancaC = !s.has('C'), mancaV = !s.has('V');
        let secondo = null;
        if (mancaProt) secondo = scegliCasuale(poolProteinaDaSola(tokenProteina));
        else if (mancaC) secondo = scegliCasuale(applicaPreferenzaCereale(poolCarboDaSolo(), cereale));
        else if (mancaV) secondo = scegliCasuale(poolVerduraDaSola());
        if (secondo) { consuma(primo); consuma(secondo); return { nTrovato: 2, pezzi: [primo, secondo] }; }
      }
    }
    if (nTentativo === 3) {
      const p1 = scegliCasuale(poolProteinaDaSola(tokenProteina));
      const p2 = scegliCasuale(applicaPreferenzaCereale(poolCarboDaSolo(), cereale));
      const p3 = scegliCasuale(poolVerduraDaSola());
      if (p1 && p2 && p3) { consuma(p1); consuma(p2); consuma(p3); return { nTrovato: 3, pezzi: [p1, p2, p3] }; }
    }
  }
  return null;
}

const SETTIMANA = [
  { giorno: 'Lunedì',    pranzo: 'PC', cena: 'PP', cerealePranzo: 'Riso Originario', cerealeCena: null },
  { giorno: 'Martedì',   pranzo: 'PF', cena: 'PL', cerealePranzo: null,     cerealeCena: 'Farro perlato' },
  { giorno: 'Mercoledì', pranzo: 'PL', cena: 'PU', cerealePranzo: 'Farro perlato', cerealeCena: null },
  { giorno: 'Giovedì',   pranzo: 'PP', cena: 'PC', cerealePranzo: null,     cerealeCena: 'Orzo perlato' },
  { giorno: 'Venerdì',   pranzo: 'PU', cena: 'PF', cerealePranzo: null,     cerealeCena: null },
  { giorno: 'Sabato',    pranzo: 'PC', cena: 'PP', cerealePranzo: 'Cous cous', cerealeCena: null },
  { giorno: 'Domenica',  pranzo: 'PL', cena: 'PF', cerealePranzo: null,     cerealeCena: null },
];
const N_SCELTO = 2;

console.log('=== Simulazione settimanale v2 (stack persistente + estrazione casuale + deperibilita\') ===\n');
let successi = 0, fallimenti = 0;
const righeDeperibilita = [];
for (const g of SETTIMANA) {
  for (const pasto of ['pranzo', 'cena']) {
    const token = g[pasto];
    if (!token) continue; // slot escluso (es. PF tolto per questo test)
    const cereale = pasto === 'pranzo' ? g.cerealePranzo : g.cerealeCena;
    const r = generaPasto(N_SCELTO, token, cereale);
    const etichetta = `${g.giorno} ${pasto} (${token})`;
    if (!r) {
      console.log(`❌ ${etichetta} → NESSUNA combinazione trovata (pool esaurito?)`);
      fallimenti++;
    } else {
      const adattato = r.nTrovato !== N_SCELTO ? ` [adattato a ${r.nTrovato}]` : '';
      const nomi = r.pezzi.map(p => `${p.nomeFinale} (deperib. ${p.deperibilita})`).join(' + ');
      console.log(`✅ ${etichetta}${adattato} → ${nomi}`);
      for (const p of r.pezzi) righeDeperibilita.push({ giorno: g.giorno, deperibilita: p.deperibilita });
      successi++;
    }
  }
}
console.log(`\nTotale: ${successi} pasti generati, ${fallimenti} falliti su 14.`);

console.log('\n=== Distribuzione deperibilità "alta" nei giorni (dovrebbe concentrarsi a inizio settimana, non ancora implementato l\'ordinamento) ===');
const giorniOrdine = SETTIMANA.map(g => g.giorno);
for (const g of giorniOrdine) {
  const n = righeDeperibilita.filter(r => r.giorno === g && r.deperibilita === 'alta').length;
  console.log(`${g.padEnd(12)} ${'█'.repeat(n)} (${n})`);
}
