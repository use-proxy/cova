import { createRequire } from 'node:module'
import { dirname } from 'node:path'
const require = createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
  },
  images: {
    remotePatterns: [
      // Supabase storage
      { protocol: 'https', hostname: '*.supabase.co' },
      // Replicate AI renders
      { protocol: 'https', hostname: 'replicate.delivery' },
      { protocol: 'https', hostname: 'pbxt.replicate.delivery' },
      { protocol: 'https', hostname: '*.replicate.com' },
      // Product images — Amazon
      { protocol: 'https', hostname: 'm.media-amazon.com' },
      { protocol: 'https', hostname: 'images-na.ssl-images-amazon.com' },
      // Product images — Serper / Google Shopping
      { protocol: 'https', hostname: 'encrypted-tbn0.gstatic.com' },
      // Product images — Target
      { protocol: 'https', hostname: 'target.scene7.com' },
      // Product images — West Elm
      { protocol: 'https', hostname: 'www.westelm.com' },
      // Product images — CB2
      { protocol: 'https', hostname: 'cb2.scene7.com' },
      // Product images — Pottery Barn
      { protocol: 'https', hostname: 'assets.pbimgs.com' },
      // Product images — Walmart
      { protocol: 'https', hostname: 'i5.walmartimages.com' },
      // Placeholder / dev images
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
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
