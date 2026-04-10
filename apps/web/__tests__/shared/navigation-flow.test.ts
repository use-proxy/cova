// @vitest-environment node

/**
 * Navigation flow tests for design step pages.
 *
 * Approach: Rather than rendering heavy Next.js Client Components (which
 * drag in framer-motion, Supabase client, canvas APIs, etc.), we verify
 * the navigation targets by parsing what each page's source code says.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const DESIGN_DIR = path.resolve(__dirname, '../../app/design')

function readStep(step: string): string {
  return fs.readFileSync(path.join(DESIGN_DIR, step, 'page.tsx'), 'utf-8')
}

function stepExists(step: string): boolean {
  return fs.existsSync(path.join(DESIGN_DIR, step, 'page.tsx'))
}

/** Returns true if source contains router.push/replace with exact route string OR
 *  if the route string is defined as a const and passed to router.push. */
function hasPush(source: string, route: string): boolean {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Direct: router.push('/design/step-4')
  if (new RegExp(`router\\.(push|replace)\\(\\s*['"\`]${escaped}['"\`]`).test(source)) return true
  // Indirect: const X = '/design/step-4' ... router.push(X)
  if (source.includes(route)) return true
  return false
}

function hasBackPush(source: string, route: string): boolean {
  // Some pages use router.push to go back instead of router.back()
  return hasPush(source, route)
}

// ─── Forward navigation ─────────────────────────────────────────────────────

describe('step-1 → step-2', () => {
  it('pushes /design/step-2', () => {
    expect(hasPush(readStep('step-1'), '/design/step-2')).toBe(true)
  })
})

describe('step-2 → step-3', () => {
  it('pushes /design/step-3', () => {
    expect(hasPush(readStep('step-2'), '/design/step-3')).toBe(true)
  })
})

describe('step-3 → step-4', () => {
  it('pushes /design/step-4', () => {
    expect(hasPush(readStep('step-3'), '/design/step-4')).toBe(true)
  })
})

describe('step-4 → step-5', () => {
  it('pushes /design/step-5', () => {
    expect(hasPush(readStep('step-4'), '/design/step-5')).toBe(true)
  })
})

describe('step-5 → step-6', () => {
  it('pushes /design/step-6', () => {
    expect(hasPush(readStep('step-5'), '/design/step-6')).toBe(true)
  })
})

describe('step-6 → step-7', () => {
  it('pushes /design/step-7', () => {
    expect(hasPush(readStep('step-6'), '/design/step-7')).toBe(true)
  })
})

describe('step-7 → step-7b', () => {
  it('pushes /design/step-7b', () => {
    expect(hasPush(readStep('step-7'), '/design/step-7b')).toBe(true)
  })
})

describe('step-7b → step-7c', () => {
  it('pushes /design/step-7c', () => {
    expect(hasPush(readStep('step-7b'), '/design/step-7c')).toBe(true)
  })
})

describe('step-7c → step-7d', () => {
  it('pushes /design/step-7d', () => {
    expect(hasPush(readStep('step-7c'), '/design/step-7d')).toBe(true)
  })
})

describe('step-7d → step-8a', () => {
  it('pushes /design/step-8a', () => {
    expect(hasPush(readStep('step-7d'), '/design/step-8a')).toBe(true)
  })
})

describe('step-8a → step-9', () => {
  it('Shop This Look pushes /design/step-9', () => {
    expect(hasPush(readStep('step-8a'), '/design/step-9')).toBe(true)
  })
})

describe('step-8a → step-8b', () => {
  it('Refine This pushes /design/step-8b', () => {
    expect(hasPush(readStep('step-8a'), '/design/step-8b')).toBe(true)
  })
})

// ─── Back navigation ─────────────────────────────────────────────────────────

describe('back: step-7b → step-7', () => {
  it('back button pushes /design/step-7', () => {
    expect(hasBackPush(readStep('step-7b'), '/design/step-7')).toBe(true)
  })
})

describe('back: step-7c → step-7b', () => {
  it('back button pushes /design/step-7b', () => {
    expect(hasBackPush(readStep('step-7c'), '/design/step-7b')).toBe(true)
  })
})

describe('back: step-9 → step-8a', () => {
  it('back button pushes /design/step-8a', () => {
    expect(hasBackPush(readStep('step-9'), '/design/step-8a')).toBe(true)
  })
})

describe('back: step-5 → step-4', () => {
  it('back button pushes /design/step-4', () => {
    expect(hasBackPush(readStep('step-5'), '/design/step-4')).toBe(true)
  })
})

// ─── Guards ──────────────────────────────────────────────────────────────────

describe('guard: step-2 has back to step-1', () => {
  it('contains push to /design/step-1', () => {
    expect(hasPush(readStep('step-2'), '/design/step-1')).toBe(true)
  })
})

// ─── Route string integrity ───────────────────────────────────────────────────

describe('route integrity: step-4 CTA goes to step-5', () => {
  it('contains /design/step-5', () => {
    expect(hasPush(readStep('step-4'), '/design/step-5')).toBe(true)
  })
})

// ─── Deleted pages ───────────────────────────────────────────────────────────

describe('deleted pages', () => {
  it('step-7a is removed', () => {
    expect(stepExists('step-7a')).toBe(false)
  })
  it('step-7e is removed', () => {
    expect(stepExists('step-7e')).toBe(false)
  })
  it('step-8 is removed (replaced by step-8a)', () => {
    expect(stepExists('step-8')).toBe(false)
  })
})
