// components/JitsiRoom.tsx
'use client'
import { useEffect, useRef } from 'react'

export default function JitsiRoom({ roomId, displayName }: { roomId: string, displayName?: string }){
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(()=>{
    if(!roomId || !ref.current) return
    const domain = 'meet.jit.si'
    const roomName = `FocusDuo_${roomId}`
    const iframe = document.createElement('iframe')
    iframe.src = `https://${domain}/${roomName}#userInfo.displayName="${encodeURIComponent(displayName || 'Student')}"`;
    iframe.allow = 'camera; microphone; fullscreen; display-capture'
    iframe.style.width = '100%'
    iframe.style.height = '640px'
    iframe.style.border = '0'
    ref.current.innerHTML = ''
    ref.current.appendChild(iframe)
    return () => { if(ref.current) ref.current.innerHTML = '' }
  }, [roomId, displayName])

  return <div ref={ref} className="rounded bg-black/5" />
}
