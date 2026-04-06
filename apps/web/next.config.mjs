import { createRequire } from 'node:module'
import { dirname } from 'node:path'
const require = createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['sharp'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'replicate.delivery',
      },
      {
        protocol: 'https',
        hostname: 'pbxt.replicate.delivery',
      },
      {
        protocol: 'https',
        hostname: '*.replicate.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ]
  },
  webpack: (config) => {
    // SparkJS uses `new URL("data:application/wasm;base64,...")` which triggers
    // webpack's asset module processing with incompatible generator options.
    // Disable URL dependency parsing for SparkJS files.
    config.module.rules.unshift({
      test: /[\\/]@sparkjsdev[\\/]spark[\\/]dist[\\/]/,
      parser: { url: false },
    })

    // Root pnpm overrides pin three@0.155.0 for mobile compatibility.
    // SparkJS needs three@0.167.0+ (Matrix2 class). Resolve 'three' to
    // the npm-aliased 'three-web' package (three@0.169.0) for the web build.
    const threeWebEntry = require.resolve('three-web')
    const threeWebDir = dirname(dirname(threeWebEntry))
    config.resolve.alias = {
      ...config.resolve.alias,
      three: threeWebDir,
    }

    return config
  },
}

export default nextConfig
