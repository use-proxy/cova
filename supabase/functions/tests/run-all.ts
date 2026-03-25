/**
 * Cova Master Test Runner
 * File: supabase/functions/tests/run-all.ts
 *
 * Run: npx ts-node supabase/functions/tests/run-all.ts
 * Exit 0 = ALL PASS | Exit 1 = ANY FAIL
 *
 * Runs all 5 test suites sequentially and reports a summary.
 */

import { execSync } from 'child_process'
import * as path from 'path'

const TESTS_DIR = __dirname

interface SuiteResult {
  name: string
  file: string
  passed: boolean
  output: string
  durationMs: number
}

const SUITES = [
  { name: 'Style Quiz',       file: 'style-quiz.test.ts' },
  { name: 'Room Capture',     file: 'room-capture.test.ts' },
  { name: 'Render View',      file: 'render-view.test.ts' },
  { name: 'CLIP Matching',    file: 'clip-matching.test.ts' },
  { name: 'Chat',             file: 'chat.test.ts' },
  { name: 'Render Pipeline',  file: 'render-pipeline.test.ts' },
  { name: 'Panorama Render',  file: 'panorama-render.test.ts' },
]

console.log('\n' + '═'.repeat(60))
console.log('  Cova Automated Test Suite — Master Runner')
console.log('═'.repeat(60))
console.log(`\n  Running ${SUITES.length} test suite(s)...\n`)

const results: SuiteResult[] = []

for (const suite of SUITES) {
  const filePath = path.join(TESTS_DIR, suite.file)
  const start = Date.now()

  process.stdout.write(`  ▶ ${suite.name.padEnd(20)}`)

  try {
    const output = execSync(`npx ts-node "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    })
    const durationMs = Date.now() - start
    console.log(`PASS  (${durationMs}ms)`)
    results.push({ name: suite.name, file: suite.file, passed: true, output, durationMs })
  } catch (err: any) {
    const durationMs = Date.now() - start
    const output = (err.stdout ?? '') + (err.stderr ?? '')
    console.log(`FAIL  (${durationMs}ms)`)
    results.push({ name: suite.name, file: suite.file, passed: false, output, durationMs })
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

const totalPassed  = results.filter(r => r.passed).length
const totalFailed  = results.filter(r => !r.passed).length
const totalSuites  = results.length
const totalTimeMs  = results.reduce((sum, r) => sum + r.durationMs, 0)

console.log('\n' + '─'.repeat(60))
console.log(`\n  Results: ${totalPassed}/${totalSuites} suites passed  (${totalTimeMs}ms total)\n`)

if (totalFailed > 0) {
  console.log('  Failed suites:\n')
  results
    .filter(r => !r.passed)
    .forEach(r => {
      console.log(`  ✗ ${r.name} (${r.file})`)
      // Print last 20 lines of output for the failed suite
      const lines = r.output.trim().split('\n')
      const tail = lines.slice(-20)
      tail.forEach(line => console.log(`    ${line}`))
      console.log()
    })

  console.log('═'.repeat(60))
  console.log('  STATUS: FAIL\n')
  process.exit(1)
} else {
  console.log('  All suites:')
  results.forEach(r => {
    console.log(`  ✓ ${r.name.padEnd(20)} ${r.durationMs}ms`)
  })
  console.log('\n' + '═'.repeat(60))
  console.log('  STATUS: PASS — all Cova tests passed.\n')
  process.exit(0)
}
