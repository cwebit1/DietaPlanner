import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  doc,
  getFirestore,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAR6KGaiCzD7QLf7NwGiK2JGUyV6Du6XdY',
  authDomain: 'dietaplanner-a6683.firebaseapp.com',
  projectId: 'dietaplanner-a6683',
  storageBucket: 'dietaplanner-a6683.firebasestorage.app',
  messagingSenderId: '359859329968',
  appId: '1:359859329968:web:7473a1d5e40317d2369475'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

let currentUser = null;
let readyResolve;
const ready = new Promise(resolve => { readyResolve = resolve; });

function publicUser(user){
  return user ? {
    uid:user.uid,
    displayName:user.displayName || '',
    email:user.email || '',
    photoURL:user.photoURL || ''
  } : null;
}

async function ensureProfile(user){
  if(!user) return;
  await setDoc(doc(firestore,'users',user.uid), {
    displayName:user.displayName || '',
    email:user.email || '',
    photoURL:user.photoURL || '',
    lastLoginAt:serverTimestamp(),
    appVersion:'2'
  }, {merge:true});
}

function emitAuth(){
  window.dispatchEvent(new CustomEvent('dietaplanner-auth-changed', {
    detail:{user:publicUser(currentUser)}
  }));
}

async function login(){
  await setPersistence(auth,browserLocalPersistence);
  const result=await signInWithPopup(auth,provider);
  return publicUser(result.user);
}

async function logout(){
  await signOut(auth);
}

window.DietaPlannerCloud = {
  ready,
  login,
  logout,
  getUser:()=>publicUser(currentUser),
  getFirestore:()=>firestore
};

setPersistence(auth,browserLocalPersistence)
  .catch(err=>console.warn('[auth persistence]',err));

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  if(user){
    try{ await ensureProfile(user); }
    catch(err){ console.warn('[profilo cloud]',err); }
  }
  emitAuth();
  readyResolve(publicUser(user));
});
