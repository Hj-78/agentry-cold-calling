'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Sidebar desktop : toutes les pages
const desktopTabs = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/sessions', label: 'Sessions', icon: '▶' },
  { href: '/agences', label: 'Agences', icon: '🏢' },
  { href: '/import', label: 'Import', icon: '📥' },
  { href: '/rappels', label: 'Rappels', icon: '🔔' },
  { href: '/calendrier', label: 'Calendrier', icon: '📅' },
  { href: '/emails', label: 'Emails', icon: '✉️' },
  { href: '/parametres', label: 'Paramètres', icon: '⚙️' },
]

// Bottom bar mobile : 5 onglets principaux
const mobileTabs = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/sessions', label: 'Sessions', icon: '▶' },
  { href: '/agences', label: 'Agences', icon: '🏢' },
  { href: '/import', label: 'Import', icon: '📥' },
  { href: '/emails', label: 'Emails', icon: '✉️' },
]

export default function Navigation() {
  const pathname = usePathname()

  return (
    <>
      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-950 border-r border-slate-800 min-h-screen py-8 px-5 fixed left-0 top-0 bottom-0">
        <div className="mb-10 px-2">
          <h1 className="text-xl font-bold text-white tracking-tight">ColdCall CRM</h1>
          <p className="text-sm text-slate-500 mt-1">Prospection pro</p>
        </div>
        <nav className="flex flex-col gap-1.5">
          {desktopTabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-medium transition-all ${
                pathname === tab.href || (tab.href !== '/dashboard' && pathname.startsWith(tab.href))
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Bottom bar mobile — 5 onglets */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur border-t border-slate-800 flex z-50"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {mobileTabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href !== '/dashboard' && pathname.startsWith(tab.href))
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center pt-3 pb-2 gap-0.5 transition-colors min-h-[56px] ${
                isActive ? 'text-indigo-400' : 'text-slate-500 active:text-slate-300'
              }`}
            >
              <span className={`text-[22px] leading-none transition-transform ${isActive ? 'scale-110' : ''}`}>
                {tab.icon}
              </span>
              <span className={`text-[9px] font-semibold tracking-wide ${isActive ? 'text-indigo-400' : 'text-slate-600'}`}>
                {tab.label.toUpperCase()}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
