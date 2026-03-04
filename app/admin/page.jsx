// app/admin/page.jsx
'use client'
import { useEffect, useState } from 'react'
import { auth, onAuthStateChanged, db, collection, getDocs, doc, updateDoc } from '../../lib/firebase'
import { useRouter } from 'next/navigation'

const ADMIN_UID = 'NIsbHB9RmXgR5vJEyv8CuV0ggD03'

export default function AdminPage(){
  const [user, setUser] = useState(null)
  const [payments, setPayments] = useState([])
  const router = useRouter()

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, (u)=>{
      if(!u) router.push('/')
      else {
        setUser(u)
        if(u.uid !== ADMIN_UID) router.push('/')
        else fetchPayments()
      }
    })
    return () => unsub && unsub()
  },[])

  async function fetchPayments(){
    const snap = await getDocs(collection(db,'payments'))
    const arr = []
    snap.forEach(s => arr.push({ id: s.id, ...s.data() }))
    setPayments(arr)
  }

  async function approve(p){
    try{
      await updateDoc(doc(db,'users', p.uid), { plan: p.planType })
      await updateDoc(doc(db,'payments', p.id), { status: 'approved', verifiedAt: new Date().toISOString() })
      fetchPayments()
    }catch(e){ console.error(e) }
  }

  return (
    <div className="container mt-8">
      <h2>Admin</h2>
      <div className="card p-4">
        <h3>Pending payments</h3>
        <div>
          {payments.filter(p=>p.status!=='approved').map(p=>(
            <div key={p.id} className="payment-row">
              <div>UID: {p.uid}</div>
              <div>Plan: {p.planType} • Txn: {p.transactionId}</div>
              <button onClick={()=>approve(p)} className="btn small">Approve</button>
            </div>
          ))}
          {payments.filter(p=>p.status!=='approved').length===0 && <div className="muted">No pending payments</div>}
        </div>
      </div>
    </div>
  )
}
