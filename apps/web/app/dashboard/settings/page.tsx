'use client'

import { useState } from 'react'
import { CovaCard } from '@/components/cova/CovaCard'
import { CovaButton } from '@/components/cova/CovaButton'
import { Switch } from '@/components/ui/switch'

const ROOM_TYPES = [
  { value: 'living_room', label: 'Living Room' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'dining_room', label: 'Dining Room' },
  { value: 'home_office', label: 'Home Office' },
  { value: 'bathroom', label: 'Bathroom' },
]

const BUDGET_TIERS = [
  { value: 'budget', label: 'Budget' },
  { value: 'mid', label: 'Mid-Range' },
  { value: 'premium', label: 'Premium' },
  { value: 'luxury', label: 'Luxury' },
]

export default function SettingsPage() {
  const [seasonAlerts, setSeasonAlerts] = useState(false)
  const [renderReady, setRenderReady] = useState(true)
  const [defaultRoomType, setDefaultRoomType] = useState('living_room')
  const [defaultBudget, setDefaultBudget] = useState('mid')
  const [saved, setSaved] = useState(false)

  function handleSave() {
    // Store defaults in localStorage — no backend needed for MVP
    try {
      localStorage.setItem(
        'cova_settings',
        JSON.stringify({ seasonAlerts, renderReady, defaultRoomType, defaultBudget })
      )
    } catch {
      // ignore
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      <h1 className="mb-6 font-serif text-3xl text-cova-ivory">Settings</h1>

      {/* Notifications */}
      <section className="mb-6">
        <h2 className="mb-4 text-lg font-semibold text-cova-ivory-dim">Notifications</h2>
        <CovaCard variant="default">
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-cova-ivory">Season Shift alerts</p>
                <p className="mt-0.5 text-xs text-cova-muted">
                  Get notified when trending styles shift seasonally
                </p>
              </div>
              <Switch
                checked={seasonAlerts}
                onCheckedChange={setSeasonAlerts}
                aria-label="Season Shift alerts"
              />
            </div>

            <div className="h-px bg-cova-border" />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-cova-ivory">New render ready</p>
                <p className="mt-0.5 text-xs text-cova-muted">
                  Get notified when your room redesign is complete
                </p>
              </div>
              <Switch
                checked={renderReady}
                onCheckedChange={setRenderReady}
                aria-label="New render ready"
              />
            </div>
          </div>
        </CovaCard>
      </section>

      {/* Defaults */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-cova-ivory-dim">Defaults</h2>
        <CovaCard variant="default">
          <div className="flex flex-col gap-6">
            {/* Default room type */}
            <div>
              <p className="mb-3 text-sm font-medium text-cova-ivory">Default room type</p>
              <div className="flex flex-wrap gap-2">
                {ROOM_TYPES.map((rt) => (
                  <button
                    key={rt.value}
                    onClick={() => setDefaultRoomType(rt.value)}
                    className={[
                      'rounded-full border px-3 py-1 text-xs transition-colors duration-150',
                      defaultRoomType === rt.value
                        ? 'border-cova-gold bg-cova-gold/10 text-cova-gold'
                        : 'border-cova-border text-cova-muted hover:border-cova-border-gold hover:text-cova-ivory',
                    ].join(' ')}
                  >
                    {rt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-cova-border" />

            {/* Default budget */}
            <div>
              <p className="mb-3 text-sm font-medium text-cova-ivory">Default budget</p>
              <div className="flex flex-wrap gap-2">
                {BUDGET_TIERS.map((bt) => (
                  <button
                    key={bt.value}
                    onClick={() => setDefaultBudget(bt.value)}
                    className={[
                      'rounded-full border px-3 py-1 text-xs transition-colors duration-150',
                      defaultBudget === bt.value
                        ? 'border-cova-gold bg-cova-gold/10 text-cova-gold'
                        : 'border-cova-border text-cova-muted hover:border-cova-border-gold hover:text-cova-ivory',
                    ].join(' ')}
                  >
                    {bt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CovaCard>
      </section>

      <CovaButton variant="primary" onClick={handleSave}>
        {saved ? 'Saved!' : 'Save Settings'}
      </CovaButton>
    </>
  )
}
