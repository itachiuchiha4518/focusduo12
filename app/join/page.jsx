'use client'

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

import { auth, googleProvider, db } from "../../lib/firebase"

import { signInWithPopup } from "firebase/auth"
import {
collection,
addDoc,
serverTimestamp,
query,
where,
getDocs,
deleteDoc,
doc
} from "firebase/firestore"

export default function JoinPage() {

const router = useRouter()

const [exam,setExam] = useState("JEE")
const [subject,setSubject] = useState("Physics")
const [mode,setMode] = useState("one-on-one")

const [status,setStatus] = useState("idle")
const [queueId,setQueueId] = useState(null)

async function ensureLogin(){

if(auth.currentUser) return auth.currentUser

const result = await signInWithPopup(auth,googleProvider)

return result.user

}

async function startMatchmaking(){

try{

  setStatus("signing-in")

  const user = await ensureLogin()

  setStatus("searching")

  const queueRef = collection(db,"queues")

  const q = query(
    queueRef,
    where("exam","==",exam),
    where("subject","==",subject),
    where("mode","==",mode)
  )

  const snap = await getDocs(q)

  if(snap.docs.length > 0){

    const partnerDoc = snap.docs[0]
    const partner = partnerDoc.data()

    const sessionRef = await addDoc(collection(db,"sessions"),{
      exam,
      subject,
      mode,
      createdAt:serverTimestamp(),
      participants:[
        {uid:user.uid,name:user.displayName},
        {uid:partner.uid,name:partner.name}
      ]
    })

    await deleteDoc(doc(db,"queues",partnerDoc.id))

    router.push(`/session/${sessionRef.id}`)

    return
  }

  const myQueue = await addDoc(queueRef,{
    uid:user.uid,
    name:user.displayName,
    exam,
    subject,
    mode,
    createdAt:serverTimestamp()
  })

  setQueueId(myQueue.id)

  setStatus("waiting")

}catch(err){

  console.error(err)

  alert("Matchmaking failed")

  setStatus("error")
}

}

async function cancelQueue(){

if(!queueId) return

try{

  await deleteDoc(doc(db,"queues",queueId))

  setQueueId(null)

  setStatus("idle")

}catch(err){

  console.error(err)
}

}

useEffect(()=>{

return ()=>{

  if(queueId){
    deleteDoc(doc(db,"queues",queueId))
  }

}

},[queueId])

return (

<div style={{padding:40,maxWidth:600,margin:"auto"}}>

  <h1>Find Study Partner</h1>

  <div style={{marginTop:20}}>

    <label>Exam</label>

    <select
      value={exam}
      onChange={(e)=>setExam(e.target.value)}
    >
      <option>JEE</option>
      <option>NEET</option>
    </select>

  </div>

  <div style={{marginTop:20}}>

    <label>Subject</label>

    <select
      value={subject}
      onChange={(e)=>setSubject(e.target.value)}
    >
      <option>Physics</option>
      <option>Chemistry</option>
      <option>Math</option>
      <option>Biology</option>
    </select>

  </div>

  <div style={{marginTop:20}}>

    <label>Mode</label>

    <select
      value={mode}
      onChange={(e)=>setMode(e.target.value)}
    >
      <option value="one-on-one">1-on-1</option>
      <option value="group">Group</option>
    </select>

  </div>

  <div style={{marginTop:30}}>

    <button
      onClick={startMatchmaking}
      disabled={status==="searching" || status==="waiting"}
    >
      Start Matchmaking
    </button>

    <button
      onClick={cancelQueue}
      style={{marginLeft:10}}
    >
      Cancel
    </button>

  </div>

  <div style={{marginTop:20}}>
    Status: {status}
  </div>

</div>

)
}
