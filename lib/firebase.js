// lib/firebase.js
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Your firebase config (you already gave this). If it's different, replace.
const firebaseConfig = {
  apiKey: "AIzaSyB8tzYEqejZMYvbapaLBOFHIS-wW6FIZPI",
  authDomain: "focusduo-10ae1.firebaseapp.com",
  projectId: "focusduo-10ae1",
  storageBucket: "focusduo-10ae1.firebasestorage.app",
  messagingSenderId: "611044167246",
  appId: "1:611044167246:web:6b7391b00ed52aa3e7bd1f",
  measurementId: "G-F6TH9RCYXC"
}

let app
if (!getApps().length) {
  app = initializeApp(firebaseConfig)
} else {
  app = getApp()
}

export const auth = getAuth(app)
export const provider = new GoogleAuthProvider()
export const db = getFirestore(app)
