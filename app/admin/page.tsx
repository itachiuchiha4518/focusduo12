// app/admin/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { auth, db, collection, getDocs, doc, updateDoc } from '../../lib/firebase'
import { useRouter } from 'next/navigation'

const ADMIN_UID = 'NIsbHB9RmXgR5vJEyv8CuV0ggD03'

export default function AdminPage(){
  const [user, setUser] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const router = useRouter()

  useEffect(()=>{
    const unsub = auth.onAuthStateChanged(u=>{
      if(!u) router.push('/')
      else {
        setUser(u)
        if(u.uid !== ADMIN_UID) router.push('/')
        else fetchPayments()
      }
    })
    return () => unsub()
  },[])

  async function fetchPayments(){
    const snap = await getDocs(collection(db,'payments'))
    const arr: any[] = []
    snap.forEach(s => arr.push({ id: s.id, ...s.data() }))
    setPayments(arr)
  }

  async function approve(p: any){
    try{
      await updateDoc(doc(db,'users', p.uid), { plan: p.planType })
      await updateDoc(doc(db,'payments', p.id), { status: 'approved', verifiedAt: new Date().toISOString() })
      fetchPayments()
    }catch(e){ console.error(e) }
  }

  return (
    <div className="container mt-8">
      <h2 className="font-semibold">Admin</h2>
      <div className="mt-4 bg-white p-4 rounded shadow">
        <h3 className="font-medium">Pending payments</h3>
        <div className="mt-3">
          {payments.filter(p=>p.status!=='approved').map(p=>(
            <div key={p.id} className="p-3 border rounded mb-2 flex justify-between items-center">
              <div>
                <div className="text-sm">UID: {p.uid}</div>
                <div className="text-sm">Plan: {p.planType} • Txn: {p.transactionId}</div>
              </div>
              <div><button onClick={()=>approve(p)} className="px-3 py-1 bg-green-600 text-white rounded">Approve</button></div>
            </div>
          ))}
          {payments.filter(p=>p.status!=='approved').length===0 && <div className="text-sm text-slate-500">No pending payments</div>}
        </div>
      </div>
    </div>
  )
}
