'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFingerprintStore } from '@/lib/store/fingerprint';
import '../step-1/step1.css';
import './step2.css';

type StyleCard = {
  id: string;
  dbId: string;
  label: string;
  image: string;
};

type FetchedAnchorCard = {
  id: string;
  room_images: Record<string, string> | null;
};

const STYLES: StyleCard[] = [
  {
    id: 'japandi',
    dbId: '16989535-60e8-429a-bdf3-344b3e753bbc',
    label: 'Warm Japandi',
    image: 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/anchors/1-warm-japandi.webp',
  },
  {
    id: 'modern-luxe',
    dbId: 'ddd966a3-fa8c-4e1c-a463-d0d5e6149ea5',
    label: 'Dark Moody Glam',
    image: 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/anchors/2-dark-moody-glam.webp',
  },
  {
    id: 'coastal',
    dbId: '158b0361-e738-499e-88a9-b2663dfd78c9',
    label: 'Coastal Bright',
    image: 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/anchors/3-coastal-bright.webp',
  },
  {
    id: 'industrial',
    dbId: 'd96b7dcc-1af0-47c9-bd51-52eabe8e80f9',
    label: 'Industrial Loft',
    image: 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/anchors/4-industrial-loft.webp',
  },
  {
    id: 'maximalist',
    dbId: '39ee6902-ea23-4510-a215-ab844ff60ebf',
    label: 'Maximalist Eclectic',
    image: 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/anchors/5-maximalist-eclectic.webp',
  },
  {
    id: 'art-deco',
    dbId: '59ed05f8-d478-4e46-8b70-f4a4157c2713',
    label: 'Heritage Traditional',
    image: 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/anchors/6-heritage-traditional.webp',
  },
  {
    id: 'scandinavian',
    dbId: 'd47f61e9-51fc-4c77-a027-3dadf20f2f4a',
    label: 'Pure Minimal White',
    image: 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/anchors/7-pure-minimal-white.webp',
  },
  {
    id: 'bohemian',
    dbId: '0ec5d295-2680-4497-8c91-4f20243ef907',
    label: 'Biophilic Jungle',
    image: 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/anchors/8-biophilic-jungle.webp',
  },
  {
    id: 'mid-century',
    dbId: '80572b6a-9506-4a03-80da-8ff738af2276',
    label: 'Retro Mid-Century',
    image: 'https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/public/quiz-images/anchors/9-retro-mid-century.webp',
  },
];

