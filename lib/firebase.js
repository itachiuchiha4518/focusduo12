// lib/firebase.js
// FULL FILE - overwrite the old one exactly with this.

import { initializeApp, getApps } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

import {
  getAuth,
  onAuthStateChanged as _onAuthStateChanged,
  signOut as _signOut,
  signInWithPopup as _signInWithPopup,
  GoogleAuthProvider as _GoogleAuthProvider
} from "firebase/auth";

import {
  getFirestore,
  collection as _collection,
  doc as _doc,
  addDoc as _addDoc,
  setDoc as _setDoc,
  getDoc as _getDoc,
  getDocs as _getDocs,
  onSnapshot as _onSnapshot,
  deleteDoc as _deleteDoc,
  query as _query,
  where as _where,
  orderBy as _orderBy
} from "firebase/firestore";

/* --------- Your Firebase config (from messages) --------- */
const firebaseConfig = {
  apiKey: "AIzaSyB8tzYEqejZMYvbapaLBOFHIS-wW6FIZPI",
  authDomain: "focusduo-10ae1.firebaseapp.com",
  projectId: "focusduo-10ae1",
  storageBucket: "focusduo-10ae1.firebasestorage.app",
  messagingSenderId: "611044167246",
  appId: "1:611044167246:web:6b7391b00ed52aa3e7bd1f",
  measurementId: "G-F6TH9RCYXC"
};

/* Initialize Firebase once */
let firebaseApp;
if (!getApps().length) {
  firebaseApp = initializeApp(firebaseConfig);
} else {
  firebaseApp = getApps()[0];
}

/* Analytics (optional) */
let analytics = null;
try {
  analytics = getAnalytics(firebaseApp);
} catch (e) {
  // ignore in server or restricted envs
  analytics = null;
}

/* Services */
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

/* Re-export with the names used by your app */
export {
  firebaseConfig,
  firebaseApp,
  analytics,
  auth,
  db,

  // Auth helpers (named exactly)
  _onAuthStateChanged as onAuthStateChanged,
  _signOut as signOut,
  _signInWithPopup as signInWithPopup,
  _GoogleAuthProvider as GoogleAuthProvider,

  // Firestore helpers (named exactly)
  _collection as collection,
  _doc as doc,
  _addDoc as addDoc,
  _setDoc as setDoc,
  _getDoc as getDoc,
  _getDocs as getDocs,
  _onSnapshot as onSnapshot,
  _deleteDoc as deleteDoc,
  _query as query,
  _where as where,
  _orderBy as orderBy
};
