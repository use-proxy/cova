"use client";

import {
  CSSProperties,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flowLog } from "@/lib/debug/flow-logger";
import { useRouter, usePathname } from "next/navigation";
import "../design/step-1/step1.css";
import "./dashboard.css";

/**
 * Design philosophy: Quiet Technological Luxury.
 * This screen should feel like a private interior-design studio tool—warm, editorial,
 * spatially calm, and precise. Favor soft depth, luminous gold hierarchy, and restrained motion.
 * When editing this file, ask: does this choice reinforce or dilute our design philosophy?
 */

type NavItem = {
  label: string;
  path: string;
  icon: (active?: boolean) => ReactNode;
};

type Room = {
  name: string;
  date: string;
  image: string;
  tags: string[];
};

type Product = {
  brand: string;
  name: string;
  price: string;
  image: string;
};

type ActivityItem = {
  description: string;
  timestamp: string;
};

type StyleAxis = {
  label: string;
  value: number;
};

const roomData: Room[] = [
  {
    name: "Living Room Redesign",
    date: "Updated Apr 9, 2026",
    image:
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663531103545/JqDpbFayUFWegZg6NrL5w9/cova-living-room-editorial-cdoHdzfVKvxQym2xZMXEPp.webp",
    tags: ["Quiet Luxury", "Organic", "Editorial"],
  },
  {
    name: "Primary Bedroom Study",
    date: "Updated Apr 7, 2026",
    image:
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663531103545/JqDpbFayUFWegZg6NrL5w9/cova-bedroom-editorial-do2LUUG6t9FCsApbZW8H6a.webp",
    tags: ["Warmth", "Soft Forms", "Calm"],
  },
  {
    name: "Dining Room Curation",
    date: "Updated Apr 3, 2026",
    image:
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663531103545/JqDpbFayUFWegZg6NrL5w9/cova-dining-room-editorial-QZ4KqoVKyJakFdraAUFAXs.webp",
    tags: ["Sculptural", "Natural", "Refined"],
  },
];

const productData: Product[] = [
  {
    brand: "FLOS",
    name: "Arco Floor Lamp",
    price: "$3,200",
    image:
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663531103545/JqDpbFayUFWegZg6NrL5w9/cova-product-lamp-ECdS8kRg6L3kd7PZpzujwM.webp",
  },
  {
    brand: "COVA EDIT",
    name: "Bouclé Swivel Lounge Chair",
    price: "$1,850",
    image:
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663531103545/JqDpbFayUFWegZg6NrL5w9/cova-product-chair-EXVuNLeqbfNvv5N2NcGGid.webp",
  },
];

const activityData: ActivityItem[] = [
  {
    description: "Saved Restoration Hardware Cloud Sofa",
    timestamp: "2 hours ago",
  },
  { description: "Completed Living Room redesign", timestamp: "Yesterday" },
  { description: "Retook style quiz", timestamp: "3 days ago" },
  { description: "Saved Flos Arco Floor Lamp", timestamp: "3 days ago" },
  { description: "Started Bedroom redesign", timestamp: "1 week ago" },
];

const styleAxes: StyleAxis[] = [
  { label: "Calm", value: 82 },
  { label: "Warmth", value: 76 },
  { label: "Texture", value: 68 },
  { label: "Drama", value: 45 },
  { label: "Nature", value: 71 },
  { label: "Luxury", value: 88 },
  { label: "Playfulness", value: 34 },
  { label: "Vintage", value: 52 },
];

function useAnimatedCounter(
  target: number,
  duration: number,
  enabled: boolean,
) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [duration, enabled, target]);

  return value;
}

