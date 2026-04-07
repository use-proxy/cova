'use client'

import { CovaButton } from '@/components/cova/CovaButton'

export function DeleteAccountButton() {
  return (
    <CovaButton
      variant="destructive"
      size="sm"
      onClick={() => {
        alert('To delete your account, contact support at hello@covainterior.com')
      }}
    >
      Delete Account
    </CovaButton>
  )
}
