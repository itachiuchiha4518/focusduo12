// lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup as firebaseSignInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc,
  onSnapshot
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB8tzYEqejZMYvbapaLBOFHIS-wW6FIZPI",
  authDomain: "focusduo-10ae1.firebaseapp.com",
  projectId: "focusduo-10ae1",
  storageBucket: "focusduo-10ae1.firebasestorage.app",
  messagingSenderId: "611044167246",
  appId: "1:611044167246:web:6b7391b00ed52aa3e7bd1f",
  measurementId: "G-F6TH9RCYXC"
};

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (e) { /* analytics only in browser */ }

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

export {
  app,
  auth,
  provider,
  firebaseSignInWithPopup as signInWithPopup,
  firebaseSignOut as signOut,
  firebaseOnAuthStateChanged as onAuthStateChanged,
  db,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc,
  onSnapshot
};
