// lib/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

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
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export default app;
