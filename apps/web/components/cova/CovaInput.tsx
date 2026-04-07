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
        <label
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-sm)',
            color: 'var(--cova-ivory-dim)',
            marginBottom: 6,
            display: 'block',
          }}
        >
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
          'font-sans text-base rounded-lg px-4 py-2.5 outline-none transition-all duration-200',
          'bg-cova-surface border text-cova-ivory placeholder:text-cova-subtle',
          error
            ? 'border-cova-error ring-2 ring-cova-error'
            : 'border-cova-border focus:ring-2 focus:ring-cova-gold focus:border-cova-border-gold',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />

      {error && (
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-xs)',
            color: 'var(--cova-error)',
            marginTop: 4,
          }}
        >
          {error}
        </span>
      )}
    </div>
  )
}
