"use client";

/**
 * Design Philosophy: Cinematic modernism for a premium settings experience.
 * Use sculpted dark surfaces, brushed-gold accents, restrained serif hierarchy,
 * and precise motion so the screen feels like a luxury product cockpit.
 */
import "../../design/step-1/step1.css";
import "./settings.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChangeEvent, CSSProperties } from "react";
import {
  Bell,
  Check,
  ChevronRight,
  Fingerprint,
  Lock,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Upload,
  User,
  WandSparkles,
  X,
} from "lucide-react";

type ToastTone = "success" | "error";

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type NotificationKey =
  | "redesignReady"
  | "priceDropAlerts"
  | "styleTips"
  | "newCollectionAlerts"
  | "productRestocks"
  | "weeklyDigest";

type NotificationItem = {
  key: NotificationKey;
  title: string;
  description: string;
};

type ProfileState = {
  fullName: string;
  email: string;
  location: string;
  website: string;
};

const STYLE_AXES = [
  { name: "Modern", value: 82 },
  { name: "Organic", value: 74 },
  { name: "Minimal", value: 91 },
  { name: "Warmth", value: 68 },
  { name: "Texture", value: 63 },
  { name: "Contrast", value: 79 },
  { name: "Vintage", value: 42 },
  { name: "Boldness", value: 57 },
];

const RETAILERS = [
  "Wayfair",
  "West Elm",
  "RH",
  "IKEA",
  "CB2",
  "Amazon",
  "Article",
  "Serena & Lily",
  "Pottery Barn",
  "Crate & Barrel",
];

const NOTIFICATIONS: NotificationItem[] = [
  {
    key: "redesignReady",
    title: "Redesign ready",
    description: "When your room render is complete",
  },
  {
    key: "priceDropAlerts",
    title: "Price drop alerts",
    description: "When saved items go on sale",
  },
  {
    key: "styleTips",
    title: "Style tips",
    description: "Weekly personalized design ideas",
  },
  {
    key: "newCollectionAlerts",
    title: "New collection alerts",
    description: "From your preferred retailers",
  },
  {
    key: "productRestocks",
    title: "Product restocks",
    description: "When saved out-of-stock items return",
  },
  {
    key: "weeklyDigest",
    title: "Weekly digest",
    description: "Summary of your design activity",
  },
];

const INITIAL_PROFILE: ProfileState = {
  fullName: "Ariana Bennett",
  email: "ariana@cova.design",
  location: "Austin, United States",
  website: "https://arianabennett.studio",
};

const INITIAL_NOTIFICATIONS: Record<NotificationKey, boolean> = {
  redesignReady: true,
  priceDropAlerts: true,
  styleTips: false,
  newCollectionAlerts: true,
  productRestocks: true,
  weeklyDigest: false,
};

const INITIAL_BUDGET = [2000, 10000] as const;
const MIN_BUDGET = 500;
const MAX_BUDGET = 20000;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatCurrency(value: number, currency: "USD" | "EUR" | "GBP") {
  const locale = currency === "EUR" ? "de-DE" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function uid() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="settings-section-heading">
      <div className="settings-section-heading__row">
        <span className="settings-section-heading__icon">{icon}</span>
        <h2>{title}</h2>
      </div>
      <div className="settings-section-heading__line" />
    </div>
  );
}

