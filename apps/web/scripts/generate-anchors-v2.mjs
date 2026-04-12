import Replicate from 'replicate'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

const QUALITY = 'ultra realistic, professional interior photography, shot on Hasselblad medium format, perfect composition, shallow depth of field, Architectural Digest editorial, hyperdetailed, 8K resolution, cinematic lighting'

const images = [

  // ═══════════════════════════════════════════════════════════════
  // BEDROOM
  // ═══════════════════════════════════════════════════════════════
  {
    filename: 'phase-a-warm-japandi-bedroom.webp',
    prompt: `Japandi bedroom, white oak platform bed extremely low to ground, Japanese washi paper pendant lamp glowing amber, golden morning light through sheer linen curtains, single handthrown ceramic vase with cherry blossom branch, natural wool tatami rug, warm greige walls, hinoki wood nightstand, zero clutter, serene wabi-sabi atmosphere, ${QUALITY}`
  },
  {
    filename: 'phase-a-coastal-bright-bedroom.webp',
    prompt: `Coastal luxury bedroom, large arched window framing turquoise ocean view and blue sky, driftwood-textured headboard, crisp navy and white stripe linen bedding, natural rattan pendant lights, sun-bleached white oak floors, sea glass objects on nightstand, sheer white curtains catching ocean breeze, abundantly bright sun-drenched atmosphere, ${QUALITY}`
  },
  {
    filename: 'phase-a-industrial-loft-bedroom.webp',
    prompt: `Urban industrial loft bedroom, soaring 14-foot exposed brick wall, dramatic cluster of Edison bulb pendants at varying heights, low platform bed with charcoal linen, aged leather bench at foot, reclaimed wood nightstand, concrete ceiling with exposed steel ducts, large factory steel-grid windows, one large fiddle leaf fig, moody dramatic atmosphere, ${QUALITY}`
  },
  {
    filename: 'phase-a-maximalist-eclectic-bedroom.webp',
    prompt: `Maximalist eclectic bedroom, jewel-toned emerald velvet headboard floor to ceiling, perfectly curated gallery wall of original artwork in mixed gilt frames, bold geometric rug in deep burgundy and gold, layered embroidered throw pillows, brass chandelier with crystals, antique chest covered with curated objects, lush tropical plants, deeply saturated rich colors, ${QUALITY}`
  },
  {
    filename: 'phase-a-heritage-traditional-bedroom.webp',
    prompt: `Classic traditional bedroom, grand mahogany four-poster bed with carved details, walls in rich sage green damask fabric, oil painting in gilt frame above marble fireplace, antique Persian rug in burgundy and navy, crystal lamps casting amber glow, tufted velvet chaise lounge, heavy silk curtains pooling on floor, supremely elegant old-world grandeur, ${QUALITY}`
  },
  {
    filename: 'phase-a-pure-minimal-white-bedroom.webp',
    prompt: `Pure minimalist bedroom, immaculate white walls double height ceiling, single tall narrow window casting one perfect sharp diagonal shadow across room, ultra-low platform bed in pure white Japanese linen, one white ceramic sculptural vessel on polished concrete floor, nothing else in room whatsoever, stark and beautiful architectural silence, profound restraint, ${QUALITY}`
  },
  {
    filename: 'phase-a-biophilic-jungle-bedroom.webp',
    prompt: `Biophilic jungle bedroom, entire wall covered in living moss and climbing plants, monstera and trailing pothos cascading from ceiling, rattan canopy bed draped with hanging plants, natural linen bedding, terracotta pots of plants covering every surface, morning dappled light filtering through dense foliage, sleeping inside a lush greenhouse sanctuary, ${QUALITY}`
  },
  {
    filename: 'phase-a-retro-mid-century-bedroom.webp',
    prompt: `Mid-century modern bedroom 1960s, iconic walnut platform bed with tapered legs, dramatic oversized sunburst mirror in brushed gold, avocado green and burnt orange geometric bedding, walnut credenza with period ceramic lamp, abstract expressionist canvas, shag carpet in caramel, angled ceiling with exposed beam, authentically joyful 1960s Eames era perfection, ${QUALITY}`
  },

  // ═══════════════════════════════════════════════════════════════
  // KITCHEN
  // ═══════════════════════════════════════════════════════════════
  {
    filename: 'phase-a-warm-japandi-kitchen.webp',
    prompt: `Japandi kitchen, warm white oak handleless flat-front cabinets, single waterfall island in honed oak, Japanese donabe clay pots and ceramic bowls on open shelving, small bonsai above sink, matte white stone countertops, warm under-cabinet amber lighting, utterly calm and considered composition, deeply minimal, ${QUALITY}`
  },
  {
    filename: 'phase-a-coastal-bright-kitchen.webp',
    prompt: `Coastal luxury kitchen, powder blue painted shaker cabinets with brushed brass hardware, open rattan shelving with handthrown white ceramics, large garden window with herbs and ocean glimpse, white marble countertops, woven natural fiber pendants, white beadboard backsplash, abundantly bright light flooding space, fresh eucalyptus bouquet, ${QUALITY}`
  },
  {
    filename: 'phase-a-industrial-loft-kitchen.webp',
    prompt: `Urban industrial kitchen, matte black steel open shelving on exposed brick wall, raw concrete countertops, professional brushed steel range with hanging pot rack, Edison pendant cluster, blackened steel cabinet faces, reclaimed wood island with leather stools, factory grid-pane windows, aged copper fixtures, dramatically moody atmosphere, ${QUALITY}`
  },
  {
    filename: 'phase-a-maximalist-eclectic-kitchen.webp',
    prompt: `Maximalist eclectic kitchen, hand-painted Moroccan zellige jewel-tone tile covering entire back wall, open shelving overflowing with colorful ceramics from around the world, bold emerald green lower cabinets with brass hardware, hanging copper pots and dried herbs and chilies, eclectic vintage art on walls, mismatched colorful stools, lush trailing plants, ${QUALITY}`
  },
  {
    filename: 'phase-a-heritage-traditional-kitchen.webp',
    prompt: `Classic traditional kitchen, cream raised-panel cabinets with antique brass hardware, honed marble countertops and backsplash, farmhouse apron sink with antique bridge faucet, glass-front cabinets displaying fine china, oil-rubbed bronze pendants, kitchen island with turned legs, Persian runner rug, fresh flowers in silver pitcher, supremely timeless elegance, ${QUALITY}`
  },
  {
    filename: 'phase-a-pure-minimal-white-kitchen.webp',
    prompt: `Pure minimalist kitchen, seamless handleless white stone cabinets floor to ceiling, Calacatta gold marble waterfall island, dramatic recessed LED lighting, single perfect lemon on counter, all appliances hidden behind panel fronts, white polished concrete floor, one architectural pendant, profound stillness, nothing superfluous, stark beautiful perfection, ${QUALITY}`
  },
  {
    filename: 'phase-a-biophilic-jungle-kitchen.webp',
    prompt: `Biophilic kitchen, full wall living vertical garden with cascading pothos monstera philodendron and herbs floor to ceiling, reclaimed wood open shelving with terracotta herb pots, warm wood live-edge countertops, natural stone backsplash, hanging dried herb bunches and trailing vines from ceiling, deeply immersive nature kitchen, earthy warm greens and browns, ${QUALITY}`
  },
  {
    filename: 'phase-a-retro-mid-century-kitchen.webp',
    prompt: `Mid-century modern kitchen 1960s, mustard yellow flat-front cabinets with chrome pulls, black and white checkerboard terrazzo floor, curved organic island, vintage cream Smeg refrigerator, open shelving with atomic-age ceramics and barware, spun aluminum pendant lights, abstract art print, avocado green accents, authentically joyful 1960s optimism, ${QUALITY}`
  },

  // ═══════════════════════════════════════════════════════════════
  // DINING ROOM
  // ═══════════════════════════════════════════════════════════════
  {
    filename: 'phase-a-warm-japandi-dining-room.webp',
    prompt: `Japandi dining room, long low warm white oak dining table with live edge, Japanese washi paper lantern pendant warm glow, handcrafted ceramic tableware, linen cushions on solid oak chairs, single ikebana flower arrangement as only decoration, warm greige walls, tatami mat rug, morning light through shoji-inspired screens, profound zen stillness, ${QUALITY}`
  },
  {
    filename: 'phase-a-coastal-bright-dining-room.webp',
    prompt: `Coastal luxury dining room, dramatic wall of floor-to-ceiling arched windows overlooking ocean, driftwood-finish round dining table, rattan wishbone chairs with white linen cushions, oversized natural fiber pendant chandelier, whitewashed wood floors, sea grass area rug, fresh eucalyptus and white flowers centerpiece, brilliantly bright sun-drenched atmosphere, ${QUALITY}`
  },
  {
    filename: 'phase-a-industrial-loft-dining-room.webp',
    prompt: `Urban industrial dining room, soaring exposed brick wall, dramatic cluster of mixed Edison pendants at varying heights, long reclaimed wood farm table, mismatched leather and metal dining chairs, concrete floor with worn Persian rug, large steel-frame factory windows, exposed I-beam ceiling, vintage shelving with glassware, moody warm Edison atmosphere, ${QUALITY}`
  },
  {
    filename: 'phase-a-maximalist-eclectic-dining-room.webp',
    prompt: `Maximalist eclectic dining room, dramatic hand-blocked jewel-tone wallpaper on every wall, long dark walnut table with different vintage chairs each unique, chandelier dripping with crystals and colored glass, gallery wall of original paintings and eclectic mirrors, layered Persian and kilim rugs, colorful ceramic collection on open shelving, lush tropical plants, joyfully abundant, ${QUALITY}`
  },
  {
    filename: 'phase-a-heritage-traditional-dining-room.webp',
    prompt: `Classic traditional formal dining room, grand mahogany oval table seating twelve, upholstered high-back chairs in sage velvet, crystal chandelier with candle bulbs, wainscoting and crown moulding, oil landscape in gilt frame, antique sideboard with silver candelabras, Persian rug in deep burgundy, silk drapes pooling on floor, supremely grand elegant atmosphere, ${QUALITY}`
  },
  {
    filename: 'phase-a-pure-minimal-white-dining-room.webp',
    prompt: `Pure minimalist dining room, pure white rectangular table with barely visible base, single large matte white sculptural pendant light, four white tulip chairs, completely bare white plaster walls, one dramatic shaft of light from high window casting single shadow stripe, white polished concrete floor, single white orchid only object in room, architectural silence, ${QUALITY}`
  },
  {
    filename: 'phase-a-biophilic-jungle-dining-room.webp',
    prompt: `Biophilic jungle dining room, dining table completely surrounded by floor-to-ceiling lush tropical plants, living moss wall behind table, monstera and banana leaf creating canopy above, reclaimed wood table, natural rattan chairs, terracotta floor tiles, cascading pothos from overhead, eating inside a greenhouse, warm dappled light through dense foliage, ${QUALITY}`
  },
  {
    filename: 'phase-a-retro-mid-century-dining-room.webp',
    prompt: `Mid-century modern dining room 1960s, iconic white tulip table with tulip chairs, dramatic sputnik brass chandelier, bold geometric wallpaper in terracotta and mustard, walnut credenza with ceramic sculpture, abstract expressionist canvas, avocado and burnt orange accents, period shag rug, authentically joyful 1960s optimism, ${QUALITY}`
  },
]

