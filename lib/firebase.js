// lib/firebase.js
// Minimal placeholder so client imports won't crash the build.
// We will replace this with the full firebase logic after safe deploy.

export const auth = null
export const db = null

export function onAuthStateChanged() { return () => {} }
export function signInWithPopup() { throw new Error('Not enabled in safe mode') }
export function signOut() { throw new Error('Not enabled in safe mode') }

export function collection() { throw new Error('Not enabled in safe mode') }
export function doc() { throw new Error('Not enabled in safe mode') }
export function addDoc() { throw new Error('Not enabled in safe mode') }
export function setDoc() { throw new Error('Not enabled in safe mode') }
export function getDoc() { throw new Error('Not enabled in safe mode') }
export function getDocs() { throw new Error('Not enabled in safe mode') }
export function onSnapshot() { throw new Error('Not enabled in safe mode') }
export function deleteDoc() { throw new Error('Not enabled in safe mode') }
export function query() { throw new Error('Not enabled in safe mode') }
export function where() { throw new Error('Not enabled in safe mode') }
export function orderBy() { throw new Error('Not enabled in safe mode') }
