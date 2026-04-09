'use client'

import Link from 'next/link'
import { useState } from 'react'

type ActiveTab = 'account' | 'notifications' | 'style' | 'privacy'

interface NotificationState {
  designComplete: boolean
  priceDrop: boolean
  weeklyDigest: boolean
}

interface PrivacyState {
  analytics: boolean
  saveRoomData: boolean
  publicProfile: boolean
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('account')
  const [notifications, setNotifications] = useState<NotificationState>({
    designComplete: true,
    priceDrop: false,
    weeklyDigest: true,
  })
  const [privacy, setPrivacy] = useState<PrivacyState>({
    analytics: true,
    saveRoomData: true,
    publicProfile: false,
  })

  return (
    <div className="min-h-screen bg-cova-bg font-dm-sans flex flex-col">
      {/* Frosted glass top bar */}
      <nav
        className="sticky top-0 z-[50] h-14 flex items-center justify-between px-6 backdrop-blur-xl"
        style={{
          background: 'rgba(9,24,41,0.8)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(201,168,76,0.1)',
        }}
      >
        <span className="font-playfair italic text-xl text-cova-gold tracking-[0.05em]">
          Cova
        </span>
        <span className="font-dm-sans font-semibold text-[15px] text-cova-ivory">
          Settings
        </span>
        <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.1)]" />
      </nav>

      {/* Two-column layout */}
      <div className="flex flex-1 max-w-[1000px] mx-auto w-full px-6 py-10">
        {/* Left nav: 240px */}
        <nav className="w-60 shrink-0 mr-10">
          {(
            [
              { label: 'Account', key: 'account' },
              { label: 'Notifications', key: 'notifications' },
              { label: 'Style Profile', key: 'style' },
              { label: 'Privacy', key: 'privacy' },
            ] as { label: string; key: ActiveTab }[]
          ).map(({ label, key }) => {
            const isActive = activeTab === key
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className="block w-full text-left px-4 py-3 rounded-lg mb-1 border-none cursor-pointer font-dm-sans text-sm transition-all duration-200 ease-out"
                style={{
                  background: isActive ? 'rgba(201,168,76,0.08)' : 'transparent',
                  borderLeft: isActive ? '2px solid #C9A84C' : '2px solid transparent',
                  color: isActive ? '#C9A84C' : 'rgba(245,240,232,0.45)',
                }}
              >
                {label}
              </button>
            )
          })}
        </nav>

        {/* Right content panel */}
        <div className="flex-1 min-w-0">
          {/* Account tab */}
          {activeTab === 'account' && (
            <div>
              {/* Avatar */}
              <div className="flex items-center gap-4 mb-8">
                <div
                  className="w-[72px] h-[72px] rounded-full flex items-center justify-center cursor-pointer"
                  style={{
                    background: 'rgba(201,168,76,0.12)',
                    border: '1px solid rgba(201,168,76,0.35)',
                  }}
                >
                  <span className="text-cova-gold text-[11px] font-dm-sans">
                    PHOTO
                  </span>
                </div>
                <div>
                  <p className="font-dm-sans text-sm text-cova-ivory m-0">
                    Profile Photo
                  </p>
                  <p className="font-dm-sans text-xs text-cova-muted mt-1 mb-0">
                    Click to upload
                  </p>
                </div>
              </div>

              {/* Editable fields */}
              {['Full Name', 'Email'].map((field) => (
                <div key={field} className="mb-4">
                  <label
                    className="block font-dm-sans text-xs text-cova-muted mb-1.5 uppercase tracking-[0.08em]"
                  >
                    {field}
                  </label>
                  <input
                    type={field === 'Email' ? 'email' : 'text'}
                    placeholder={field}
                    className="w-full rounded-lg px-[14px] py-2.5 text-cova-ivory font-dm-sans text-[15px] outline-none box-border"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(201,168,76,0.15)',
                    }}
                  />
                </div>
              ))}

              {/* Connected accounts */}
              <div className="mt-8 mb-8">
                <p className="font-dm-sans text-xs text-cova-muted uppercase tracking-[0.08em] mb-3">
                  Connected Accounts
                </p>
                <div
                  className="rounded-xl px-4 py-3 flex items-center justify-between"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(201,168,76,0.15)',
                  }}
                >
                  <span className="font-dm-sans text-sm text-cova-ivory">
                    Google
                  </span>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-dm-sans"
                    style={{ background: 'rgba(111,207,151,0.12)', color: '#6FCF97' }}
                  >
                    Connected
                  </span>
                </div>
              </div>

              {/* Danger zone */}
              <div
                className="rounded-xl px-5 py-4"
                style={{ border: '1px solid rgba(232,112,112,0.3)' }}
              >
                <p
                  className="font-dm-sans text-sm mb-3"
                  style={{ color: '#E87070' }}
                >
                  Danger Zone
                </p>
                <button
                  className="rounded-lg px-4 py-2 bg-transparent font-dm-sans text-sm cursor-pointer"
                  style={{ border: '1px solid #E87070', color: '#E87070' }}
                >
                  Delete Account
                </button>
              </div>
            </div>
          )}

          {/* Notifications tab */}
          {activeTab === 'notifications' && (
            <div>
              {(
                [
                  { key: 'designComplete', label: 'New Design Complete', desc: 'When your AI redesign is ready' },
                  { key: 'priceDrop', label: 'Product Price Drop', desc: 'When a saved product drops in price' },
                  { key: 'weeklyDigest', label: 'Weekly Style Digest', desc: 'Curated inspiration every week' },
                ] as { key: keyof NotificationState; label: string; desc: string }[]
              ).map(({ key, label, desc }) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-4"
                  style={{ borderBottom: '1px solid rgba(201,168,76,0.08)' }}
                >
                  <div>
                    <p className="font-dm-sans text-[15px] text-cova-ivory m-0">
                      {label}
                    </p>
                    <p className="font-dm-sans text-[13px] text-cova-muted mt-0.5 mb-0">
                      {desc}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setNotifications((n) => ({ ...n, [key]: !n[key] }))
                    }
                    className="w-11 h-6 rounded-full border-none cursor-pointer relative shrink-0 transition-all duration-200 ease-out"
                    style={{
                      background: notifications[key] ? '#C9A84C' : 'rgba(255,255,255,0.1)',
                    }}
                  >
                    <span
                      className="absolute top-0.5 w-5 h-5 rounded-full transition-all duration-200 ease-out"
                      style={{
                        left: notifications[key] ? 22 : 2,
                        background: '#F5F0E8',
                      }}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Style Profile tab */}
          {activeTab === 'style' && (
            <div>
              <p className="font-dm-sans text-[13px] text-cova-muted uppercase tracking-[0.12em] mb-6">
                YOUR STYLE PROFILE
              </p>
              {/* Radar chart placeholder */}
              <div
                className="w-[280px] h-[280px] rounded-full flex items-center justify-center mb-6"
                style={{
                  border: '1px solid rgba(201,168,76,0.15)',
                  background: 'rgba(201,168,76,0.04)',
                }}
              >
                <span className="font-dm-sans text-xs text-cova-muted">
                  Radar Chart
                </span>
              </div>
              <div className="flex gap-2 mb-6">
                {['Warm & Restrained', 'Biophilic', 'Contemporary'].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-[14px] py-1.5 font-dm-sans text-xs text-cova-gold"
                    style={{ background: 'rgba(201,168,76,0.12)' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <Link
                href="/design/step-2"
                className="inline-block rounded-lg px-5 py-2.5 font-dm-sans text-sm text-cova-ivory no-underline"
                style={{ border: '1px solid rgba(201,168,76,0.35)' }}
              >
                Retake Style Quiz →
              </Link>
            </div>
          )}

          {/* Privacy tab */}
          {activeTab === 'privacy' && (
            <div>
              {(
                [
                  { key: 'analytics', label: 'Allow Analytics', desc: 'Help improve Cova with usage data' },
                  { key: 'saveRoomData', label: 'Save Room Data', desc: 'Store your room designs for future sessions' },
                  { key: 'publicProfile', label: 'Public Profile', desc: 'Let others see your style profile' },
                ] as { key: keyof PrivacyState; label: string; desc: string }[]
              ).map(({ key, label, desc }) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-4"
                  style={{ borderBottom: '1px solid rgba(201,168,76,0.08)' }}
                >
                  <div>
                    <p className="font-dm-sans text-[15px] text-cova-ivory m-0">
                      {label}
                    </p>
                    <p className="font-dm-sans text-[13px] text-cova-muted mt-0.5 mb-0">
                      {desc}
                    </p>
                  </div>
                  <button
                    onClick={() => setPrivacy((p) => ({ ...p, [key]: !p[key] }))}
                    className="w-11 h-6 rounded-full border-none cursor-pointer relative shrink-0 transition-all duration-200 ease-out"
                    style={{
                      background: privacy[key] ? '#C9A84C' : 'rgba(255,255,255,0.1)',
                    }}
                  >
                    <span
                      className="absolute top-0.5 w-5 h-5 rounded-full transition-all duration-200 ease-out"
                      style={{
                        left: privacy[key] ? 22 : 2,
                        background: '#F5F0E8',
                      }}
                    />
                  </button>
                </div>
              ))}
              <div
                className="mt-6 pt-6"
                style={{ borderTop: '1px solid rgba(201,168,76,0.08)' }}
              >
                <a
                  href="#"
                  className="block font-dm-sans text-sm text-cova-muted mb-3 no-underline"
                >
                  Download my data
                </a>
                <a
                  href="#"
                  className="block font-dm-sans text-sm no-underline"
                  style={{ color: '#E87070' }}
                >
                  Delete all my data
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
