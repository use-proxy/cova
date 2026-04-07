'use client'

import { useState } from 'react'
import { CovaButton } from '@/components/cova/CovaButton'
import { CovaCard } from '@/components/cova/CovaCard'
import { StepIndicator } from '@/components/cova/StepIndicator'
import { GoldDivider } from '@/components/cova/GoldDivider'
import { CovaInput } from '@/components/cova/CovaInput'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 56 }}>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-xs)',
          letterSpacing: '0.12em',
          color: 'var(--cova-muted)',
          textTransform: 'uppercase',
          marginBottom: 20,
        }}
      >
        {title}
      </p>
      {children}
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 16,
      }}
    >
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        color: 'var(--cova-subtle)',
        display: 'block',
        marginTop: 8,
      }}
    >
      {children}
    </span>
  )
}

export default function DesignSystemShowcase() {
  const [inputValue, setInputValue] = useState('')
  const [errorValue, setErrorValue] = useState('invalid@')
  const [step, setStep] = useState(3)

  return (
    <div
      style={{
        background: 'var(--cova-bg)',
        minHeight: '100vh',
        padding: '80px 32px 80px',
        maxWidth: 900,
        margin: '0 auto',
      }}
    >
      {/* Step indicator at top */}
      <StepIndicator currentStep={step} totalSteps={10} />

      {/* Page header */}
      <h1
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'var(--text-4xl)',
          color: 'var(--cova-ivory)',
          marginBottom: 8,
        }}
      >
        Cova Design System
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-base)',
          color: 'var(--cova-muted)',
          marginBottom: 48,
        }}
      >
        Component Reference
      </p>

      <GoldDivider label="Components" />
      <div style={{ marginBottom: 48 }} />

      {/* ── CovaButton ─────────────────────────────────────── */}
      <Section title="CovaButton">
        <Row>
          <div>
            <CovaButton variant="primary" size="md">Primary</CovaButton>
            <Label>primary / md</Label>
          </div>
          <div>
            <CovaButton variant="primary" size="sm">Small</CovaButton>
            <Label>primary / sm</Label>
          </div>
          <div>
            <CovaButton variant="primary" size="lg">Large</CovaButton>
            <Label>primary / lg</Label>
          </div>
          <div>
            <CovaButton variant="primary" size="md" disabled>Disabled</CovaButton>
            <Label>disabled</Label>
          </div>
          <div>
            <CovaButton variant="primary" size="md" loading>Loading</CovaButton>
            <Label>loading</Label>
          </div>
        </Row>

        <div style={{ marginTop: 24 }}>
          <Row>
            <div>
              <CovaButton variant="ghost" size="md">Ghost</CovaButton>
              <Label>ghost / md</Label>
            </div>
            <div>
              <CovaButton variant="ghost" size="sm">Ghost sm</CovaButton>
              <Label>ghost / sm</Label>
            </div>
            <div>
              <CovaButton variant="ghost" size="lg">Ghost lg</CovaButton>
              <Label>ghost / lg</Label>
            </div>
            <div>
              <CovaButton variant="destructive" size="md">Delete Room</CovaButton>
              <Label>destructive</Label>
            </div>
            <div>
              <CovaButton variant="icon" size="md">✦</CovaButton>
              <Label>icon</Label>
            </div>
          </Row>
        </div>
      </Section>

      <GoldDivider />
      <div style={{ marginBottom: 48 }} />

      {/* ── CovaCard ───────────────────────────────────────── */}
      <Section title="CovaCard">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div>
            <CovaCard variant="default">
              <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--cova-ivory)', marginBottom: 4 }}>
                Default card
              </p>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--cova-muted)' }}>
                Standard surface with border
              </p>
            </CovaCard>
            <Label>default</Label>
          </div>

          <div>
            <CovaCard variant="elevated">
              <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--cova-ivory)', marginBottom: 4 }}>
                Elevated card
              </p>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--cova-muted)' }}>
                Gold glow shadow beneath
              </p>
            </CovaCard>
            <Label>elevated</Label>
          </div>

          <div>
            <CovaCard variant="interactive" onClick={() => {}}>
              <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--cova-ivory)', marginBottom: 4 }}>
                Interactive card
              </p>
              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--cova-muted)' }}>
                Hover for gold border
              </p>
            </CovaCard>
            <Label>interactive (hover me)</Label>
          </div>
        </div>
      </Section>

      <GoldDivider />
      <div style={{ marginBottom: 48 }} />

      {/* ── StepIndicator ──────────────────────────────────── */}
      <Section title="StepIndicator">
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--cova-muted)', marginBottom: 16 }}>
          The gold progress bar is fixed to the top of this page (showing Step {step} of 10).
        </p>
        <Row>
          <CovaButton variant="ghost" size="sm" onClick={() => setStep(Math.max(1, step - 1))}>
            ← Prev
          </CovaButton>
          <span style={{ fontFamily: 'var(--font-sans)', color: 'var(--cova-ivory)' }}>
            Step {step} / 10
          </span>
          <CovaButton variant="ghost" size="sm" onClick={() => setStep(Math.min(10, step + 1))}>
            Next →
          </CovaButton>
        </Row>
      </Section>

      <GoldDivider />
      <div style={{ marginBottom: 48 }} />

      {/* ── GoldDivider ────────────────────────────────────── */}
      <Section title="GoldDivider">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <GoldDivider />
            <Label>no label</Label>
          </div>
          <div>
            <GoldDivider label="Section Title" />
            <Label>with label</Label>
          </div>
          <div>
            <GoldDivider label="Design" />
            <Label>short label</Label>
          </div>
        </div>
      </Section>

      <GoldDivider />
      <div style={{ marginBottom: 48 }} />

      {/* ── CovaInput ──────────────────────────────────────── */}
      <Section title="CovaInput">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 400 }}>
          <div>
            <CovaInput
              label="Room name"
              placeholder="e.g. Living room"
              value={inputValue}
              onChange={setInputValue}
            />
            <Label>default (click to see gold focus ring)</Label>
          </div>

          <div>
            <CovaInput
              label="Email address"
              placeholder="hello@example.com"
              value={errorValue}
              onChange={setErrorValue}
              error="Please enter a valid email address"
              type="email"
            />
            <Label>error state</Label>
          </div>

          <div>
            <CovaInput
              label="Disabled field"
              placeholder="Cannot edit"
              value="Locked value"
              onChange={() => {}}
              disabled
            />
            <Label>disabled</Label>
          </div>
        </div>
      </Section>

      <GoldDivider label="End of reference" />
    </div>
  )
}
