/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      '@prisma/client',
      'prisma',
      'puppeteer-core',
      'imapflow',
      'mailparser',
      'web-push',
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // web-push uses Node.js native crypto — exclude from webpack bundle
      config.externals = Array.isArray(config.externals)
        ? [...config.externals, 'web-push']
        : [config.externals, 'web-push'].filter(Boolean)
    }
    return config
  },
}

module.exports = nextConfig
