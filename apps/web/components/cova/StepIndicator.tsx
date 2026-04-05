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
        background: '#0F1F3D',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${percentage}%`,
          background: '#C9A84C',
          transition: 'width 400ms ease',
          boxShadow: '0 0 8px rgba(201,168,76,0.5)',
        }}
      />
    </div>
  )
}
