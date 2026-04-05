'use client'

import { Loader2 } from 'lucide-react'

export interface CovaButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'destructive' | 'icon'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
  children: React.ReactNode
  className?: string
}

const SIZE_STYLES: Record<NonNullable<CovaButtonProps['size']>, React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: 'var(--text-sm)', borderRadius: 6 },
  md: { padding: '10px 20px', fontSize: 'var(--text-base)', borderRadius: 8 },
  lg: { padding: '14px 24px', fontSize: 'var(--text-lg)', borderRadius: 12 },
}

const VARIANT_BASE: Record<NonNullable<CovaButtonProps['variant']>, React.CSSProperties> = {
  primary: {
    background: 'var(--cova-gold)',
    color: 'var(--cova-bg)',
    border: 'none',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--cova-ivory)',
    border: '1px solid var(--cova-border-gold)',
  },
  destructive: {
    background: 'var(--cova-error)',
    color: 'var(--cova-ivory)',
    border: 'none',
  },
  icon: {
    background: 'transparent',
    color: 'var(--cova-ivory)',
    border: '1px solid var(--cova-border)',
    aspectRatio: '1',
    padding: '10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}

export function CovaButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  children,
  className,
  disabled,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: CovaButtonProps) {
  const isDisabled = disabled || loading

  const baseStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    letterSpacing: '0.02em',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'all 150ms ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: fullWidth ? '100%' : undefined,
    outline: 'none',
    ...(variant === 'primary' && isDisabled
      ? {
          background: 'var(--cova-gold-dim)',
          opacity: 0.6,
        }
      : {}),
    ...(variant === 'ghost' && isDisabled ? { opacity: 0.4 } : {}),
    ...VARIANT_BASE[variant],
    ...SIZE_STYLES[size],
    ...style,
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isDisabled) {
      if (variant === 'primary') {
        e.currentTarget.style.background = 'var(--cova-gold-light)'
      } else if (variant === 'ghost') {
        e.currentTarget.style.background = 'var(--cova-surface-3)'
      } else if (variant === 'destructive') {
        e.currentTarget.style.opacity = '0.85'
      } else if (variant === 'icon') {
        e.currentTarget.style.borderColor = 'var(--cova-border-gold)'
        e.currentTarget.style.color = 'var(--cova-gold)'
      }
    }
    onMouseEnter?.(e)
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!isDisabled) {
      if (variant === 'primary') {
        e.currentTarget.style.background = 'var(--cova-gold)'
      } else if (variant === 'ghost') {
        e.currentTarget.style.background = 'transparent'
      } else if (variant === 'destructive') {
        e.currentTarget.style.opacity = '1'
      } else if (variant === 'icon') {
        e.currentTarget.style.borderColor = 'var(--cova-border)'
        e.currentTarget.style.color = 'var(--cova-ivory)'
      }
    }
    onMouseLeave?.(e)
  }

  return (
    <button
      {...rest}
      disabled={isDisabled}
      className={className}
      style={baseStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {loading ? (
        <Loader2
          size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16}
          className="animate-spin"
        />
      ) : (
        children
      )}
    </button>
  )
}
