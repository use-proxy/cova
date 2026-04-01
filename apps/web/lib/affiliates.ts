/**
 * Cova — Affiliate URL Builder
 *
 * Builds retailer-specific affiliate URLs for product links.
 * All affiliate IDs come from server-side environment variables.
 */

type Retailer =
  | 'amazon'
  | 'ikea'
  | 'article'
  | 'crate_barrel'
  | 'cb2'
  | 'west_elm'
  | 'pottery_barn'
  | 'ruggable'
  | 'one_kings_lane'
  | 'overstock'
  | 'etsy'
  | 'wayfair'

/**
 * Build an affiliate-tagged URL for a product.
 *
 * @param productUrl - The original product URL
 * @param retailer - Retailer identifier (matches products.retailer column)
 * @param asin - Amazon ASIN (optional, extracted from URL if not provided)
 * @returns Affiliate-tagged URL, or the original URL if no affiliate program
 */
export function buildAffiliateUrl(
  productUrl: string,
  retailer: string,
  asin?: string
): string {
  const r = retailer.toLowerCase() as Retailer

  switch (r) {
    case 'amazon':
      return buildAmazonUrl(productUrl, asin)

    case 'ikea':
      // No affiliate program — return as-is
      return productUrl

    case 'article':
      return buildAwcUrl(productUrl, process.env.ARTICLE_AFFILIATE_ID)

    case 'crate_barrel':
      return buildSovrnUrl(productUrl, process.env.CRATE_BARREL_AFFILIATE_ID)

    case 'cb2':
      return buildSovrnUrl(productUrl, process.env.CB2_AFFILIATE_ID)

    case 'west_elm':
      return buildShareASaleUrl(productUrl, process.env.WEST_ELM_AFFILIATE_ID)

    case 'pottery_barn':
      return buildShareASaleUrl(productUrl, process.env.POTTERY_BARN_AFFILIATE_ID)

    case 'ruggable':
      return buildCjUrl(productUrl, process.env.RUGGABLE_AFFILIATE_ID)

    case 'one_kings_lane':
      return buildCjUrl(productUrl, process.env.ONE_KINGS_LANE_AFFILIATE_ID)

    case 'overstock':
      return buildCjUrl(productUrl, process.env.OVERSTOCK_AFFILIATE_ID)

    case 'etsy':
      return buildAwinUrl(productUrl, process.env.ETSY_AFFILIATE_ID)

    default:
      // Unknown retailer — return original URL
      return productUrl
  }
}

// ---------------------------------------------------------------------------
// Retailer-specific URL builders
// ---------------------------------------------------------------------------

function buildAmazonUrl(productUrl: string, asin?: string): string {
  const tag = process.env.AMAZON_AFFILIATE_TAG || 'cova03-20'

  if (asin) {
    return `https://www.amazon.com/dp/${asin}?tag=${tag}`
  }

  // Try to extract ASIN from URL: /dp/B0XXXXXXXX or /gp/product/B0XXXXXXXX
  const asinMatch = productUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)
  if (asinMatch) {
    return `https://www.amazon.com/dp/${asinMatch[1]}?tag=${tag}`
  }

  // Fallback: append tag to existing URL
  const sep = productUrl.includes('?') ? '&' : '?'
  return `${productUrl}${sep}tag=${tag}`
}

function buildAwcUrl(productUrl: string, affiliateId?: string): string {
  if (!affiliateId) return productUrl
  const sep = productUrl.includes('?') ? '&' : '?'
  return `${productUrl}${sep}awc=${affiliateId}`
}

function buildSovrnUrl(productUrl: string, affiliateId?: string): string {
  if (!affiliateId) return productUrl
  const encoded = encodeURIComponent(productUrl)
  return `https://redirect.viglink.com?key=${affiliateId}&u=${encoded}`
}

function buildShareASaleUrl(productUrl: string, affiliateId?: string): string {
  if (!affiliateId) return productUrl
  const encoded = encodeURIComponent(productUrl)
  return `https://www.shareasale.com/r.cfm?u=${affiliateId}&urllink=${encoded}`
}

function buildCjUrl(productUrl: string, affiliateId?: string): string {
  if (!affiliateId) return productUrl
  const encoded = encodeURIComponent(productUrl)
  return `https://www.anrdoezrs.net/links/${affiliateId}/type/dlg/${encoded}`
}

function buildAwinUrl(productUrl: string, affiliateId?: string): string {
  if (!affiliateId) return productUrl
  const encoded = encodeURIComponent(productUrl)
  return `https://www.awin1.com/cread.php?awinmid=${affiliateId}&p=${encoded}`
}