function RadarChart({ active }: { active: boolean }) {
  const points = useMemo(() => {
    const radius = 84;
    const center = 100;
    return STYLE_AXES.map((axis, index) => {
      const angle = (Math.PI * 2 * index) / STYLE_AXES.length - Math.PI / 2;
      const pointRadius = (axis.value / 100) * radius;
      const x = center + Math.cos(angle) * pointRadius;
      const y = center + Math.sin(angle) * pointRadius;
      return `${x},${y}`;
    }).join(" ");
  }, []);

  return (
    <div className="settings-radar-shell">
      <svg
        viewBox="0 0 200 200"
        className={classNames("settings-radar", active && "is-active")}
      >
        {[100, 75, 50, 25].map((ring) => (
          <circle
            key={ring}
            cx="100"
            cy="100"
            r={ring * 0.84}
            fill="none"
            stroke="rgba(201,168,76,0.12)"
            strokeWidth="1"
          />
        ))}
        {STYLE_AXES.map((_, index) => {
          const angle = (Math.PI * 2 * index) / STYLE_AXES.length - Math.PI / 2;
          const x = 100 + Math.cos(angle) * 84;
          const y = 100 + Math.sin(angle) * 84;
          return (
            <line
              key={index}
              x1="100"
              y1="100"
              x2={x}
              y2={y}
              stroke="rgba(245,240,232,0.12)"
              strokeWidth="1"
            />
          );
        })}
        <polygon points={points} className="settings-radar__shape" />
        {STYLE_AXES.map((axis, index) => {
          const angle = (Math.PI * 2 * index) / STYLE_AXES.length - Math.PI / 2;
          const pointRadius = (axis.value / 100) * 84;
          const x = 100 + Math.cos(angle) * pointRadius;
          const y = 100 + Math.sin(angle) * pointRadius;
          return (
            <circle
              key={axis.name}
              cx={x}
              cy={y}
              r="3.5"
              className="settings-radar__dot"
            />
          );
        })}
      </svg>
    </div>
  );
}

