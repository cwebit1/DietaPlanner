/*
 * Script di verifica — nuovo ricettario
 * ---------------------------------------
 * NON tocca l'app. Legge solo nuovo-ricettario/ricette.json e simula,
 * con variabili fisse qui dentro (al posto di Set/Impostazioni/IndexedDB
 * veri), come il motore nuovo costruirebbe il pool di un pasto.
 *
 * Uso: node nuovo-ricettario/test-motore.js
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 1) DATI SIMULATI — al posto di "setting nutrizionista"
// ============================================================
const SETTING_NUTRIZIONISTA = {
  sogliaVerduraInsalata: 70,   // g — soglia minima per contare come V (tipo insalata)
  sogliaVerduraAltro: 200,     // g — soglia minima per contare come V (altre verdure)
  allergeniAttivi: [],         // es. ['uova'] per testare esclusione
  ingredientiBloccati: [],     // es. ['gorgonzola']
};

// ============================================================
// 2) DATI SIMULATI — al posto di "setting user" (Set dell'app)
// ============================================================
const SETTING_USER = {
  numeroPortateN1: 2,          // default permanente (1 | 2 | 3 | 'casuale')
  numeroPortateN2PerGiorno: {  // override opzionale per giorno/pasto, vuoto = usa N1
    // 'mercoledi_pranzo': 3,
  },
  giornoOggi: 'mercoledi',
  pastoOggi: 'pranzo',
  proteinaAssegnataOggi: 'PL',      // dalla griglia proteica (sempre presente, mai vuota)
  cerealeAssegnatoOggi: 'farro',    // dal budget carboidrati (facoltativo: null se non impostato)
  verdureDisattivate: [],           // es. ['melanzane']
  verdurePreferite: [],
};

// ============================================================
// 3) CARICAMENTO RICETTE
// ============================================================
const ricettario = JSON.parse(fs.readFileSync(path.join(__dirname, 'ricette.json'), 'utf8'));
const ricette = ricettario.ricette;

// ============================================================
// 4) ESPANSIONE COMBINATORIA — da una voce-template a istanze concrete
// ============================================================
function normalizzaClasse(classe) {
  return Array.isArray(classe) ? classe : [classe];
}

// Prodotto cartesiano di più array di "scelte" (ognuno può essere assente = [null])
function prodottoCartesiano(arrays) {
  return arrays.reduce((acc, arr) => {
    const lista = arr && arr.length ? arr : [null];
    const out = [];
    for (const combo of acc) for (const voce of lista) out.push([...combo, voce]);
    return out;
  }, [[]]);
}

function espandiRicetta(r) {
  const carb = r.carboidratiCompatibili || [];
  const prot = r.proteineCompatibili || [];
  const cott = r.tipiCotturaCompatibili || [];
  const verd = r.verdureCompatibili || [];

  const combinazioni = prodottoCartesiano([carb, prot, cott, verd]);

  return combinazioni.map(([c, p, k, v]) => ({
    nomeBase: r.nome || null,
    classe: normalizzaClasse(r.classe),
    composizioneFissa: r.composizioneFissa || null,
    carboidrato: c,
    proteina: p,
    cottura: k,
    verdura: v,
    nomeFinale: componiNome(r, c, p, k, v),
  }));
}

function componiNome(r, c, p, k, v) {
  const pezzi = [];
  if (c) pezzi.push(cap(c.nome));
  if (p) pezzi.push(p.nome);
  if (r.nome) pezzi.push(r.nome);
  if (k) pezzi.push(k.nome);
  if (v) pezzi.push(v.nome);
  return pezzi.filter(Boolean).join(' ').trim() || '(senza nome)';
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ============================================================
// 5) POOL PER LIVELLO — la proteina-del-giorno è SEMPRE obbligatoria,
//    non è mai uno dei "2 qualsiasi tra 3". Solo C e V sono il campo
//    libero. Vedi NUOVA-ARCHITETTURA-MOTORE.md, precisazione 2026-08-24.
// ============================================================
function risolviNumeroPortate(setting) {
  const chiave = `${setting.giornoOggi}_${setting.pastoOggi}`;
  const n2 = setting.numeroPortateN2PerGiorno[chiave];
  const nEffettivo = n2 !== undefined ? n2 : setting.numeroPortateN1;
  if (nEffettivo === 'casuale') {
    const opzioni = [1, 2, 3];
    return opzioni[Math.floor(Math.random() * opzioni.length)];
  }
  return nEffettivo;
}

function tokenProteinaRichiesto(settingUser) {
  return settingUser.proteinaAssegnataOggi;
}

const TOKEN_PROTEINA = ['PC', 'PP', 'PF', 'PU', 'PL'];
function haQualcheProteina(classe) {
  return TOKEN_PROTEINA.some(t => classe.includes(t));
}

function poolUnico(tutte, tokenProteina) {
  return tutte.filter(i => {
    const s = new Set(i.classe);
    return s.has(tokenProteina) && s.has('C') && s.has('V');
  });
}
function poolDuePortate(tutte, tokenProteina) {
  // proteina SEMPRE presente + esattamente uno tra C/V (mai C+V senza proteina)
  return tutte.filter(i => {
    const s = new Set(i.classe);
    if (!s.has(tokenProteina)) return false;
    const haC = s.has('C'), haV = s.has('V');
    return (haC && !haV) || (haV && !haC);
  });
}
function poolProteinaDaSola(tutte, tokenProteina) {
  return tutte.filter(i => {
    const s = new Set(i.classe);
    return s.has(tokenProteina) && !s.has('C') && !s.has('V');
  });
}
function poolCarboDaSolo(tutte) {
  return tutte.filter(i => {
    const s = new Set(i.classe);
    return s.has('C') && !s.has('V') && !haQualcheProteina(i.classe);
  });
}
function poolVerduraDaSola(tutte) {
  return tutte.filter(i => {
    const s = new Set(i.classe);
    return s.has('V') && !s.has('C') && !haQualcheProteina(i.classe);
  });
}

// ============================================================
// 6) PREFERENZA CEREALE (mai esclusione, solo priorità in ordinamento)
// ============================================================
function applicaPreferenzaCereale(pool, cerealeAssegnato) {
  if (!cerealeAssegnato) return pool; // nessuna preferenza da applicare
  const conCereale = pool.filter(i => i.carboidrato && i.carboidrato.nome === cerealeAssegnato);
  if (conCereale.length) return conCereale.concat(pool.filter(i => !(i.carboidrato && i.carboidrato.nome === cerealeAssegnato)));
  return pool; // fallback: nessuna con quel cereale, pool intero resta
}

// ============================================================
// 7) SCALETTA DI ADATTAMENTO — unico → due → tre, poi completamento
//    del residuo per il caso "due portate" (proteina+C trovato → serve
//    ancora V a sé, e viceversa).
// ============================================================
function generaPasto(settingUser) {
  const nScelto = risolviNumeroPortate(settingUser);
  const tokenProteina = tokenProteinaRichiesto(settingUser);
  const tutte = ricette.flatMap(espandiRicetta);
  const cereale = settingUser.cerealeAssegnatoOggi;

  const sequenza = [nScelto, ...[1, 2, 3].filter(x => x !== nScelto)];

  for (const nTentativo of sequenza) {
    if (nTentativo === 1) {
      let pool = applicaPreferenzaCereale(poolUnico(tutte, tokenProteina), cereale);
      if (pool.length) return { nRichiesto: nScelto, nTrovato: 1, poolSize: pool.length, pezzi: [pool[0]], alternative: pool.slice(1, 6) };
    }
    if (nTentativo === 2) {
      let pool = applicaPreferenzaCereale(poolDuePortate(tutte, tokenProteina), cereale);
      if (pool.length) {
        const primo = pool[0];
        const mancaC = !primo.classe.includes('C');
        const mancaV = !primo.classe.includes('V');
        let secondo = null, altSecondo = [];
        if (mancaC) { const p2 = poolCarboDaSolo(tutte); [secondo, ...altSecondo] = applicaPreferenzaCereale(p2, cereale); }
        if (mancaV) { const p2 = poolVerduraDaSola(tutte); [secondo, ...altSecondo] = p2; }
        if (secondo) return { nRichiesto: nScelto, nTrovato: 2, poolSize: pool.length, pezzi: [primo, secondo], alternative: pool.slice(1, 6) };
      }
    }
    if (nTentativo === 3) {
      const pProt = poolProteinaDaSola(tutte, tokenProteina);
      const pCarb = applicaPreferenzaCereale(poolCarboDaSolo(tutte), cereale);
      const pVerd = poolVerduraDaSola(tutte);
      if (pProt.length && pCarb.length && pVerd.length) {
        return { nRichiesto: nScelto, nTrovato: 3, poolSize: pProt.length + pCarb.length + pVerd.length, pezzi: [pProt[0], pCarb[0], pVerd[0]], alternative: [] };
      }
    }
  }
  return null; // nessuna combinazione a nessun livello — avviso esplicito (regola anti-A1)
}

// ============================================================
// 8) ESECUZIONE E STAMPA
// ============================================================
console.log('=== Simulazione generazione pasto ===');
console.log('Setting user:', JSON.stringify(SETTING_USER, null, 2));
console.log();

const risultato = generaPasto(SETTING_USER);

if (!risultato) {
  console.log('⚠️  NESSUNA combinazione trovata a nessun livello — andrebbe mostrato un avviso esplicito.');
} else {
  console.log(`Portate richieste (N effettivo): ${risultato.nRichiesto}`);
  console.log(`Portate effettivamente trovate: ${risultato.nTrovato}${risultato.nTrovato !== risultato.nRichiesto ? '  (adattato, non c\'era una combinazione esatta a ' + risultato.nRichiesto + ')' : ''}`);
  console.log(`Dimensione pool al primo livello: ${risultato.poolSize}`);
  console.log();
  console.log('PASTO SCELTO (pezzi):');
  for (const pezzo of risultato.pezzi) console.log(' -', pezzo.nomeFinale, ' | classe:', pezzo.classe.join('+'));
  console.log();
  if (risultato.alternative.length) {
    console.log(`ALTERNATIVE PER IL ROLL (sul primo pezzo, fino a 5, pool ne ha ${risultato.poolSize - 1} restanti):`);
    for (const alt of risultato.alternative) console.log('  -', alt.nomeFinale);
  }
}


console.log();
console.log('=== Conteggio combinazioni totali per voce (verifica indipendente) ===');
let totaleGenerale = 0;
for (const r of ricette) {
  const n = espandiRicetta(r).length;
  totaleGenerale += n;
  console.log(`${(r.nome || JSON.stringify(r.classe)).padEnd(45)} classe=${JSON.stringify(r.classe).padEnd(20)} combinazioni=${n}`);
}
console.log(`\nTOTALE combinazioni nel ricettario: ${totaleGenerale}`);