function getGreeting(date: Date) {
  const hour = date.getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function drawRadarChart(canvas: HTMLCanvasElement, progress: number) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const width = 300;
  const height = 300;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 96;
  const levels = 4;
  const angleStep = (Math.PI * 2) / styleAxes.length;

  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(0.5, 0.5);

  context.strokeStyle = "rgba(201, 168, 76, 0.08)";
  context.lineWidth = 1;

  for (let level = 1; level <= levels; level += 1) {
    const levelRadius = (radius / levels) * level;
    context.beginPath();

    styleAxes.forEach((_, index) => {
      const angle = -Math.PI / 2 + angleStep * index;
      const x = centerX + Math.cos(angle) * levelRadius;
      const y = centerY + Math.sin(angle) * levelRadius;

      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });

    context.closePath();
    context.stroke();
  }

  styleAxes.forEach((axis, index) => {
    const angle = -Math.PI / 2 + angleStep * index;
    const axisX = centerX + Math.cos(angle) * radius;
    const axisY = centerY + Math.sin(angle) * radius;

    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(axisX, axisY);
    context.stroke();

    const labelRadius = radius + 28;
    const labelX = centerX + Math.cos(angle) * labelRadius;
    const labelY = centerY + Math.sin(angle) * labelRadius;

    context.font = "500 11px 'DM Sans', sans-serif";
    context.fillStyle = "rgba(245, 240, 232, 0.45)";
    context.textAlign =
      labelX >= centerX + 8
        ? "left"
        : labelX <= centerX - 8
          ? "right"
          : "center";
    context.textBaseline =
      labelY >= centerY + 8
        ? "top"
        : labelY <= centerY - 8
          ? "bottom"
          : "middle";
    context.fillText(axis.label, labelX, labelY);
  });

  context.beginPath();
  styleAxes.forEach((axis, index) => {
    const angle = -Math.PI / 2 + angleStep * index;
    const pointRadius = radius * (axis.value / 100) * progress;
    const x = centerX + Math.cos(angle) * pointRadius;
    const y = centerY + Math.sin(angle) * pointRadius;

    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });

  context.closePath();
  context.fillStyle = "rgba(201, 168, 76, 0.15)";
  context.fill();
  context.strokeStyle = "rgba(201, 168, 76, 0.96)";
  context.lineWidth = 2;
  context.stroke();

  styleAxes.forEach((axis, index) => {
    const threshold = index / styleAxes.length;
    const dotProgress = Math.max(
      0,
      Math.min((progress - threshold) * styleAxes.length, 1),
    );
    if (dotProgress <= 0) return;

    const angle = -Math.PI / 2 + angleStep * index;
    const pointRadius = radius * (axis.value / 100) * progress;
    const x = centerX + Math.cos(angle) * pointRadius;
    const y = centerY + Math.sin(angle) * pointRadius;

    context.beginPath();
    context.arc(x, y, 3 + dotProgress * 2, 0, Math.PI * 2);
    context.fillStyle = "#C9A84C";
    context.fill();
  });

  context.restore();
}

function DashboardIcon(active = false) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={active ? "is-active" : ""}
    >
      <path
        d="M4 11.5 12 5l8 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 10.5V19h11v-8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RoomsIcon(active = false) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={active ? "is-active" : ""}
    >
      <rect
        x="4"
        y="5"
        width="7"
        height="6"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="13"
        y="5"
        width="7"
        height="14"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="4"
        y="13"
        width="7"
        height="6"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function SavedIcon(active = false) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={active ? "is-active" : ""}
    >
      <path
        d="M12 19.3 5.8 13a4 4 0 0 1 5.7-5.6l.5.6.5-.6A4 4 0 1 1 18.2 13L12 19.3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StyleIcon(active = false) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={active ? "is-active" : ""}
    >
      <path
        d="M12 3.5 19 8v8l-7 4.5L5 16V8l7-4.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M12 8.3 15.5 10.5v3L12 15.7l-3.5-2.2v-3L12 8.3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon(active = false) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={active ? "is-active" : ""}
    >
      <path
        d="M12 8.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M19 12a7 7 0 0 0-.1-1.1l1.7-1.3-1.8-3.1-2 .8a7 7 0 0 0-1.9-1.1l-.3-2.1h-3.6l-.3 2.1a7 7 0 0 0-1.9 1.1l-2-.8-1.8 3.1 1.7 1.3A7 7 0 0 0 5 12c0 .4 0 .8.1 1.1l-1.7 1.3 1.8 3.1 2-.8c.6.5 1.2.8 1.9 1.1l.3 2.1h3.6l.3-2.1c.7-.3 1.3-.6 1.9-1.1l2 .8 1.8-3.1-1.7-1.3c.1-.3.1-.7.1-1.1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function HeartStatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 19.2 5.7 13a4.1 4.1 0 0 1 5.8-5.8l.5.6.5-.6a4.1 4.1 0 1 1 5.8 5.8L12 19.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TagStatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.8 12.3 12.4 4h6.3v6.2L11 18.6 4.8 12.3Zm10.3-5.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ArrowLink() {
  return <span className="cova-arrow">→</span>;
}

