'use client'

interface StepIndicatorProps {
  currentStep: number
  totalSteps: number
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  const percentage = (currentStep / totalSteps) * 100

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: 3,
        background: 'var(--cova-surface)',
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
  )
}
