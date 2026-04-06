#!/usr/bin/env tsx
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// ─── Arg parsing ─────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (flag: string): string | undefined => {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}
const hasFlag = (flag: string): boolean => args.includes(flag)

// ─── Required args ────────────────────────────────────────────
const photo = getArg('--photo')
if (!photo) {
  console.error('❌ --photo required')
  process.exit(1)
}

// ─── Import the real functions ────────────────────────────────
import { detectFurniture, detectArchitecture, type Detection } from '@/lib/ai/grounding'

// ─── Test ─────────────────────────────────────────────────────
async function main() {
  console.log(`\nTesting detection...`)
  console.log(`Input: ${photo}\n`)

  let furniture: Detection[] = []
  let architecture: Detection[] = []

  try {
    furniture = await detectFurniture(photo)
  } catch (err) {
    console.error('❌ FAIL — furniture detection threw error:', err)
    process.exit(1)
  }

  try {
    architecture = await detectArchitecture(photo)
  } catch (err) {
    console.error('❌ FAIL — architecture detection threw error:', err)
    process.exit(1)
  }

  const allDetections = [...furniture, ...architecture]

  // ─── Validate ───────────────────────────────────────────────
  const checks: Array<{ name: string; pass: boolean; detail: string }> = []

  // Check minimum count
  checks.push({
    name: 'Minimum detections',
    pass: allDetections.length >= 3,
    detail: `Got ${allDetections.length} items (${furniture.length} furniture, ${architecture.length} architecture)`,
  })

  // Check each detection has required fields
  let allHaveRequiredFields = true
  for (const d of allDetections) {
    if (
      typeof d.type !== 'string' ||
      typeof d.label !== 'string' ||
      typeof d.confidence !== 'number' ||
      !Array.isArray(d.bbox) ||
      d.bbox.length !== 4
    ) {
      allHaveRequiredFields = false
      break
    }
    // Verify confidence is 0-1
    if (d.confidence < 0 || d.confidence > 1) {
      allHaveRequiredFields = false
      break
    }
    // Verify bbox values are normalized fractions 0-1
    for (const val of d.bbox) {
      if (typeof val !== 'number' || val < 0 || val > 1) {
        allHaveRequiredFields = false
        break
      }
    }
  }

  checks.push({
    name: 'Detection schema',
    pass: allHaveRequiredFields,
    detail: 'Each detection has type, label, confidence (0-1), bbox ([x,y,w,h] as fractions)',
  })

  // ─── Report ─────────────────────────────────────────────────
  let allPassed = true
  for (const check of checks) {
    const icon = check.pass ? '✅' : '❌'
    console.log(`${icon} ${check.name}: ${check.detail}`)
    if (!check.pass) allPassed = false
  }

  if (hasFlag('--verbose')) {
    console.log('\nDetailed results:')
    for (const d of allDetections) {
      const bbox = `[${d.bbox.map((v) => v.toFixed(2)).join(', ')}]`
      console.log(
        `  ✓ [${d.type}] ${d.label} (confidence: ${d.confidence.toFixed(2)}) bbox: ${bbox}`
      )
    }
    console.log(`\nSummary: Detected ${allDetections.length} items (${furniture.length} furniture, ${architecture.length} architecture)`)
  }

  console.log(`\n${allPassed ? '✅ PASS' : '❌ FAIL'}`)
  process.exit(allPassed ? 0 : 1)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
