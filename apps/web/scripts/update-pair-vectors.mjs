import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// VERIFIED BY IMAGE AUDIT
// image_a = LOW value, image_b = HIGH value
// (confirm convention in Step 1 before running)

const VECTORS = {
  colorTemperature: {
    low:  {
      colorTemperature: 0.15,
      lightPreference:  0.65,
      density:          0.40,
      nature:           0.45,
      material:         0.35,
      texture:          0.35,
      colorSaturation:  0.40,
      formality:        0.60,
      era:              0.35,
      pattern:          0.40,
      lineQuality:      0.40,
      culturalInfluence:0.30,
    },
    high: {
      colorTemperature: 0.85,
      lightPreference:  0.75,
      density:          0.35,
      nature:           0.45,
      material:         0.65,
      texture:          0.55,
      colorSaturation:  0.50,
      formality:        0.40,
      era:              0.50,
      pattern:          0.30,
      lineQuality:      0.60,
      culturalInfluence:0.35,
    },
  },
  nature: {
    low:  {
      nature:           0.30,
      lightPreference:  0.80,
      colorTemperature: 0.25,
      material:         0.20,
      texture:          0.25,
      density:          0.25,
      colorSaturation:  0.35,
      formality:        0.55,
      era:              0.30,
      pattern:          0.30,
      lineQuality:      0.30,
      culturalInfluence:0.25,
    },
    high: {
      nature:           0.95,
      density:          0.80,
      colorTemperature: 0.65,
      material:         0.85,
      texture:          0.70,
      lightPreference:  0.55,
      colorSaturation:  0.50,
      pattern:          0.30,
      lineQuality:      0.70,
      formality:        0.20,
      era:              0.30,
      culturalInfluence:0.45,
    },
  },
  lightPreference: {
    low:  {
      lightPreference:  0.10,
      colorTemperature: 0.75,
      density:          0.55,
      texture:          0.60,
      nature:           0.35,
      colorSaturation:  0.50,
      formality:        0.55,
      material:         0.45,
      era:              0.45,
      pattern:          0.50,
      lineQuality:      0.45,
      culturalInfluence:0.40,
    },
    high: {
      lightPreference:  0.90,
      density:          0.20,
      colorTemperature: 0.55,
      nature:           0.35,
      material:         0.55,
      texture:          0.25,
      colorSaturation:  0.20,
      formality:        0.35,
      era:              0.25,
      pattern:          0.15,
      lineQuality:      0.50,
      culturalInfluence:0.20,
    },
  },
  density: {
    low:  {
      density:          0.05,
      lightPreference:  0.80,
      colorTemperature: 0.35,
      nature:           0.20,
      texture:          0.15,
      colorSaturation:  0.15,
      material:         0.30,
      formality:        0.55,
      era:              0.20,
      pattern:          0.10,
      lineQuality:      0.30,
      culturalInfluence:0.20,
    },
    high: {
      density:          0.90,
      nature:           0.65,
      colorTemperature: 0.65,
      texture:          0.75,
      colorSaturation:  0.65,
      pattern:          0.65,
      material:         0.60,
      lightPreference:  0.50,
      formality:        0.50,
      era:              0.55,
      lineQuality:      0.55,
      culturalInfluence:0.55,
    },
  },

  // CONSERVATIVE ESTIMATES — not image-verified
  // Secondary signals capped at 0.65 / floored at 0.35
  colorSaturation: {
    low:  {
      colorSaturation:  0.10,
      colorTemperature: 0.40,
      density:          0.25,
      pattern:          0.15,
      culturalInfluence:0.25,
      texture:          0.25,
      formality:        0.60,
      nature:           0.35,
      material:         0.40,
      lightPreference:  0.65,
      era:              0.30,
      lineQuality:      0.45,
    },
    high: {
      colorSaturation:  0.90,
      colorTemperature: 0.60,
      density:          0.65,
      pattern:          0.65,
      culturalInfluence:0.65,
      texture:          0.60,
      formality:        0.40,
      nature:           0.50,
      material:         0.50,
      lightPreference:  0.50,
      era:              0.50,
      lineQuality:      0.55,
    },
  },
  formality: {
    low:  {
      formality:        0.10,
      era:              0.30,
      density:          0.40,
      texture:          0.40,
      pattern:          0.30,
      material:         0.55,
      colorSaturation:  0.45,
      lineQuality:      0.65,
      colorTemperature: 0.55,
      lightPreference:  0.60,
      nature:           0.55,
      culturalInfluence:0.45,
    },
    high: {
      formality:        0.90,
      era:              0.70,
      density:          0.60,
      texture:          0.65,
      pattern:          0.60,
      material:         0.65,
      colorSaturation:  0.50,
      lineQuality:      0.30,
      colorTemperature: 0.55,
      lightPreference:  0.45,
      nature:           0.20,
      culturalInfluence:0.40,
    },
  },
  era: {
    low:  {
      era:              0.10,
      formality:        0.35,
      pattern:          0.20,
      texture:          0.30,
      density:          0.30,
      material:         0.35,
      colorTemperature: 0.40,
      colorSaturation:  0.35,
      lineQuality:      0.65,
      lightPreference:  0.65,
      nature:           0.40,
      culturalInfluence:0.30,
    },
    high: {
      era:              0.90,
      formality:        0.65,
      pattern:          0.65,
      texture:          0.60,
      density:          0.60,
      material:         0.60,
      colorTemperature: 0.55,
      colorSaturation:  0.45,
      lineQuality:      0.25,
      lightPreference:  0.45,
      nature:           0.20,
      culturalInfluence:0.40,
    },
  },
  material: {
    low:  {
      material:         0.10,
      nature:           0.15,
      texture:          0.25,
      colorTemperature: 0.30,
      lineQuality:      0.25,
      lightPreference:  0.55,
      density:          0.45,
      pattern:          0.40,
      colorSaturation:  0.40,
      formality:        0.60,
      era:              0.35,
      culturalInfluence:0.25,
    },
    high: {
      material:         0.90,
      nature:           0.65,
      texture:          0.65,
      colorTemperature: 0.65,
      lineQuality:      0.65,
      lightPreference:  0.60,
      density:          0.50,
      pattern:          0.35,
      colorSaturation:  0.45,
      formality:        0.35,
      era:              0.40,
      culturalInfluence:0.45,
    },
  },
  texture: {
    low:  {
      texture:          0.10,
      material:         0.30,
      density:          0.20,
      pattern:          0.15,
      colorTemperature: 0.35,
      nature:           0.20,
      culturalInfluence:0.20,
      formality:        0.55,
      colorSaturation:  0.20,
      lightPreference:  0.70,
      era:              0.20,
      lineQuality:      0.35,
    },
    high: {
      texture:          0.90,
      material:         0.65,
      density:          0.60,
      pattern:          0.55,
      colorTemperature: 0.60,
      nature:           0.55,
      culturalInfluence:0.50,
      formality:        0.45,
      colorSaturation:  0.55,
      lightPreference:  0.50,
      era:              0.50,
      lineQuality:      0.55,
    },
  },
  pattern: {
    low:  {
      pattern:          0.05,
      culturalInfluence:0.20,
      colorSaturation:  0.20,
      density:          0.20,
      texture:          0.20,
      formality:        0.55,
      era:              0.25,
      material:         0.35,
      colorTemperature: 0.40,
      nature:           0.30,
      lightPreference:  0.70,
      lineQuality:      0.35,
    },
    high: {
      pattern:          0.90,
      culturalInfluence:0.65,
      colorSaturation:  0.65,
      density:          0.65,
      texture:          0.60,
      formality:        0.45,
      era:              0.60,
      material:         0.50,
      colorTemperature: 0.55,
      nature:           0.45,
      lightPreference:  0.50,
      lineQuality:      0.50,
    },
  },
  lineQuality: {
    low:  {
      lineQuality:      0.10,
      material:         0.20,
      nature:           0.20,
      texture:          0.30,
      colorTemperature: 0.30,
      formality:        0.65,
      density:          0.55,
      pattern:          0.55,
      colorSaturation:  0.50,
      lightPreference:  0.40,
      era:              0.60,
      culturalInfluence:0.35,
    },
    high: {
      lineQuality:      0.90,
      material:         0.65,
      nature:           0.60,
      texture:          0.60,
      colorTemperature: 0.60,
      formality:        0.30,
      density:          0.50,
      pattern:          0.35,
      colorSaturation:  0.45,
      lightPreference:  0.60,
      era:              0.35,
      culturalInfluence:0.45,
    },
  },
  culturalInfluence: {
    low:  {
      culturalInfluence:0.10,
      pattern:          0.15,
      colorSaturation:  0.25,
      texture:          0.30,
      density:          0.30,
      colorTemperature: 0.40,
      material:         0.35,
      era:              0.30,
      formality:        0.55,
      nature:           0.30,
      lightPreference:  0.60,
      lineQuality:      0.40,
    },
    high: {
      culturalInfluence:0.90,
      pattern:          0.65,
      colorSaturation:  0.65,
      texture:          0.60,
      density:          0.60,
      colorTemperature: 0.60,
      material:         0.55,
      era:              0.55,
      formality:        0.40,
      nature:           0.50,
      lightPreference:  0.50,
      lineQuality:      0.50,
    },
  },
}