function BudgetSlider({
  value,
  onChange,
}: {
  value: [number, number];
  onChange: (value: [number, number]) => void;
}) {
  const minPercent =
    ((value[0] - MIN_BUDGET) / (MAX_BUDGET - MIN_BUDGET)) * 100;
  const maxPercent =
    ((value[1] - MIN_BUDGET) / (MAX_BUDGET - MIN_BUDGET)) * 100;

  return (
    <div className="settings-budget-slider">
      <div className="settings-budget-slider__track" />
      <div
        className="settings-budget-slider__fill"
        style={{ left: `${minPercent}%`, width: `${maxPercent - minPercent}%` }}
      />
      <input
        aria-label="Minimum budget"
        type="range"
        min={MIN_BUDGET}
        max={MAX_BUDGET}
        step={250}
        value={value[0]}
        onChange={(event) => {
          const next = clamp(
            Number(event.target.value),
            MIN_BUDGET,
            value[1] - 500,
          );
          onChange([next, value[1]]);
        }}
      />
      <input
        aria-label="Maximum budget"
        type="range"
        min={MIN_BUDGET}
        max={MAX_BUDGET}
        step={250}
        value={value[1]}
        onChange={(event) => {
          const next = clamp(
            Number(event.target.value),
            value[0] + 500,
            MAX_BUDGET,
          );
          onChange([value[0], next]);
        }}
      />
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState(INITIAL_PROFILE);
  const [savedProfile, setSavedProfile] = useState(INITIAL_PROFILE);
  const [budget, setBudget] = useState<[number, number]>([...INITIAL_BUDGET]);
  const [savedBudget, setSavedBudget] = useState<[number, number]>([
    ...INITIAL_BUDGET,
  ]);
  const [selectedRetailers, setSelectedRetailers] = useState<string[]>([
    "West Elm",
    "CB2",
    "Article",
    "Serena & Lily",
  ]);
  const [savedRetailers, setSavedRetailers] = useState<string[]>([
    "West Elm",
    "CB2",
    "Article",
    "Serena & Lily",
  ]);
  const [currency, setCurrency] = useState<"USD" | "EUR" | "GBP">("USD");
  const [savedCurrency, setSavedCurrency] = useState<"USD" | "EUR" | "GBP">(
    "USD",
  );
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [radarVisible, setRadarVisible] = useState(false);
  const [isProUser] = useState(true);
  const radarRef = useRef<HTMLDivElement | null>(null);
  const autoSaveTimers = useRef<number[]>([]);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.body.classList.add("settings-page-body");
    const checkAuth = async () => {
      const { createBrowserClient } = await import('@/lib/supabase/client')
      const supabase = createBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      setAuthChecked(true)
    }
    checkAuth()
    return () => {
      document.body.classList.remove("settings-page-body");
    };
  }, [router]);

  useEffect(() => {
    if (!radarRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRadarVisible(true);
          }
        });
      },
      { threshold: 0.35 },
    );

    observer.observe(radarRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      autoSaveTimers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const hasUnsavedProfileChanges =
    JSON.stringify(profile) !== JSON.stringify(savedProfile) ||
    avatarPreview !== null;
  const hasUnsavedPreferenceChanges =
    JSON.stringify(budget) !== JSON.stringify(savedBudget) ||
    JSON.stringify(selectedRetailers) !== JSON.stringify(savedRetailers) ||
    currency !== savedCurrency;
  const hasUnsavedChanges =
    hasUnsavedProfileChanges || hasUnsavedPreferenceChanges;

  const pushToast = (message: string, tone: ToastTone = "success") => {
    const id = uid();
    setToasts((current) => [...current, { id, message, tone }]);
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2500);
    autoSaveTimers.current.push(timer);
  };

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const handleProfileField = (key: keyof ProfileState, value: string) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const handleAvatarUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      pushToast("Avatar must be a JPG, PNG, or WEBP file.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(
        typeof reader.result === "string" ? reader.result : null,
      );
      pushToast("Avatar ready to save.");
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = () => {
    setSavedProfile(profile);
    setProfileSaved(true);
    pushToast("Profile saved.");
    window.setTimeout(() => setProfileSaved(false), 2000);
  };

  const handleSavePreferences = () => {
    setSavedBudget(budget);
    setSavedRetailers(selectedRetailers);
    setSavedCurrency(currency);
    setPreferencesSaved(true);
    pushToast("Preferences saved.");
    window.setTimeout(() => setPreferencesSaved(false), 2000);
  };

  const handleSaveAll = () => {
    if (hasUnsavedProfileChanges) {
      setSavedProfile(profile);
    }
    if (hasUnsavedPreferenceChanges) {
      setSavedBudget(budget);
      setSavedRetailers(selectedRetailers);
      setSavedCurrency(currency);
    }
    pushToast("All changes saved.");
    setProfileSaved(false);
    setPreferencesSaved(false);
  };

  const handleDiscardAll = () => {
    setProfile(savedProfile);
    setBudget(savedBudget);
    setSelectedRetailers(savedRetailers);
    setCurrency(savedCurrency);
    setAvatarPreview(null);
    pushToast("Unsaved changes discarded.");
  };

  const handleToggleRetailer = (retailer: string) => {
    setSelectedRetailers((current) =>
      current.includes(retailer)
        ? current.filter((item) => item !== retailer)
        : [...current, retailer],
    );
  };

  const handleNotificationToggle = (key: NotificationKey) => {
    setNotifications((current) => {
      const next = { ...current, [key]: !current[key] };
      return next;
    });
    pushToast("Updated.");
  };

  const handleResetStyleProfile = () => {
    setShowResetConfirm(false);
    pushToast("Style profile reset.", "error");
  };

  const handleDeleteRooms = () => {
    pushToast("Room designs deleted.", "error");
  };

  const handleDisconnect = () => {
    pushToast("Google account disconnected.");
  };

  const handleDownloadData = () => {
    const payload = {
      profile,
      budget,
      retailers: selectedRetailers,
      currency,
      styleAxes: STYLE_AXES,
      notifications,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cova-data-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
    pushToast("Your data export has started.");
  };

  const handleConfirmDeleteAccount = () => {
    setIsDeletingAccount(true);
    window.setTimeout(async () => {
      const { createBrowserClient } = await import('@/lib/supabase/client')
      const supabase = createBrowserClient()
      await supabase.auth.signOut()
      setIsDeletingAccount(false);
      setShowDeleteModal(false);
      setDeleteConfirmText("");
      pushToast("Account deleted. Redirecting…", "error");
      window.setTimeout(() => {
        router.push("/");
      }, 800);
    }, 1400);
  };

  if (!authChecked) {
    return (
      <div className="settings-auth-state">
        <div className="settings-auth-state__card">
          <span className="settings-auth-state__eyebrow">Cova</span>
          <h1>Loading your settings…</h1>
          <p>Preparing your premium workspace and verifying your session.</p>
        </div>
      </div>
    );
  }

  const budgetLabel = `${formatCurrency(budget[0], currency)} – ${formatCurrency(budget[1], currency)}`;

  return (
    <div className="settings-shell">
      <aside className="settings-sidebar">
        <div className="settings-sidebar__brand">
          <div className="settings-sidebar__crest">C</div>
          <div>
            <span className="settings-sidebar__label">Cova</span>
            <p>Design intelligence</p>
          </div>
        </div>

        <nav
          className="settings-sidebar__nav"
          aria-label="Dashboard Navigation"
        >
          {[
            "Overview",
            "Rooms",
            "Saved Items",
            "Design Studio",
            "Subscription",
            "Settings",
          ].map((item) => (
            <button
              key={item}
              type="button"
              className={classNames(
                "settings-sidebar__link",
                item === "Settings" && "is-active",
              )}
            >
              <span>{item}</span>
              {item === "Settings" && (
                <div className="settings-sidebar__active-dot" />
              )}
            </button>
          ))}
        </nav>

        <div className="settings-sidebar__footer">
          <p>Premium tools for intentional interiors.</p>
        </div>
      </aside>

      <main className="settings-main">
        <div className="settings-content">
          <header
            className="settings-header reveal"
            style={{ ["--stagger" as keyof CSSProperties]: 0 } as CSSProperties}
          >
            <h1>Settings</h1>
            <p>Manage your Cova experience.</p>
            <div className="settings-header__line" />
          </header>

          <section
            className="settings-section reveal"
            style={{ ["--stagger" as keyof CSSProperties]: 1 } as CSSProperties}
          >
            <SectionHeader icon={<User size={18} />} title="Profile" />

            <div className="settings-avatar-row">
              <label className="settings-avatar" htmlFor="avatar-upload">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Profile preview" />
                ) : (
                  <span>AB</span>
                )}
                <div className="settings-avatar__overlay">Change</div>
              </label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="settings-hidden-input"
                onChange={handleAvatarUpload}
              />
              <div className="settings-avatar-copy">
                <button type="button" className="settings-ghost-inline">
                  <Upload size={14} />
                  Upload image
                </button>
                <p>Recommended: square, at least 200×200px</p>
              </div>
            </div>

            <div className="settings-field-grid">
              <div className="settings-field">
                <label htmlFor="full-name">Full Name</label>
                <input
                  id="full-name"
                  value={profile.fullName}
                  onChange={(event) =>
                    handleProfileField("fullName", event.target.value)
                  }
                  placeholder="Enter your full name"
                />
              </div>

              <div className="settings-field">
                <label htmlFor="email">Email</label>
                <div className="settings-readonly-wrap">
                  <input
                    id="email"
                    value={profile.email}
                    readOnly
                    aria-readonly="true"
                  />
                  <div className="settings-readonly-note">
                    <Lock size={12} />
                    Connected via Google
                  </div>
                </div>
              </div>

              <div className="settings-field">
                <label htmlFor="location">Location</label>
                <input
                  id="location"
                  value={profile.location}
                  onChange={(event) =>
                    handleProfileField("location", event.target.value)
                  }
                  placeholder="City, country"
                />
              </div>

              <div className="settings-field">
                <label htmlFor="website">Website / Portfolio</label>
                <input
                  id="website"
                  value={profile.website}
                  onChange={(event) =>
                    handleProfileField("website", event.target.value)
                  }
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="settings-section-actions">
              <button
                type="button"
                className="settings-gold-button"
                onClick={handleSaveProfile}
              >
                Save Profile
              </button>
              <span
                className={classNames(
                  "settings-inline-confirmation",
                  profileSaved && "is-visible",
                )}
              >
                ✦ Saved
              </span>
            </div>
          </section>

          <section
            className="settings-section reveal"
            style={{ ["--stagger" as keyof CSSProperties]: 2 } as CSSProperties}
          >
            <SectionHeader
              icon={<Fingerprint size={18} />}
              title="Style Profile"
            />

            <div className="settings-style-profile" ref={radarRef}>
              <RadarChart active={radarVisible} />

              <div className="settings-style-list">
                {STYLE_AXES.map((axis) => (
                  <div
                    key={axis.name}
                    className={classNames(
                      "settings-style-axis",
                      radarVisible && "is-active",
                    )}
                  >
                    <div className="settings-style-axis__header">
                      <span>{axis.name}</span>
                      <strong>{axis.value}%</strong>
                    </div>
                    <div className="settings-style-axis__track">
                      <div
                        style={{
                          width: radarVisible ? `${axis.value}%` : "0%",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="settings-meta-copy">Last updated: 3 days ago</p>

            <div className="settings-section-actions settings-section-actions--wrap">
              <button
                type="button"
                className="settings-ghost-button"
                onClick={() => router.push("/design/step-3")}
              >
                Retake Style Quiz <ChevronRight size={15} />
              </button>
              <button
                type="button"
                className="settings-ghost-button settings-ghost-button--danger-soft"
                onClick={() => setShowResetConfirm((current) => !current)}
              >
                Reset Style Profile
              </button>
            </div>

            <div
              className={classNames(
                "settings-inline-warning",
                showResetConfirm && "is-visible",
              )}
            >
              <p>This will erase your style data. Are you sure?</p>
              <div>
                <button
                  type="button"
                  className="settings-text-button settings-text-button--danger"
                  onClick={handleResetStyleProfile}
                >
                  Yes, reset
                </button>
                <button
                  type="button"
                  className="settings-text-button"
                  onClick={() => setShowResetConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </section>

          <section
            className="settings-section reveal"
            style={{ ["--stagger" as keyof CSSProperties]: 3 } as CSSProperties}
          >
            <SectionHeader
              icon={<SlidersHorizontal size={18} />}
              title="Budget Preferences"
            />

            <div className="settings-block">
              <label className="settings-block__label">
                Default redesign budget
              </label>
              <BudgetSlider value={budget} onChange={setBudget} />
              <div className="settings-budget-value">{budgetLabel}</div>
            </div>

            <div className="settings-block">
              <label className="settings-block__label">
                Shop from these retailers first
              </label>
              <div className="settings-pill-grid">
                {RETAILERS.map((retailer) => {
                  const active = selectedRetailers.includes(retailer);
                  return (
                    <button
                      key={retailer}
                      type="button"
                      className={classNames(
                        "settings-pill",
                        active && "is-active",
                      )}
                      onClick={() => handleToggleRetailer(retailer)}
                    >
                      {retailer}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="settings-block">
              <label className="settings-block__label">Currency</label>
              <div
                className="settings-segmented-control"
                role="tablist"
                aria-label="Currency selection"
              >
                {(["USD", "EUR", "GBP"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={classNames(
                      "settings-segmented-control__item",
                      currency === option && "is-active",
                    )}
                    onClick={() => setCurrency(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section-actions">
              <button
                type="button"
                className="settings-gold-button"
                onClick={handleSavePreferences}
              >
                Save Preferences
              </button>
              <span
                className={classNames(
                  "settings-inline-confirmation",
                  preferencesSaved && "is-visible",
                )}
              >
                ✦ Saved
              </span>
            </div>
          </section>

          <section
            className="settings-section reveal"
            style={{ ["--stagger" as keyof CSSProperties]: 4 } as CSSProperties}
          >
            <SectionHeader icon={<Bell size={18} />} title="Notifications" />

            <div className="settings-toggle-list">
              {NOTIFICATIONS.map((item) => {
                const checked = notifications[item.key];
                return (
                  <div key={item.key} className="settings-toggle-row">
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={checked}
                      className={classNames(
                        "settings-toggle",
                        checked && "is-on",
                      )}
                      onClick={() => handleNotificationToggle(item.key)}
                    >
                      <span />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            className="settings-section reveal"
            style={{ ["--stagger" as keyof CSSProperties]: 5 } as CSSProperties}
          >
            <SectionHeader icon={<Sparkles size={18} />} title="Subscription" />

            {isProUser ? (
              <div className="settings-plan-card settings-plan-card--pro">
                <div className="settings-plan-card__glow" />
                <div className="settings-plan-card__content">
                  <span className="settings-plan-badge">✦ Cova Pro</span>
                  <p>Renews January 15, 2027</p>
                  <ul>
                    {[
                      "Unlimited room designs",
                      "Unlimited re-renders",
                      "Priority AI processing",
                      "Early access to new features",
                      "Saved items sync across devices",
                    ].map((feature) => (
                      <li key={feature}>
                        <Check size={14} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="settings-ghost-button settings-ghost-button--wide"
                  >
                    Manage Billing <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="settings-plan-card settings-plan-card--free">
                <div className="settings-plan-card__content">
                  <h3>Upgrade to Pro</h3>
                  <p>$49/month · Cancel anytime</p>
                  <div className="settings-compare-grid">
                    <div>
                      <strong>Free</strong>
                      <span>Limited designs</span>
                      <span>Standard queue</span>
                    </div>
                    <div>
                      <strong>Pro</strong>
                      <span>Unlimited designs</span>
                      <span>Priority queue</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="settings-gold-button settings-gold-button--wide"
                  >
                    Upgrade Now <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </section>

          <section
            className="settings-section reveal"
            style={{ ["--stagger" as keyof CSSProperties]: 6 } as CSSProperties}
          >
            <SectionHeader icon={<Shield size={18} />} title="Privacy & Data" />

            <div className="settings-action-rows">
              <div className="settings-action-row">
                <div>
                  <h3>Download my data</h3>
                  <p>
                    Export all your rooms, saved items, and style data as a JSON
                    file.
                  </p>
                </div>
                <button
                  type="button"
                  className="settings-ghost-button"
                  onClick={handleDownloadData}
                >
                  Download <ChevronRight size={15} />
                </button>
              </div>

              <div className="settings-action-row">
                <div>
                  <h3>Delete all room designs</h3>
                  <p>
                    Permanently removes all rooms and renders. Saved products
                    are kept.
                  </p>
                </div>
                <button
                  type="button"
                  className="settings-ghost-button settings-ghost-button--danger"
                  onClick={handleDeleteRooms}
                >
                  Delete Rooms
                </button>
              </div>

              <div className="settings-action-row">
                <div>
                  <h3>Connected accounts</h3>
                  <p>Google account connected.</p>
                </div>
                <button
                  type="button"
                  className="settings-ghost-button settings-ghost-button--muted"
                  onClick={handleDisconnect}
                >
                  Disconnect
                </button>
              </div>
            </div>
          </section>

          <section
            className="settings-danger reveal"
            style={{ ["--stagger" as keyof CSSProperties]: 7 } as CSSProperties}
          >
            <div className="settings-danger__header">
              <h2>Danger Zone</h2>
            </div>
            <div className="settings-danger__content">
              <div>
                <h3>Delete Account</h3>
                <p>
                  Permanently delete your account and all associated data. This
                  cannot be undone.
                </p>
              </div>
              <button
                type="button"
                className="settings-danger-button"
                onClick={() => setShowDeleteModal(true)}
              >
                Delete My Account
              </button>
            </div>
          </section>
        </div>
      </main>

      <div
        className="settings-toast-stack"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={classNames(
              "settings-toast",
              toast.tone === "error" && "is-error",
            )}
          >
            <div className="settings-toast__content">
              <span className="settings-toast__sparkle">✦</span>
              <span>{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div
        className={classNames(
          "settings-save-bar",
          hasUnsavedChanges && "is-visible",
        )}
      >
        <p>You have unsaved changes</p>
        <div>
          <button
            type="button"
            className="settings-ghost-button settings-ghost-button--muted"
            onClick={handleDiscardAll}
          >
            Discard
          </button>
          <button
            type="button"
            className="settings-gold-button"
            onClick={handleSaveAll}
          >
            Save Changes <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <div
          className="settings-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div className="settings-modal">
            {isDeletingAccount ? (
              <div className="settings-modal__loading">
                <WandSparkles size={20} />
                <h2>Deleting your account...</h2>
                <p>
                  Please wait while we securely remove your data and sign you
                  out.
                </p>
              </div>
            ) : (
              <>
                <div className="settings-modal__header">
                  <span className="settings-modal__eyebrow">
                    Confirmation required
                  </span>
                  <h2 id="delete-account-title">Are you absolutely sure?</h2>
                  <p>Type DELETE to confirm this permanent action.</p>
                </div>
                <div className="settings-field settings-field--modal">
                  <label htmlFor="delete-confirm">Type DELETE to confirm</label>
                  <input
                    id="delete-confirm"
                    value={deleteConfirmText}
                    onChange={(event) =>
                      setDeleteConfirmText(event.target.value)
                    }
                    placeholder="DELETE"
                  />
                </div>
                <div className="settings-modal__actions">
                  <button
                    type="button"
                    className="settings-ghost-button settings-ghost-button--muted"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={classNames(
                      "settings-danger-button",
                      deleteConfirmText === "DELETE" && "is-enabled",
                    )}
                    disabled={deleteConfirmText !== "DELETE"}
                    onClick={handleConfirmDeleteAccount}
                  >
                    Confirm Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
