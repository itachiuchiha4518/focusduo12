'use client'
import { useEffect, useState } from 'react'
import { auth, onAuthStateChanged, db, collection, getDocs, doc, updateDoc } from '../../lib/firebase'
import { useRouter } from 'next/navigation'

const ADMIN_UID = 'NIsbHB9RmXgR5vJEyv8CuV0ggD03'

function addMonthsToDateStr(months){
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString()
}

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
      // determine expiry
      let months = 0
      if (p.planType === 'pro-month') months = 1
      else if (p.planType === 'pro-3') months = 3
      else if (p.planType === 'pro-12' || p.planType === 'first100') months = 12
      const expiry = addMonthsToDateStr(months)
      // update user plan
      await updateDoc(doc(db,'users', p.uid), { plan: 'pro', planExpiry: expiry })
      // update payment doc
      await updateDoc(doc(db,'payments', p.id), { status: 'approved', verifiedAt: new Date().toISOString() })
      fetchPayments()
    }catch(e){ console.error(e); alert('Approve failed: ' + (e.message || e)) }
  }

  async function decline(p){
    try{
      await updateDoc(doc(db,'payments', p.id), { status: 'declined', verifiedAt: new Date().toISOString() })
      fetchPayments()
    }catch(e){ console.error(e); alert('Decline failed: ' + (e.message || e)) }
  }

  return (
    <div className="container mt-8">
      <h2 style={{fontWeight:700}}>Admin</h2>
      <div className="card p-4" style={{marginTop:12}}>
        <h3>Payments</h3>
        <div style={{marginTop:8}}>
          {payments.length === 0 && <div className="muted">No payments found</div>}
          {payments.map(p => (
            <div key={p.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #f0f2f5'}}>
              <div>
                <div style={{fontWeight:600}}>{p.uid}</div>
                <div className="muted">plan: {p.planType} • txn: {p.transactionId} • status: {p.status}</div>
              </div>
              <div style={{display:'flex', gap:8}}>
                {p.status !== 'approved' && <button onClick={()=>approve(p)} className="btn small">Approve</button>}
                {p.status !== 'declined' && <button onClick={()=>decline(p)} className="btn small">Decline</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
