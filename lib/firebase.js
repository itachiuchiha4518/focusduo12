// lib/firebase.js
// Full, copy/paste — replace the file completely with this.

// NOTE: this file is for browser/client usage (modular v9+).
// It exports the initialized objects and the Firestore/auth helpers.

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
  getAuth,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  signOut as firebaseSignOut,
  signInWithPopup,
  GoogleAuthProvider
} from "firebase/auth";
import {
  getFirestore,
  collection as fsCollection,
  doc as fsDoc,
  addDoc as fsAddDoc,
  setDoc as fsSetDoc,
  getDoc as fsGetDoc,
  getDocs as fsGetDocs,
  onSnapshot as fsOnSnapshot,
  deleteDoc as fsDeleteDoc,
  query as fsQuery,
  where as fsWhere,
  orderBy as fsOrderBy
} from "firebase/firestore";

// ---- your firebase config (from your message) ----
const firebaseConfig = {
  apiKey: "AIzaSyB8tzYEqejZMYvbapaLBOFHIS-wW6FIZPI",
  authDomain: "focusduo-10ae1.firebaseapp.com",
  projectId: "focusduo-10ae1",
  storageBucket: "focusduo-10ae1.firebasestorage.app",
  messagingSenderId: "611044167246",
  appId: "1:611044167246:web:6b7391b00ed52aa3e7bd1f",
  measurementId: "G-F6TH9RCYXC"
};

// initialize app (guard so multiple imports don't re-init)
let firebaseApp
try {
  firebaseApp = initializeApp(firebaseConfig)
} catch (e) {
  // initializeApp will throw if already initialized in some envs; ignore
  firebaseApp = initializeApp.apps ? initializeApp.apps[0] : initializeApp(firebaseConfig)
}

let analytics
try {
  analytics = getAnalytics(firebaseApp)
} catch (e) {
  // analytics can fail in SSR / restricted envs — ignore
  analytics = null
}

// initialize services
const auth = getAuth(firebaseApp)
const db = getFirestore(firebaseApp)

// re-export common functions with consistent names
export {
  firebaseConfig,
  firebaseApp,
  analytics,
  auth,
  db,

  // auth helpers
  firebaseOnAuthStateChanged,
  firebaseSignOut,
  signInWithPopup,
  GoogleAuthProvider,

  // firestore helpers (re-export with simpler local names)
  fsCollection as collection,
  fsDoc as doc,
  fsAddDoc as addDoc,
  fsSetDoc as setDoc,
  fsGetDoc as getDoc,
  fsGetDocs as getDocs,
  fsOnSnapshot as onSnapshot,
  fsDeleteDoc as deleteDoc,
  fsQuery as query,
  fsWhere as where,
  fsOrderBy as orderBy
}
