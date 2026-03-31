import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ConditionalNav from '@/components/ConditionalNav'
import MainWrapper from '@/components/MainWrapper'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ColdCall CRM',
  description: 'Application de prospection cold calling',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ColdCall',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="bg-slate-950">
      <body className={`${inter.className} bg-slate-950 text-slate-100 min-h-screen`}>
        <div className="flex min-h-screen">
          <ConditionalNav />
          <MainWrapper>{children}</MainWrapper>
        </div>
      </body>
    </html>
  )
}