export default function Home() {
  const router = useRouter();
  useEffect(() => { flowLog("page:mount", { page: "dashboard" }); }, []);
  const location = usePathname();
  const [isLoaded, setIsLoaded] = useState(false);
  const [styleVisible, setStyleVisible] = useState(false);
  const styleSectionRef = useRef<HTMLDivElement | null>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const now = useMemo(() => new Date(), []);
  const greeting = useMemo(() => getGreeting(now), [now]);
  const currentDate = useMemo(
    () =>
      now.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [now],
  );

  const roomsDesigned = useAnimatedCounter(12, 1000, isLoaded);
  const itemsSaved = useAnimatedCounter(47, 1000, isLoaded);
  const valueCurated = useAnimatedCounter(24500, 1050, isLoaded);
  const styleMatch = useAnimatedCounter(94, 1100, isLoaded);

  const navItems: NavItem[] = useMemo(
    () => [
      { label: "Dashboard", path: "/dashboard", icon: DashboardIcon },
      { label: "My Rooms", path: "/dashboard/rooms", icon: RoomsIcon },
      { label: "Saved Products", path: "/dashboard/saved", icon: SavedIcon },
      { label: "Style Profile", path: "/dashboard/settings", icon: StyleIcon },
      { label: "Settings", path: "/dashboard/settings", icon: SettingsIcon },
    ],
    [],
  );

  useEffect(() => {
    const checkAuth = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push("/auth");
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoaded(true), 120);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const node = styleSectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStyleVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!styleVisible || !radarCanvasRef.current) return;

    const canvas = radarCanvasRef.current;
    let frame = 0;
    const start = performance.now();
    const duration = 1200;

    const animate = (nowMs: number) => {
      const progress = Math.min((nowMs - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      drawRadarChart(canvas, eased);

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [styleVisible]);

  const separatorStyle = (delay: number) => ({
    animationDelay: `${delay}ms`,
  });

  const navigate = (path: string) => router.push(path);

  return (
    <div className={`cova-shell ${isLoaded ? "is-loaded" : ""}`}>
      <aside className="cova-sidebar">
        <div className="cova-brand-block">
          <button className="cova-brand" onClick={() => navigate("/dashboard")}>
            Cova
          </button>
          <div className="cova-separator cova-separator-side" />
        </div>

        <div className="cova-user-block">
          <div className="cova-avatar">AL</div>
          <div className="cova-user-meta">
            <div className="cova-user-name">Amelia Laurent</div>
            <div className="cova-badge">Pro Member</div>
          </div>
        </div>

        <div className="cova-separator cova-separator-side" />

        <nav className="cova-nav" aria-label="Dashboard navigation">
          {navItems.map((item, index) => {
            const active =
              location === item.path ||
              (item.path === "/dashboard" && location === "/");
            return (
              <button
                key={item.label}
                className={`cova-nav-link ${active ? "is-active" : ""}`}
                style={{ animationDelay: `${240 + index * 50}ms` }}
                onClick={() => navigate(item.path)}
              >
                <span className="cova-nav-icon">{item.icon(active)}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="cova-separator cova-separator-side" />

        <div className="cova-sidebar-footer">
          <button
            className="cova-pill-button"
            onClick={() => navigate("/design/step-1")}
          >
            Start New Room <ArrowLink />
          </button>
          <div className="cova-remaining">3 rooms remaining</div>
          <button
            className="cova-sign-out"
            onClick={async () => {
              const { createBrowserClient } =
                await import("@/lib/supabase/client");
              const supabase = createBrowserClient();
              await supabase.auth.signOut();
              router.push("/");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="cova-main">
        <div className="cova-main-inner">
          <section
            className="cova-greeting-row cova-animate-up"
            style={{ animationDelay: "180ms" }}
          >
            <div>
              <h1 className="cova-greeting">{greeting}, Amelia.</h1>
              <p suppressHydrationWarning className="cova-subtext">
                Your spaces are coming together beautifully.
              </p>
            </div>

            <div className="cova-greeting-actions">
              <div className="cova-date">{currentDate}</div>
              <button
                className="cova-ghost-button"
                onClick={() => navigate("/design/step-1")}
              >
                New Room <ArrowLink />
              </button>
            </div>
          </section>

          <div
            className="cova-separator cova-animate-line"
            style={separatorStyle(260)}
          />

          <section className="cova-stats-grid">
            <article
              className="cova-stat-card cova-animate-up"
              style={{ animationDelay: "320ms" }}
            >
              <div className="cova-stat-icon">
                <SparkleIcon />
              </div>
              <div className="cova-stat-value">{roomsDesigned}</div>
              <div className="cova-stat-label">Rooms Designed</div>
            </article>

            <article
              className="cova-stat-card cova-animate-up"
              style={{ animationDelay: "400ms" }}
            >
              <div className="cova-stat-icon">
                <HeartStatIcon />
              </div>
              <div className="cova-stat-value">{itemsSaved}</div>
              <div className="cova-stat-label">Items Saved</div>
            </article>

            <article
              className="cova-stat-card cova-animate-up"
              style={{ animationDelay: "480ms" }}
            >
              <div className="cova-stat-icon">
                <TagStatIcon />
              </div>
              <div className="cova-stat-value">
                ${valueCurated.toLocaleString()}
              </div>
              <div className="cova-stat-label">Est. Value Curated</div>
            </article>

            <article
              className="cova-stat-card cova-stat-ring-card cova-animate-up"
              style={{ animationDelay: "560ms" }}
            >
              <div
                className={`cova-progress-ring ${isLoaded ? "is-drawn" : ""}`}
                style={
                  {
                    "--progress-angle": `${(styleMatch / 100) * 360}deg`,
                  } as CSSProperties
                }
              />
              <div className="cova-stat-value">{styleMatch}%</div>
              <div className="cova-stat-label">Style Match Score</div>
            </article>
          </section>

          <div
            className="cova-separator cova-animate-line"
            style={separatorStyle(620)}
          />

          <section className="cova-section">
            <div
              className="cova-section-head cova-animate-up"
              style={{ animationDelay: "680ms" }}
            >
              <h2>My Rooms</h2>
              <button
                className="cova-inline-link"
                onClick={() => navigate("/dashboard/rooms")}
              >
                View all <ArrowLink />
              </button>
            </div>

            <div className="cova-scroll-row">
              {roomData.map((room, index) => (
                <article
                  className="cova-room-card cova-animate-up"
                  key={room.name}
                  style={{ animationDelay: `${760 + index * 60}ms` }}
                >
                  <div className="cova-room-image-shell">
                    <img
                      src={room.image}
                      alt={room.name}
                      className="cova-room-image"
                    />
                    <div className="cova-wireframe" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                  <div className="cova-room-body">
                    <div>
                      <h3>{room.name}</h3>
                      <p>{room.date}</p>
                    </div>
                    <div className="cova-tag-row">
                      {room.tags.map((tag) => (
                        <span key={tag} className="cova-tag-pill">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="cova-room-actions">
                      <button
                        className="cova-ghost-button small"
                        onClick={() => navigate("/dashboard/rooms")}
                      >
                        View
                      </button>
                      <button
                        className="cova-solid-button small"
                        onClick={() => navigate("/dashboard/saved")}
                      >
                        Shop
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              <button
                className="cova-room-card cova-room-card-new cova-animate-up"
                style={{ animationDelay: "940ms" }}
                onClick={() => navigate("/design/step-1")}
              >
                <span className="cova-plus">+</span>
                <span className="cova-new-room-label">Design a new room</span>
              </button>
            </div>
          </section>

          <div
            className="cova-separator cova-animate-line"
            style={separatorStyle(980)}
          />

          <section
            className="cova-section cova-style-grid"
            ref={styleSectionRef}
          >
            <div
              className="cova-style-left cova-animate-up"
              style={{ animationDelay: "1040ms" }}
            >
              <div className="cova-section-head stacked">
                <div>
                  <h2>Your Style DNA</h2>
                  <p>Based on your quiz and design choices.</p>
                </div>
              </div>

              <div className="cova-radar-shell">
                <canvas
                  ref={radarCanvasRef}
                  width={300}
                  height={300}
                  className="cova-radar-canvas"
                />
              </div>

              <button
                className="cova-inline-link muted"
                onClick={() => navigate("/design/step-3")}
              >
                Retake quiz <ArrowLink />
              </button>
            </div>

            <div
              className="cova-style-right cova-animate-up"
              style={{ animationDelay: "1120ms" }}
            >
              <div className="cova-style-breakdown">
                {styleAxes.map((axis, index) => (
                  <div className="cova-style-row" key={axis.label}>
                    <span className="cova-style-label">{axis.label}</span>
                    <span className="cova-style-bar-track">
                      <span
                        className={`cova-style-bar-fill ${styleVisible ? "is-visible" : ""}`}
                        style={
                          {
                            "--fill": `${axis.value}%`,
                            "--bar-delay": `${index * 90}ms`,
                          } as CSSProperties
                        }
                      />
                    </span>
                    <span className="cova-style-value">{axis.value}%</span>
                  </div>
                ))}
              </div>

              <div className="cova-dominant-style">
                <span>Your dominant aesthetic:</span>
                <strong>Quiet Naturalist</strong>
              </div>
            </div>
          </section>

          <div
            className="cova-separator cova-animate-line"
            style={separatorStyle(1180)}
          />

          <section className="cova-section">
            <div
              className="cova-section-head cova-animate-up"
              style={{ animationDelay: "1240ms" }}
            >
              <h2>Recently Saved</h2>
              <button
                className="cova-inline-link"
                onClick={() => navigate("/dashboard/saved")}
              >
                View all <ArrowLink />
              </button>
            </div>

            <div className="cova-scroll-row compact">
              {productData.map((product, index) => (
                <article
                  className="cova-product-card cova-animate-up"
                  key={product.name}
                  style={{ animationDelay: `${1320 + index * 70}ms` }}
                >
                  <div className="cova-product-visual">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="cova-product-image"
                    />
                  </div>
                  <div className="cova-product-body">
                    <div className="cova-product-brand">{product.brand}</div>
                    <h3>{product.name}</h3>
                    <div className="cova-product-price">{product.price}</div>
                    <div className="cova-product-actions">
                      <button
                        className="cova-inline-heart"
                        onClick={() => navigate("/dashboard/saved")}
                      >
                        ♡ Saved
                      </button>
                      <button
                        className="cova-inline-link compact-link"
                        onClick={() => navigate("/dashboard/saved")}
                      >
                        Shop <ArrowLink />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div
            className="cova-separator cova-animate-line"
            style={separatorStyle(1460)}
          />

          <section
            className="cova-section cova-activity cova-animate-up"
            style={{ animationDelay: "1520ms" }}
          >
            <div className="cova-section-head stacked">
              <h2>Recent Activity</h2>
            </div>

            <div className="cova-activity-list">
              {activityData.map((item, index) => (
                <div
                  className="cova-activity-row"
                  key={`${item.description}-${index}`}
                >
                  <span className="cova-activity-dot" />
                  <span className="cova-activity-description">
                    {item.description}
                  </span>
                  <span className="cova-activity-time">{item.timestamp}</span>
                </div>
              ))}
            </div>

            <button
              className="cova-inline-link muted"
              onClick={() => navigate("/dashboard/activity")}
            >
              View all activity <ArrowLink />
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
