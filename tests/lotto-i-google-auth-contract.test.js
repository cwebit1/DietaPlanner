const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const auth = fs.readFileSync(path.join(root,'firebase-auth.js'),'utf8');
const rules = fs.readFileSync(path.join(root,'firestore.rules'),'utf8');

test('lotto I: login Google visibile e configurazione Firebase separata',()=>{
  assert.match(html,/type="module" src="firebase-auth\.js\?v=2"/);
  assert.match(html,/id="btnLoginGoogle"/);
  assert.match(html,/id="btnLogoutGoogle"/);
  assert.match(html,/id="modalAccessoIniziale"/);
  assert.match(html,/id="btnLoginGoogleIniziale"/);
  assert.match(html,/id="btnContinuaLocale"/);
  assert.match(html,/class="header-app"/);
  assert.match(html,/class="header-user"/);
  assert.match(html,/id="headerGreeting"/);
  assert.match(html,/Ciao \$\{nome\}, Buon appetito 🥂/);
  assert.match(html,/backdrop-filter:blur\(9px\) saturate\(\.68\)/);
  assert.match(html,/requestAnimationFrame\(\(\)=>window\.scrollTo\(\{top:0,left:0,behavior:'auto'\}\)\)/);
  assert.match(html,/\.account-button\{width:24px;height:24px/);
  assert.match(html,/let modalitaLocaleSessione=false/);
  assert.doesNotMatch(html,/localStorage\.setItem\('dietaplannerModalitaLocale'/);
  assert.match(auth,/GoogleAuthProvider/);
  assert.match(auth,/signInWithPopup/);
  assert.match(auth,/inMemoryPersistence/);
  assert.doesNotMatch(auth,/browserLocalPersistence/);
  assert.doesNotMatch(auth,/serviceAccount|private_key/);
});

test('lotto I: profilo Firestore isolato per uid autenticato',()=>{
  assert.match(auth,/doc\(firestore,'users',user\.uid\)/);
  assert.match(rules,/request\.auth\.uid == userId/);
  assert.match(rules,/match \/users\/\{userId\}/);
  assert.match(rules,/allow delete: if false/);
});