const STORAGE_PATH = 'quiz-images/anchors/room-specific'
const BUCKET_BASE = 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object'

async function generate() {
  console.log(`Generating ${images.length} images at 1344x768...\n`)
  let success = 0
  let failed = 0

  for (const img of images) {
    console.log(`[${success + failed + 1}/${images.length}] ${img.filename}`)
    
    try {
      const prediction = await replicate.predictions.create({
        model: 'black-forest-labs/flux-1.1-pro',
        input: {
          prompt: img.prompt,
          width: 1344,
          height: 768,
          num_inference_steps: 30,
          guidance_scale: 3.5,
          output_format: 'webp',
          output_quality: 95,
          safety_tolerance: 2,
        }
      })

      let p = prediction
      while (
        p.status !== 'succeeded' &&
        p.status !== 'failed' &&
        p.status !== 'canceled'
      ) {
        await new Promise(r => setTimeout(r, 3000))
        p = await replicate.predictions.get(p.id)
        process.stdout.write('.')
      }
      console.log('')

      if (p.status !== 'succeeded') {
        console.error(`  ✗ Generation failed: ${p.error}`)
        failed++
        continue
      }

      const imageUrl = Array.isArray(p.output) ? p.output[0] : p.output
      const imageRes = await fetch(imageUrl)
      const imageBuffer = await imageRes.arrayBuffer()

      const uploadRes = await fetch(
        `${BUCKET_BASE}/${STORAGE_PATH}/${img.filename}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'image/webp',
            'x-upsert': 'true'
          },
          body: imageBuffer
        }
      )

      if (uploadRes.ok) {
        console.log(`  ✓ Uploaded`)
        success++
      } else {
        const err = await uploadRes.text()
        console.error(`  ✗ Upload failed: ${err}`)
        failed++
      }
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`)
      failed++
    }
  }

  console.log(`\n═══════════════════════════════`)
  console.log(`Done: ${success} succeeded, ${failed} failed`)
  console.log(`Cost: ~$${(success * 0.04).toFixed(2)}`)
}

generate().catch(console.error)
