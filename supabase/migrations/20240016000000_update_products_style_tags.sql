-- Replace 'industrial' style tag with 'mid_century' since industrial
-- is not a valid StyleName in V1
UPDATE public.products
SET style_tags = array_replace(style_tags, 'industrial', 'mid_century')
WHERE 'industrial' = ANY(style_tags);
