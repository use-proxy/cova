/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // SparkJS uses `new URL("data:application/wasm;base64,...")` which triggers
    // webpack's asset module processing with incompatible generator options.
    // Disable URL dependency parsing for SparkJS files.
    config.module.rules.unshift({
      test: /[\\/]@sparkjsdev[\\/]spark[\\/]dist[\\/]/,
      parser: { url: false },
    })
    return config
  },
}

export default nextConfig;
