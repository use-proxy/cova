'use client'

interface StepIndicatorProps {
  currentStep: number
  totalSteps?: number
}

export function StepIndicator({ currentStep, totalSteps = 10 }: StepIndicatorProps) {
  const percentage = (currentStep / totalSteps) * 100

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
      }}
    >
      {/* Progress bar */}
      <div
        style={{
          height: 3,
          background: 'var(--cova-surface-2)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percentage}%`,
            background: 'var(--cova-gold)',
            transition: 'width 400ms ease',
            boxShadow: '0 0 8px var(--cova-gold-glow)',
          }}
        />
      </div>

      {/* Step label */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          paddingTop: 6,
          paddingBottom: 2,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.08em',
            color: 'var(--cova-muted)',
          }}
        >
          Step {currentStep} of {totalSteps}
        </span>
      </div>
    </div>
  )
}
