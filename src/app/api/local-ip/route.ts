export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import os from 'os'

export async function GET() {
  const interfaces = os.networkInterfaces()
  const candidates: { ip: string; priority: number }[] = []

  for (const [name, iface] of Object.entries(interfaces)) {
    if (!iface) continue
    for (const addr of iface) {
      if (addr.family !== 'IPv4' || addr.internal) continue

      let priority = 0
      const ip = addr.address

      // Skip link-local (169.254.x.x) and loopback
      if (ip.startsWith('169.254.') || ip.startsWith('127.')) continue

      // Highest priority: iPhone hotspot (172.20.10.x, bridge100)
      if (ip.startsWith('172.20.10.') || name === 'bridge100') priority = 100
      // High: standard LAN (192.168.x.x)
      else if (ip.startsWith('192.168.')) priority = 80
      // Medium: Android hotspot / other private (10.x.x.x)
      else if (ip.startsWith('10.')) priority = 60
      // Low: other 172.x.x.x
      else if (ip.startsWith('172.')) priority = 40
      // Very low: anything else (192.0.x.x, VPN, etc.)
      else priority = 10

      candidates.push({ ip, priority })
    }
  }

  candidates.sort((a, b) => b.priority - a.priority)
  const localIp = candidates[0]?.ip || 'localhost'

  return NextResponse.json({ ip: localIp, all: candidates.map(c => c.ip) })
}
