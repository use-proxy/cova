"use client";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps?: number;
}

export function StepIndicator({
  currentStep,
  totalSteps = 9,
}: StepIndicatorProps) {
  const percentage = (currentStep / totalSteps) * 100;

  return (
    <div className="w-full">
      {/* Gold progress bar */}
      <div className="w-full h-[3px] bg-cova-surface-2">
        <div
          className="h-full bg-cova-gold transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {/* Step label — right-aligned */}
      <p className="text-xs text-cova-muted text-right pr-4 mt-1">
        Step {currentStep} of {totalSteps}
      </p>
    </div>
  );
}
