'use client'

import { usePathname } from 'next/navigation'

const NO_NAV_PATHS = ['/appel']

export default function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isStandalone = NO_NAV_PATHS.some(p => pathname.startsWith(p))
  return (
    <main className={`flex-1 ${isStandalone ? '' : 'md:ml-64 pb-24 md:pb-0'}`}>
      {children}
    </main>
  )
}
