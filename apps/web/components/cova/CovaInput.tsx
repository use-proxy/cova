'use client'

export interface CovaInputProps {
  label?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
  type?: string
  className?: string
}

export function CovaInput({
  label,
  placeholder,
  value,
  onChange,
  error,
  disabled = false,
  type = 'text',
  className = '',
}: CovaInputProps) {
  return (
    <div className={['flex flex-col w-full', className].filter(Boolean).join(' ')}>
      {label && (
        <label className="text-sm text-cova-muted mb-1.5 block">
          {label}
        </label>
      )}

      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={[
          'w-full bg-cova-surface border rounded-lg px-4 py-2.5',
          'text-cova-ivory placeholder:text-cova-muted',
          'font-sans text-base outline-none transition-all duration-150',
          error
            ? 'border-cova-error focus:border-cova-error focus:ring-1 focus:ring-cova-error'
            : 'border-cova-border focus:border-cova-border-gold focus:ring-1 focus:ring-[var(--cova-border-gold)]',
          disabled ? 'opacity-40 cursor-not-allowed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />

      {error && (
        <span className="text-xs text-cova-error mt-1.5">
          {error}
        </span>
      )}
    </div>
  )
}
