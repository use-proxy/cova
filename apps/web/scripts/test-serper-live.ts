async function main() {
  const serper = await import('../lib/ai/serper')
  console.log('Testing Serper shopping search...')
  try {
    const query = serper.buildSearchQuery('modern walnut coffee table', [200, 800], false)
    console.log('Query:', query)
    const result = await serper.searchProducts(query, 5)
    console.log('Products found:', result.products.length)
    if (result.products.length > 0) {
      const p = result.products[0]!
      console.log('First product:', JSON.stringify({ name: p.title.slice(0, 50), price: p.price, retailer: p.retailer }))
    }
  } catch(e) {
    console.error('Error:', String(e))
  }
}
main().catch(console.error)
