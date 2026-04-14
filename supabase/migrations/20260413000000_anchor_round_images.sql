-- Add round_images column to quiz_anchor_images and populate it with
-- room-specific URLs for all 9 styles × 6 rooms × 3 rounds.
--
-- URL pattern:
--   .../quiz-images/anchors/room-specific/phase-a-{style-slug}-{room-slug}-r{1|2|3}.webp

ALTER TABLE quiz_anchor_images
  ADD COLUMN IF NOT EXISTS round_images jsonb;

UPDATE quiz_anchor_images
SET round_images = built.payload
FROM (
  SELECT
    style_name,
    jsonb_object_agg(room, urls) AS payload
  FROM (
    SELECT
      s.style_name,
      r.room,
      jsonb_build_object(
        'r1', 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/anchors/room-specific/phase-a-' || s.slug || '-' || r.room || '-r1.webp',
        'r2', 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/anchors/room-specific/phase-a-' || s.slug || '-' || r.room || '-r2.webp',
        'r3', 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/anchors/room-specific/phase-a-' || s.slug || '-' || r.room || '-r3.webp'
      ) AS urls
    FROM
      (VALUES
        ('Warm Japandi',          'warm-japandi'),
        ('Dark Moody Glam',       'dark-moody-glam'),
        ('Coastal Bright',        'coastal-bright'),
        ('Industrial Loft',       'industrial-loft'),
        ('Maximalist Eclectic',   'maximalist-eclectic'),
        ('Heritage Traditional',  'heritage-traditional'),
        ('Pure Minimal White',    'pure-minimal-white'),
        ('Biophilic Jungle',      'biophilic-jungle'),
        ('Retro Mid-Century',     'retro-mid-century')
      ) AS s(style_name, slug)
    CROSS JOIN
      (VALUES
        ('living-room'),
        ('bedroom'),
        ('dining-room'),
        ('kitchen'),
        ('bathroom'),
        ('home-office')
      ) AS r(room)
  ) sub
  GROUP BY style_name
) built
WHERE quiz_anchor_images.style_name = built.style_name;