async function run() {
  // Step 1: confirm convention
  const { data: sample, error: sampleError } = await supabase
    .from('quiz_comparison_pairs')
    .select('id, dimension, image_a_vector, image_b_vector')
    .limit(3)

  if (sampleError) {
    console.error('Failed to fetch sample:', sampleError.message)
    process.exit(1)
  }

  const firstDim = sample[0].dimension
  const aVal = sample[0].image_a_vector[firstDim]
  const bVal = sample[0].image_b_vector[firstDim]
  const aIsLow = aVal < bVal
  console.log(`Convention: image_a = ${aIsLow ? 'LOW' : 'HIGH'} (${firstDim}: a=${aVal}, b=${bVal})`)

  // Step 2: fetch all pairs
  const { data: pairs, error: pairsError } = await supabase
    .from('quiz_comparison_pairs')
    .select('id, dimension')

  if (pairsError) {
    console.error('Failed to fetch pairs:', pairsError.message)
    process.exit(1)
  }

  console.log(`Updating ${pairs.length} pairs...`)

  let updated = 0
  let skipped = 0

  for (const pair of pairs) {
    const vecs = VECTORS[pair.dimension]
    if (!vecs) {
      console.warn('No vectors for:', pair.dimension)
      skipped++
      continue
    }

    const image_a_vector = aIsLow ? vecs.low : vecs.high
    const image_b_vector = aIsLow ? vecs.high : vecs.low

    const { error } = await supabase
      .from('quiz_comparison_pairs')
      .update({ image_a_vector, image_b_vector })
      .eq('id', pair.id)

    if (error) {
      console.error('Failed:', pair.id, error.message)
    } else {
      updated++
    }
  }

  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}`)

  // Step 3: verify sample
  const { data: verify } = await supabase
    .from('quiz_comparison_pairs')
    .select('dimension, image_a_vector, image_b_vector')
    .limit(4)

  verify.forEach(r => {
    const dim = r.dimension
    console.log(`${dim}: a[${dim}]=${r.image_a_vector[dim]} b[${dim}]=${r.image_b_vector[dim]}`)
    const secondaryKeys = Object.keys(r.image_a_vector).filter(k => k !== dim)
    const allSame = secondaryKeys.every(k => r.image_a_vector[k] === 0.5)
    console.log(`  secondary dims all 0.5? ${allSame} (should be false)`)
  })
}

run().catch(console.error)
