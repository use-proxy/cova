'use client';

import '../step-1/step1.css';
import './step7c.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Decision = 'keep' | 'remove' | null;

type RoomItem = {
  id: number;
  name: string;
  category: string;
  decision: Decision;
  position: {
    x: number;
    y: number;
  };
  highlight: {
    left: string;
    top: string;
    width: string;
    height: string;
  };
};

const DEFAULT_ROOM_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1100">
      <defs>
        <linearGradient id="wall" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#d7c4a8"/>
          <stop offset="100%" stop-color="#b79d7d"/>
        </linearGradient>
        <linearGradient id="floor" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#6f553f"/>
          <stop offset="100%" stop-color="#4d392a"/>
        </linearGradient>
        <filter id="blurShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="18"/>
        </filter>
      </defs>
      <rect width="1600" height="720" fill="url(#wall)"/>
      <polygon points="0,700 1600,620 1600,1100 0,1100" fill="url(#floor)"/>
      <rect x="70" y="120" width="400" height="350" rx="20" fill="#d9cfbe" stroke="#a98b5d" stroke-width="12"/>
      <rect x="990" y="100" width="470" height="360" rx="20" fill="#d4cab8" stroke="#a98b5d" stroke-width="12"/>
      <rect x="1075" y="190" width="110" height="210" fill="#c9bea9"/>
      <rect x="1265" y="190" width="110" height="210" fill="#c9bea9"/>
      <ellipse cx="785" cy="885" rx="330" ry="110" fill="#2f2a27" opacity="0.26" filter="url(#blurShadow)"/>
      <ellipse cx="1130" cy="842" rx="165" ry="75" fill="#2f2a27" opacity="0.24" filter="url(#blurShadow)"/>
      <ellipse cx="420" cy="810" rx="190" ry="70" fill="#2f2a27" opacity="0.18" filter="url(#blurShadow)"/>
      <rect x="485" y="545" width="590" height="240" rx="44" fill="#eadfcd"/>
      <rect x="420" y="592" width="150" height="146" rx="34" fill="#f0e7d8"/>
      <rect x="980" y="592" width="150" height="146" rx="34" fill="#f0e7d8"/>
      <rect x="445" y="665" width="660" height="65" rx="26" fill="#d5c5af"/>
      <rect x="548" y="490" width="450" height="110" rx="42" fill="#e6dac7"/>
      <rect x="620" y="690" width="110" height="170" rx="18" fill="#4c3327"/>
      <rect x="826" y="690" width="110" height="170" rx="18" fill="#4c3327"/>
      <rect x="590" y="860" width="380" height="28" rx="10" fill="#3a271f"/>
      <rect x="1025" y="705" width="225" height="125" rx="20" fill="#8a6546"/>
      <rect x="1038" y="680" width="200" height="48" rx="18" fill="#a97f56"/>
      <rect x="1110" y="610" width="54" height="85" rx="18" fill="#c4b297"/>
      <rect x="250" y="670" width="170" height="130" rx="24" fill="#a77b50"/>
      <rect x="272" y="642" width="126" height="42" rx="16" fill="#c59b69"/>
      <rect x="118" y="590" width="110" height="210" rx="18" fill="#8e6a4d"/>
      <rect x="136" y="560" width="74" height="38" rx="12" fill="#be9763"/>
      <rect x="1330" y="725" width="90" height="175" rx="16" fill="#27211f"/>
      <circle cx="1375" cy="690" r="42" fill="#f5e7b7" opacity="0.9"/>
      <path d="M0 0h1600v1100H0z" fill="#3d2b1f" opacity="0.12"/>
    </svg>
  `);

const DEFAULT_ITEMS: RoomItem[] = [
  {
    id: 1,
    name: 'Main Sofa',
    category: 'Seating',
    decision: 'keep',
    position: { x: 47, y: 56 },
    highlight: { left: '30%', top: '42%', width: '42%', height: '31%' },
  },
  {
    id: 2,
    name: 'Coffee Table',
    category: 'Surface',
    decision: 'keep',
    position: { x: 48, y: 72 },
    highlight: { left: '40%', top: '66%', width: '23%', height: '17%' },
  },
  {
    id: 3,
    name: 'Accent Chair',
    category: 'Seating',
    decision: null,
    position: { x: 70, y: 61 },
    highlight: { left: '65%', top: '53%', width: '20%', height: '20%' },
  },
  {
    id: 4,
    name: 'Side Cabinet',
    category: 'Storage',
    decision: 'remove',
    position: { x: 20, y: 62 },
    highlight: { left: '14%', top: '57%', width: '15%', height: '20%' },
  },
  {
    id: 5,
    name: 'Floor Lamp',
    category: 'Lighting',
    decision: 'keep',
    position: { x: 84, y: 67 },
    highlight: { left: '79%', top: '59%', width: '11%', height: '24%' },
  },
  {
    id: 6,
    name: 'Console Table',
    category: 'Storage',
    decision: null,
    position: { x: 19, y: 39 },
    highlight: { left: '7%', top: '51%', width: '17%', height: '12%' },
  },
  {
    id: 7,
    name: 'Curtain Set',
    category: 'Window Treatment',
    decision: null,
    position: { x: 17, y: 25 },
    highlight: { left: '4%', top: '6%', width: '28%', height: '38%' },
  },
  {
    id: 8,
    name: 'Wall Art',
    category: 'Decor',
    decision: 'remove',
    position: { x: 57, y: 24 },
    highlight: { left: '44%', top: '15%', width: '20%', height: '10%' },
  },
  {
    id: 9,
    name: 'Area Rug',
    category: 'Textile',
    decision: 'keep',
    position: { x: 50, y: 84 },
    highlight: { left: '29%', top: '68%', width: '44%', height: '22%' },
  },
  {
    id: 10,
    name: 'Window Bench',
    category: 'Seating',
    decision: null,
    position: { x: 74, y: 31 },
    highlight: { left: '66%', top: '17%', width: '26%', height: '20%' },
  },
  {
    id: 11,
    name: 'Throw Pillows',
    category: 'Textile',
    decision: null,
    position: { x: 59, y: 52 },
    highlight: { left: '42%', top: '47%', width: '19%', height: '13%' },
  },
  {
    id: 12,
    name: 'Planter',
    category: 'Decor',
    decision: 'remove',
    position: { x: 10, y: 71 },
    highlight: { left: '7%', top: '67%', width: '8%', height: '13%' },
  },
  {
    id: 13,
    name: 'Media Console',
    category: 'Storage',
    decision: null,
    position: { x: 73, y: 76 },
    highlight: { left: '64%', top: '71%', width: '21%', height: '12%' },
  },
  {
    id: 14,
    name: 'Pendant Light',
    category: 'Lighting',
    decision: 'keep',
    position: { x: 86, y: 15 },
    highlight: { left: '79%', top: '6%', width: '13%', height: '14%' },
  },
];

function CheckIcon() {
  return (
    <svg className="step7c-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5 6.2 11.7 13 4.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="step7c-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4 12 12M12 4 4 12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export default function Step7cKeepOrRemove() {
  const router = useRouter();
  const roomImageSrc = DEFAULT_ROOM_IMAGE;
  const [items, setItems] = useState<RoomItem[]>(DEFAULT_ITEMS);
  const [activeItemId, setActiveItemId] = useState<number>(DEFAULT_ITEMS[0]?.id ?? 1);
  const [flashAction, setFlashAction] = useState<'keepAll' | 'startFresh' | null>(null);
  const [displayedDecidedCount, setDisplayedDecidedCount] = useState(0);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  /* ---- Auth gate + load pre-detection results from Supabase ---- */
  useEffect(() => {
    const loadData = async () => {
      const { createBrowserClient } = await import('@/lib/supabase/client');
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth?next=/design/step-7c'); return; }

      // Find the most recent room for this user
      const { data: rooms } = await supabase
        .from('rooms')
        .select('id, pre_detection_result, photo_url')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const room = rooms?.[0];
      if (room?.pre_detection_result && Array.isArray(room.pre_detection_result) && room.pre_detection_result.length > 0) {
        const detected = room.pre_detection_result as Array<{
          label: string; category: string; azimuth_degrees: number;
          elevation_degrees: number; is_fixed: boolean; confidence: number;
        }>;
        const mapped: RoomItem[] = detected.map((d, i) => ({
          id: i + 1,
          name: d.label.replace(/\b\w/g, c => c.toUpperCase()),
          category: d.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          decision: d.is_fixed ? 'keep' as Decision : null,
          position: {
            x: Math.round(50 + (d.azimuth_degrees / 90) * 40),
            y: Math.round(50 + (d.elevation_degrees / 60) * 30),
          },
          highlight: {
            left: `${Math.max(5, Math.min(80, 50 + (d.azimuth_degrees / 90) * 40 - 8))}%`,
            top: `${Math.max(5, Math.min(80, 50 + (d.elevation_degrees / 60) * 30 - 8))}%`,
            width: '16%',
            height: '16%',
          },
        }));
        setItems(mapped);
        setActiveItemId(mapped[0]?.id ?? 1);
      }
    };
    loadData();
  }, [router]);

  const decidedCount = useMemo(() => items.filter((item) => item.decision !== null).length, [items]);
  const keepCount = useMemo(() => items.filter((item) => item.decision === 'keep').length, [items]);
  const removeCount = useMemo(() => items.filter((item) => item.decision === 'remove').length, [items]);
  const allDecided = decidedCount === items.length;

  useEffect(() => {
    const totalFrames = 18;
    const startValue = displayedDecidedCount;
    const difference = decidedCount - startValue;

    if (difference === 0) {
      return;
    }

    let frame = 0;
    const interval = window.setInterval(() => {
      frame += 1;
      const nextValue = Math.round(startValue + (difference * frame) / totalFrames);
      setDisplayedDecidedCount(nextValue);

      if (frame >= totalFrames) {
        window.clearInterval(interval);
        setDisplayedDecidedCount(decidedCount);
      }
    }, 20);

    return () => window.clearInterval(interval);
  }, [decidedCount]);

  const setDecision = (id: number, decision: Exclude<Decision, null>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, decision } : item)),
    );
    setActiveItemId(id);
  };

  const flash = (name: 'keepAll' | 'startFresh') => {
    setFlashAction(name);
    window.setTimeout(() => {
      setFlashAction((current) => (current === name ? null : current));
    }, 420);
  };

  const handleKeepAll = () => {
    setItems((current) => current.map((item) => ({ ...item, decision: 'keep' })));
    flash('keepAll');
  };

  const handleStartFresh = () => {
    setItems((current) => current.map((item) => ({ ...item, decision: 'remove' })));
    flash('startFresh');
  };

  const handleBadgeSelect = (id: number) => {
    setActiveItemId(id);
    cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleContinue = async () => {
    if (!allDecided) return;

    // Persist keep/remove decisions to Supabase
    try {
      const { createBrowserClient } = await import('@/lib/supabase/client');
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: rooms } = await supabase
          .from('rooms')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);
        const roomId = rooms?.[0]?.id;
        if (roomId) {
          const decisions = items.map(item => ({
            id: item.id,
            name: item.name,
            category: item.category,
            decision: item.decision,
          }));
          await supabase
            .from('rooms')
            .update({ keep_remove_decisions: decisions })
            .eq('id', roomId);
        }
      }
    } catch (err) {
      console.warn('[step-7c] Failed to persist decisions:', err);
    }

    router.push('/design/step-7d');
  };

  return (
    <main className="step7c-page">
      <nav className="step7c-topbar" aria-label="Step navigation">
        <a
          className="step7c-nav-link"
          href="/design/step-7b"
          onClick={(event) => {
            event.preventDefault();
            router.push('/design/step-7b');
          }}
        >
          <span aria-hidden="true">&larr;</span>
          <span>Back</span>
        </a>
        <button
          type="button"
          className="step7c-brand"
          onClick={() => router.push('/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          Cova
        </button>
        <div className="step7c-step">3 of 5</div>
      </nav>

      <div className="step7c-shell">
        <section className="step7c-grid" aria-label="Keep or remove room items">
          <div className="step7c-room">
            <div className="step7c-room-frame">
              <img className="step7c-room-photo" src={roomImageSrc} alt="Scanned room with detected furniture items" />
              <div className="step7c-room-overlay" />
              <div className="step7c-room-scan" />

              {items.map((item, index) => {
                const isVisible = activeItemId === item.id;

                return (
                  <div key={item.id}>
                    <div
                      className={`step7c-item-highlight${isVisible ? ' is-visible' : ''}`}
                      style={item.highlight}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      className={`step7c-badge${isVisible ? ' is-active' : ''}`}
                      style={{ left: `${item.position.x}%`, top: `${item.position.y}%`, animationDelay: `${index * 90}ms` }}
                      onMouseEnter={() => setActiveItemId(item.id)}
                      onFocus={() => setActiveItemId(item.id)}
                      onClick={() => handleBadgeSelect(item.id)}
                      aria-label={`Select ${item.name}`}
                    >
                      {item.id}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="step7c-panel">
            <div className="step7c-panel-header">
              <div>
                <h1 className="step7c-heading">What stays in your new room?</h1>
                <p className="step7c-subtext">Only items you keep will be worked around.</p>
              </div>
              <div className="step7c-progress-pill" aria-live="polite">
                {displayedDecidedCount} of {items.length} decided
              </div>
            </div>

            <div className="step7c-quick-actions">
              <button
                type="button"
                className={`step7c-ghost-action${flashAction === 'keepAll' ? ' is-flashing' : ''}`}
                onClick={handleKeepAll}
              >
                Keep All
              </button>
              <button
                type="button"
                className={`step7c-ghost-action${flashAction === 'startFresh' ? ' is-flashing' : ''}`}
                onClick={handleStartFresh}
              >
                Start Fresh
              </button>
            </div>

            <div className="step7c-list" role="list" aria-label="Detected furniture items">
              {items.map((item) => {
                const isKeep = item.decision === 'keep';
                const isRemove = item.decision === 'remove';
                const isFocused = activeItemId === item.id;

                return (
                  <div
                    key={item.id}
                    ref={(element) => {
                      cardRefs.current[item.id] = element;
                    }}
                    className={`step7c-card${isFocused ? ' is-focused' : ''}${isKeep ? ' is-keep' : ''}${isRemove ? ' is-remove' : ''}`}
                    role="listitem"
                    onMouseEnter={() => setActiveItemId(item.id)}
                  >
                    <div className="step7c-card-main">
                      <div className="step7c-card-badge">{item.id}</div>
                      <div className="step7c-card-copy">
                        <h2 className="step7c-card-title">{item.name}</h2>
                        <div className="step7c-card-category">{item.category}</div>
                      </div>
                    </div>

                    <div className="step7c-actions">
                      <button
                        type="button"
                        className={`step7c-choice step7c-choice--keep${isKeep ? ' is-selected' : ''}`}
                        onClick={() => setDecision(item.id, 'keep')}
                        aria-pressed={isKeep}
                      >
                        <CheckIcon />
                        <span>KEEP</span>
                      </button>
                      <button
                        type="button"
                        className={`step7c-choice step7c-choice--remove${isRemove ? ' is-selected' : ''}`}
                        onClick={() => setDecision(item.id, 'remove')}
                        aria-pressed={isRemove}
                      >
                        <CloseIcon />
                        <span>REMOVE</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </section>
      </div>

      <div className="step7c-bottombar">
        <div className="step7c-summary">
          <strong>{keepCount}</strong> items keeping <span aria-hidden="true">/</span>{' '}
          <strong>{removeCount}</strong> items removing
        </div>
        <button
          type="button"
          className={`step7c-cta${allDecided ? ' is-ready' : ''}`}
          disabled={!allDecided}
          onClick={handleContinue}
        >
          Lock In My Choices &rarr;
        </button>
      </div>
    </main>
  );
}
