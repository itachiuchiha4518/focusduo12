'use client'
import { useEffect, useState } from 'react'
import { auth, onAuthStateChanged, db, collection, getDocs, doc, updateDoc, getDoc, setDoc } from '../../lib/firebase'
import { useRouter } from 'next/navigation'

const ADMIN_UID = 'NIsbHB9RmXgR5vJEyv8CuV0ggD03'

export default function AdminPage(){
  const [user, setUser] = useState(null)
  const [payments, setPayments] = useState([])
  const [settings, setSettings] = useState(null)
  const [slots, setSlots] = useState({ open24x7: true, slots: [] })
  const router = useRouter()

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, (u)=>{
      if(!u) router.push('/')
      else {
        setUser(u)
        if(u.uid !== ADMIN_UID) router.push('/')
        else {
          fetchPayments()
          fetchSettings()
        }
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

  async function fetchSettings(){
    const snap = await getDoc(doc(db,'settings','payments'))
    const s = snap.exists() ? snap.data() : { upiId: '', qrByPlan: {} }
    setSettings(s)
    const slotsDoc = await getDoc(doc(db,'settings','slots'))
    if (slotsDoc.exists()) setSlots(slotsDoc.data())
  }

  async function approve(p){
    try{
      let months = 0
      if (p.planType === 'pro-month') months = 1
      else if (p.planType === 'pro-3') months = 3
      else if (p.planType === 'pro-12' || p.planType === 'first100') months = 12
      const expiry = new Date()
      expiry.setMonth(expiry.getMonth() + months)
      await updateDoc(doc(db,'users', p.uid), { plan: 'pro', planExpiry: expiry.toISOString() })
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

  async function banUser(uid){
    try{ await updateDoc(doc(db,'users', uid), { accountStatus: 'blocked' }); alert('User banned') }catch(e){console.error(e)}
  }

  async function setUPI(upi){
    try {
      await setDoc(doc(db,'settings','payments'), { upiId: upi, qrByPlan: settings?.qrByPlan || {} }, { merge: true })
      fetchSettings()
      alert('UPI saved')
    } catch(e) { console.error(e) }
  }

  async function setQR(planKey, url){
    try {
      const newMap = { ...(settings?.qrByPlan||{}), [planKey]: url }
      await setDoc(doc(db,'settings','payments'), { upiId: settings?.upiId || '', qrByPlan: newMap }, { merge: true })
      fetchSettings()
      alert('QR saved')
    } catch(e) { console.error(e) }
  }

  async function saveSlots(newSlots){
    try {
      await setDoc(doc(db,'settings','slots'), newSlots)
      fetchSettings()
      alert('Slots saved')
    } catch(e){ console.error(e) }
  }

  return (
    <div className="container mt-8">
      <h2 style={{fontWeight:700}}>Admin</h2>

      <div className="card p-4" style={{marginTop:12}}>
        <h3>Payments</h3>
        <div style={{marginTop:8}}>
          <div style={{marginBottom:8}}>UPI ID: <strong>{settings?.upiId}</strong></div>
          <div style={{marginBottom:8}}>QR per plan: {settings?.qrByPlan && Object.keys(settings.qrByPlan).map(k => <div key={k}><strong>{k}:</strong> <a href={settings.qrByPlan[k]} target="_blank" rel="noreferrer">QR</a></div>)}</div>
          <div style={{marginTop:8}}>
            <input placeholder="Set UPI Id" onBlur={e=>setUPI(e.target.value)} />
          </div>
          <div style={{marginTop:8}}>
            <input placeholder="QR URL for planKey (e.g., pro-month)" id="qrInput" />
            <input placeholder="planKey" id="planKeyInput" />
            <button onClick={()=>setQR(document.getElementById('planKeyInput').value, document.getElementById('qrInput').value)} className="btn small">Save QR</button>
          </div>
        </div>
      </div>

      <div className="card p-4 mt-6">
        <h3>Payments to verify</h3>
        {payments.length === 0 && <div className="muted">No payments found</div>}
        {payments.map(p => (
          <div key={p.id} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f0f2f5'}}>
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

      <div className="card p-4 mt-6">
        <h3>User Management</h3>
        <div>
          <input placeholder="Enter uid to ban" id="banUid" />
          <button onClick={()=>banUser(document.getElementById('banUid').value)} className="btn small" style={{marginLeft:8}}>Ban</button>
        </div>
      </div>

      <div className="card p-4 mt-6">
        <h3>Slots & 24/7 toggle</h3>
        <div>
          <label><input type="checkbox" checked={slots?.open24x7} onChange={e=>setSlots({...slots, open24x7: e.target.checked})}/> Open 24/7</label>
        </div>
        <div style={{marginTop:8}}>
          <div>Slots JSON (array of {`{from:'09:00',to:'11:00'}`}):</div>
          <textarea value={JSON.stringify(slots?.slots || [])} onChange={e=>setSlots({...slots, slots: JSON.parse(e.target.value||'[]')})} style={{width:'100%',height:100}} />
          <div style={{marginTop:8}}>
            <button onClick={()=>saveSlots(slots)} className="btn">Save slots</button>
          </div>
        </div>
      </div>

    </div>
  )
                             }
