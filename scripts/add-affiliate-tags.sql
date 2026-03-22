-- One-time affiliate tag UPDATE statements
-- Run once per retailer after the affiliate program account is approved
-- Each statement is idempotent (WHERE ... NOT LIKE guard prevents double-tagging)

-- Amazon Associates (tag: cova03-20)
UPDATE public.products
SET affiliate_url = affiliate_url || '?tag=cova03-20'
WHERE retailer = 'amazon'
  AND affiliate_url NOT LIKE '%tag=%';

-- Wayfair Partner Network (replace WAYFAIR_TAG with actual refid from Wayfair dashboard)
UPDATE public.products
SET affiliate_url = affiliate_url || '?refid=WAYFAIR_TAG'
WHERE retailer = 'wayfair'
  AND affiliate_url NOT LIKE '%refid=%';

-- West Elm via CJ Affiliate (replace CLICK_ID with actual CJ click ID)
-- UPDATE public.products
-- SET affiliate_url = 'https://www.anrdoezrs.net/click-CLICK_ID?url=' || affiliate_url
-- WHERE retailer = 'west_elm';

-- CB2 via CJ Affiliate (replace CLICK_ID with actual CJ click ID)
-- UPDATE public.products
-- SET affiliate_url = 'https://www.anrdoezrs.net/click-CLICK_ID?url=' || affiliate_url
-- WHERE retailer = 'cb2';

-- Article via Impact Radius (pending approval)
-- UPDATE public.products
-- SET affiliate_url = 'https://track.article.com/click?url=' || affiliate_url
-- WHERE retailer = 'article';
