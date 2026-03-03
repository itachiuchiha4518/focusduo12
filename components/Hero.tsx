// components/Hero.tsx
'use client'
import Link from 'next/link'

export default function Hero(){
  return (
    <section className="container mt-12 grid md:grid-cols-2 gap-8 items-center">
      <div>
        <div className="kicker mb-3">FocusDuo — Built for JEE & NEET</div>
        <h1 className="text-4xl md:text-5xl font-extrabold">Study together. <span className="text-primary">Stay consistent.</span></h1>
        <p className="mt-4 text-slate-600 max-w-xl">Structured timed sessions, visible progress, and social accountability — designed to make studying habitual.</p>
        <div className="mt-6 flex gap-4">
          <Link href="/dashboard"><a className="btn-primary inline-flex items-center gap-3">Get started — it's free</a></Link>
          <a href="#features" className="text-sm text-slate-600">How it works</a>
        </div>
      </div>

      <div className="hero-card p-6">
        <div className="text-sm text-slate-500">Live session • Physics • JEE</div>
        <div className="mt-4 bg-white rounded-lg p-4 shadow">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[conic-gradient(at_top_left,_#0b61ff,_#00c2a8)] flex items-center justify-center text-white font-bold">FD</div>
            <div>
              <div className="font-semibold">Thermo Study Group</div>
              <div className="text-xs text-slate-500">5 participants • 20m left</div>
            </div>
            <div className="ml-auto text-sm text-primary font-semibold">14d streak</div>
          </div>
        </div>
      </div>
    </section>
  )
}
