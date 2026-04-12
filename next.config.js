/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      '@prisma/client',
      'prisma',
      'puppeteer-core',
      'imapflow',
      'mailparser',
    ],
  },
}

module.exports = nextConfig
