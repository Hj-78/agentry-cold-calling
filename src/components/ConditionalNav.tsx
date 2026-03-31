'use client'

import { usePathname } from 'next/navigation'
import Navigation from '@/components/Navigation'

// Pages sans navigation (mode standalone téléphone)
const NO_NAV_PATHS = ['/appel', '/tel']

export default function ConditionalNav() {
  const pathname = usePathname()
  if (NO_NAV_PATHS.some(p => pathname.startsWith(p))) return null
  return <Navigation />
}
