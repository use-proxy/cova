async function main() {
  const Replicate = (await import('replicate')).default
  const r = new Replicate({auth: process.env.REPLICATE_API_TOKEN})
  console.log('Testing depth model...')
  const output = await r.run(
    'chenxwh/depth-anything-v2:b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4',
    { input: { image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024', model_size: 'Large' } }
  ) as any
  console.log('output type:', typeof output)
  if (output && typeof output === 'object') {
    console.log('output keys:', Object.keys(output))
    const gd = output.grey_depth
    console.log('grey_depth type:', typeof gd)
    console.log('grey_depth constructor:', gd?.constructor?.name)
    if (gd) {
      try { console.log('grey_depth.url type:', typeof gd.url) } catch(e) { console.log('url access error:', String(e)) }
      try { console.log('grey_depth.toString():', gd.toString()) } catch(e) { console.log('toString error:', String(e)) }
      try { 
        if (typeof gd.url === 'function') {
          const urlResult = gd.url()
          console.log('url() result:', urlResult)
          console.log('url().href:', urlResult?.href)
        }
      } catch(e) { console.log('url() error:', String(e)) }
    }
  }
}
main().catch(console.error)