const ROOM_TYPES: { id: string; label: string }[] = [
  { id: 'living_room', label: 'Living Room' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'dining_room', label: 'Dining Room' },
  { id: 'home_office', label: 'Home Office' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bathroom', label: 'Bathroom' },
];

export default function CovaStyleSelectionPage() {
  const router = useRouter();
  const roomType = useFingerprintStore((s) => s.roomType);
  const [phase, setPhase] = useState<'room' | 'anchors'>(roomType ? 'anchors' : 'room');
  const [selected, setSelected] = useState<string[]>([]);
  const [burstCard, setBurstCard] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 50, y: 28 });
  const [roomImageMap, setRoomImageMap] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    const checkAuth = async () => {
      const { createBrowserClient } = await import('@/lib/supabase/client');
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push('/auth?next=/design/step-2');
    };
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch('/api/quiz/next-card')
      .then((res) => res.json() as Promise<{ cards: FetchedAnchorCard[] }>)
      .then((json) => {
        const map: Record<string, Record<string, string>> = {};
        for (const card of json.cards ?? []) {
          if (card.room_images) map[card.id] = card.room_images;
        }
        setRoomImageMap(map);
      })
      .catch(() => { /* fall back to static images */ });
  }, []);

  const progressWidth = useMemo(() => {
    const base = 26;
    const bonus = selected.length * 16;
    return `${Math.min(base + bonus, 58)}%`;
  }, [selected.length]);

  const toggleSelection = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      const next = current.length < 2 ? [...current, id] : [current[1], id];

      if (next.length === 2) {
        setBurstCard(id);
        window.setTimeout(() => setBurstCard((active) => (active === id ? null : active)), 650);
      }

      return next;
    });
  };

  const handleContinue = () => {
    if (selected.length === 2) {
      // Sync selections to fingerprint store (cookie-persisted, survives OAuth redirects)
      const fpStore = useFingerprintStore.getState()
      // Clear any previous phase-A selections before adding new ones
      fpStore.phaseASelections.forEach((id) => fpStore.removePhaseASelection(id))
      selected.forEach((id) => {
        const style = STYLES.find((s) => s.id === id)
        if (style) fpStore.addPhaseASelection(style.dbId)
      })
      router.push('/design/step-3');
    }
  };

  return (
    <main
      className="cova-page"
      onMouseMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / bounds.width) * 100;
        const y = ((event.clientY - bounds.top) / bounds.height) * 100;
        setPointer({ x, y });
      }}
    >
      <div className="cova-ambient-layer" />
      <div
        className="cova-pointer-glow"
        style={{
          background: `radial-gradient(circle at ${pointer.x}% ${pointer.y}%, rgba(201,168,76,0.16), rgba(201,168,76,0.06) 22%, rgba(9,24,41,0) 54%)`,
        }}
      />
      <div className="cova-grid-overlay" />
      <div className="cova-noise-overlay" />

      <section className="cova-shell">
        <header className="cova-header">
          <button
            type="button"
            className="cova-icon-button"
            aria-label="Go back"
            onClick={() => {
              if (phase === 'anchors') {
                setPhase('room');
              } else {
                router.push('/design/step-1');
              }
            }}
          >
            <span aria-hidden="true">‹</span>
          </button>

          <div className="cova-header-center">
            <button
              type="button"
              className="cova-wordmark"
              onClick={() => router.push('/')}
              aria-label="Cova home"
            >
              Cova
            </button>
            <div className="cova-progress-rail">
              <div className="cova-progress-fill" style={{ width: progressWidth }} />
            </div>
          </div>

          <div className="cova-step-meta">
            <span>Step 1 of 4</span>
            <span>Style quiz phase</span>
          </div>
        </header>

        {phase === 'room' && (
          <>
            <section className="cova-hero">
              <p className="cova-eyebrow">Before We Begin</p>
              <h1>Which room are we designing?</h1>
              <p className="cova-subtext">Pick one to get started.</p>
            </section>
            <section
              className="cova-grid"
              aria-label="Room type selection"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                padding: '1.5rem',
                maxWidth: '900px',
                margin: '0 auto',
              }}
            >
              {ROOM_TYPES.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => {
                    useFingerprintStore.getState().setRoomType(room.id);
                    setPhase('anchors');
                  }}
                  style={{
                    padding: '2rem 1rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(225, 201, 132, 0.22)',
                    background: 'rgba(17, 35, 55, 0.54)',
                    color: '#f4efe6',
                    fontSize: '1.1rem',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    transition: 'all 200ms ease-out',
                  }}
                >
                  {room.label}
                </button>
              ))}
            </section>
          </>
        )}

        {phase === 'anchors' && (
          <>
            <section className="cova-hero">
              <p className="cova-eyebrow">Your Style Anchors</p>
              <h1>What draws you in?</h1>
              <p className="cova-subtext">Choose 2 spaces that feel like home. We&apos;ll do the rest.</p>
            </section>

            <section className="cova-grid" aria-label="Interior design style selection">
              {STYLES.map((style, index) => {
                const isSelected = selected.includes(style.id);
                const isBursting = burstCard === style.id;

                return (
                  <button
                    key={style.id}
                    type="button"
                    className={`cova-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => toggleSelection(style.id)}
                    aria-pressed={isSelected}
                    aria-label={style.label}
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <div
                      className="cova-card-image"
                      style={{
                        backgroundImage: `linear-gradient(180deg, rgba(9,24,41,0.1), rgba(9,24,41,0.42)), url(${(roomType && roomImageMap[style.dbId]?.[roomType]) ?? style.image})`,
                      }}
                    />

                    <div className="cova-card-shimmer" />

                    {isSelected ? (
                      <div className="cova-check" aria-hidden="true">
                        ✦
                      </div>
                    ) : null}

                    {isBursting ? (
                      <div className="cova-burst" aria-hidden="true">
                        {Array.from({ length: 10 }).map((_, particleIndex) => (
                          <span
                            key={particleIndex}
                            style={{
                              ['--angle' as string]: `${particleIndex * 36}deg`,
                              ['--distance' as string]: `${38 + (particleIndex % 3) * 12}px`,
                            }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </section>

            <footer className="cova-footer-panel">
              <div className="cova-selection-copy">
                <span className={selected.length === 2 ? 'is-complete' : ''}>
                  {selected.length} of 2 selected
                </span>
              </div>

              <button
                type="button"
                className={`cova-cta ${selected.length === 2 ? 'is-ready' : ''}`}
                disabled={selected.length !== 2}
                onClick={handleContinue}
              >
                See Your Matches →
              </button>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}
