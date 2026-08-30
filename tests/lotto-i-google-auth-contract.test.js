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
  assert.match(auth,/GoogleAuthProvider/);
  assert.match(auth,/signInWithPopup/);
  assert.doesNotMatch(auth,/serviceAccount|private_key/);
});

test('lotto I: profilo Firestore isolato per uid autenticato',()=>{
  assert.match(auth,/doc\(firestore,'users',user\.uid\)/);
  assert.match(rules,/request\.auth\.uid == userId/);
  assert.match(rules,/match \/users\/\{userId\}/);
  assert.match(rules,/allow delete: if false/);
});
