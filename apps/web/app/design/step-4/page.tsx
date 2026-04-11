"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFingerprintStore } from "@/lib/store/fingerprint";
import "../step-1/step1.css";
import "./step4.css";

type StyleVariation = {
  name: string;
  desc: string;
  traits: string[];
};

const STYLE_VARIATIONS: Record<string, StyleVariation> = {
  warm: {
    name: "Warm Naturalist",
    desc: "Your core sensibility now glows with added warmth — think amber-toned woods, terracotta accents, and soft candlelight atmospheres. The calm remains, but the palette shifts toward sunset earth tones.",
    traits: ["Warm Earth Tones", "Amber Light", "Organic Comfort"],
  },
  earth: {
    name: "Earthy Naturalist",
    desc: "Grounded and organic. Your style deepens with raw clay textures, undyed linen, and sun-baked terracotta. Spaces feel like they emerged from the earth itself — rooted, honest, and deeply tactile.",
    traits: ["Clay Textures", "Raw Materials", "Grounded Palette"],
  },
  bold: {
    name: "Bold Naturalist",
    desc: "Your restrained foundation now carries confident contrast — deep charcoal walls meet warm wood, with strategic pops of muted indigo or forest green. Restraint meets conviction.",
    traits: ["High Contrast", "Confident Color", "Dramatic Calm"],
  },
  vintage: {
    name: "Vintage Naturalist",
    desc: "A beautiful tension between old and new. Wabi-sabi imperfections meet heritage silhouettes. Patina-rich surfaces, hand-thrown ceramics, and furniture with stories to tell.",
    traits: ["Wabi-Sabi", "Patina Surfaces", "Timeless Pieces"],
  },
  luxur: {
    name: "Luxe Naturalist",
    desc: "Elevated restraint at its finest. Marble meets light oak, brass hardware catches the light, and every surface whispers quality. This is quiet luxury — understated but unmistakably refined.",
    traits: ["Quiet Luxury", "Premium Materials", "Refined Detail"],
  },
  color: {
    name: "Chromatic Naturalist",
    desc: "Your clean-lined aesthetic now embraces muted color — dusty rose, sage green, and soft terracotta join the neutral palette. Color is used sparingly but with purpose, like art on a gallery wall.",
    traits: ["Muted Palette", "Purposeful Color", "Gallery Feel"],
  },
  modern: {
    name: "Contemporary Naturalist",
    desc: "Precision meets zen. Sharper lines, integrated technology, and a cooler palette push your style toward the contemporary edge. Think smart home meets tea ceremony.",
    traits: ["Sharp Lines", "Cool Tones", "Tech-Integrated"],
  },
  natur: {
    name: "Biophilic Naturalist",
    desc: "Nature doesn't just inspire your space — it inhabits it. Living walls, abundant natural light, and organic forms blur the boundary between indoors and out. Every room feels like a garden pavilion.",
    traits: ["Living Greenery", "Natural Light", "Indoor-Outdoor Flow"],
  },
  coast: {
    name: "Seaside Naturalist",
    desc: "Sea-washed restraint. Your clean aesthetic meets ocean-inspired calm — bleached woods, soft blues, and the texture of woven rope and linen. Spaces feel like a seaside retreat.",
    traits: ["Ocean Calm", "Bleached Wood", "Soft Blues"],
  },
  dark: {
    name: "Moody Naturalist",
    desc: "Dramatic and contemplative. Deep charcoals, midnight blues, and rich walnut create spaces that envelop you. The restraint is still there, but it's wrapped in shadow and mystery.",
    traits: ["Deep Tones", "Contemplative", "Shadow Play"],
  },
};

const DEFAULT_VARIATION: StyleVariation = {
  name: "Evolved Naturalist",
  desc: "Your style has been subtly reimagined based on your preferences. The core principles of intentional design and natural harmony remain, with new nuances layered in to reflect your evolving taste.",
  traits: ["Evolved Taste", "Personal Touch", "Refined Balance"],
};

const ROOMS = [
  {
    id: 1,
    src: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600&h=750&fit=crop&q=80",
    alt: "Living room",
    match: "96% Match",
    label: "Living Room",
    name: "Serene Living",
    desc: "Low-profile furniture, warm wood tones, and curated negative space",
  },
  {
    id: 2,
    src: "https://images.unsplash.com/photo-1617325247661-675ab4b64ae2?w=600&h=750&fit=crop&q=80",
    alt: "Bedroom",
    match: "94% Match",
    label: "Bedroom",
    name: "Restful Retreat",
    desc: "Organic linens, muted palette, and intentional simplicity",
  },
  {
    id: 3,
    src: "https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=600&h=750&fit=crop&q=80",
    alt: "Kitchen",
    match: "91% Match",
    label: "Kitchen",
    name: "Everyday Ritual",
    desc: "Clean surfaces, natural stone, and functional elegance",
  },
];

const PALETTE = [
  { color: "#F5F0E8", label: "#F5F0E8" },
  { color: "#A8B5A0", label: "#A8B5A0" },
  { color: "#7A5C3E", label: "#7A5C3E" },
  { color: "#B8AFA6", label: "#B8AFA6" },
  { color: "#C9A84C", label: "#C9A84C" },
];

const DIMENSIONS = [
  { name: "Calm", score: 87 },
  { name: "Warmth", score: 72 },
  { name: "Texture", score: 65 },
  { name: "Drama", score: 28 },
  { name: "Nature", score: 81 },
  { name: "Luxury", score: 55 },
  { name: "Playfulness", score: 22 },
  { name: "Vintage", score: 40 },
];

export default function StepFourPage() {
  const router = useRouter();
  const revealCanvasRef = useRef<HTMLCanvasElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement>(null);
  const radarContainerRef = useRef<HTMLDivElement>(null);
  const radarTooltipRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [tweakInput, setTweakInput] = useState("");
  const [tweakResult, setTweakResult] = useState<StyleVariation | null>(null);
  const [tweakLoading, setTweakLoading] = useState(false);

  const {
    fingerprint,
    styleName: storedStyleName,
    styleTags: storedStyleTags,
    phaseBResponses,
    styleExplanation,
  } = useFingerprintStore();
  const setStyleExplanation = useFingerprintStore((s) => s.setStyleExplanation);

  // Map 12-dim fingerprint to 8 display dimensions
  const computedDimensions = useMemo(() => {
    if (!fingerprint) return DIMENSIONS; // fallback to defaults
    const d = fingerprint.dimensions;
    return [
      {
        name: "Calm",
        score: Math.round(
          (1 - d.density) * 50 +
            (1 - d.colorSaturation) * 25 +
            d.lineQuality * 25,
        ),
      },
      { name: "Warmth", score: Math.round(d.colorTemperature * 100) },
      { name: "Texture", score: Math.round(d.texture * 100) },
      {
        name: "Drama",
        score: Math.round(
          d.colorSaturation * 50 +
            d.formality * 25 +
            (1 - d.lightPreference) * 25,
        ),
      },
      { name: "Nature", score: Math.round(d.nature * 100) },
      {
        name: "Luxury",
        score: Math.round(
          d.formality * 40 + d.material * 30 + (1 - d.density) * 30,
        ),
      },
      {
        name: "Playfulness",
        score: Math.round(
          d.pattern * 40 + d.culturalInfluence * 30 + d.colorSaturation * 30,
        ),
      },
      { name: "Vintage", score: Math.round(d.era * 100) },
    ];
  }, [fingerprint]);

  const displayStyleName = useMemo(() => {
    if (storedStyleName) return storedStyleName;
    if (!fingerprint) return "Quiet Naturalist"; // fallback
    const d = fingerprint.dimensions;
    // Map to descriptive names based on dominant dimensions
    const calm = (1 - d.density) * 0.5 + (1 - d.colorSaturation) * 0.5;
    if (d.colorTemperature > 0.7 && d.nature > 0.7) return "Organic Warmth";
    if (d.formality > 0.7 && d.colorSaturation > 0.7) return "Luxe Drama";
    if (calm > 0.75 && d.texture < 0.4) return "Pure Quiet";
    if (d.pattern > 0.7 || d.culturalInfluence > 0.7) return "Eclectic Spirit";
    if (d.nature > 0.75 && d.colorTemperature > 0.6) return "Warm Naturalist";
    if (d.era > 0.7) return "Heritage Soul";
    if (d.material > 0.7 && d.texture > 0.6) return "Tactile Artisan";
    if (d.lightPreference > 0.7 && calm > 0.6) return "Sunlit Purist";
    if (d.formality > 0.6 && d.material < 0.4) return "Modern Edge";
    if (d.colorTemperature < 0.35) return "Cool Curator";
    return "Evolved Naturalist";
  }, [fingerprint, storedStyleName]);

  const displayDescription = useMemo(() => {
    if (!fingerprint)
      return "You gravitate toward spaces that breathe. Clean lines, natural materials, and deliberate calm define your aesthetic. Every object earns its place — nothing is accidental, everything is intentional.";
    const d = fingerprint.dimensions;
    const parts: string[] = [];
    if (d.colorTemperature > 0.6) parts.push("warm, inviting tones");
    else if (d.colorTemperature < 0.4) parts.push("cool, composed tones");
    if (d.nature > 0.65) parts.push("natural materials and organic forms");
    if (d.texture > 0.65) parts.push("rich tactile surfaces");
    if (d.density < 0.35) parts.push("deliberate calm and breathing room");
    if (d.formality > 0.65) parts.push("structured elegance");
    if (d.era > 0.65) parts.push("heritage character and timeless pieces");
    if (d.pattern > 0.65) parts.push("expressive pattern and detail");
    if (parts.length === 0)
      parts.push("balanced design with personal character");
    return `Your design DNA draws you toward ${parts.join(", ")}. Every space you create reflects this unique sensibility.`;
  }, [fingerprint]);

  const displayTraits = useMemo(() => {
    if (storedStyleTags.length > 0) return storedStyleTags;
    if (!fingerprint)
      return ["Calm · Intentional", "Natural Materials", "Negative Space"];
    const d = fingerprint.dimensions;
    const traits: string[] = [];
    if (d.colorTemperature > 0.65) traits.push("Warm Tones");
    if (d.colorTemperature < 0.35) traits.push("Cool Palette");
    if (d.nature > 0.65) traits.push("Natural Materials");
    if (d.texture > 0.65) traits.push("Rich Textures");
    if (d.density < 0.35) traits.push("Negative Space");
    if (d.formality > 0.65) traits.push("Refined Structure");
    if (d.era > 0.65) traits.push("Vintage Character");
    if (d.pattern > 0.65) traits.push("Bold Patterns");
    if (d.lightPreference > 0.65) traits.push("Natural Light");
    if (d.culturalInfluence > 0.65) traits.push("Global Influence");
    return traits.slice(0, 3).length > 0
      ? traits.slice(0, 3)
      : ["Evolved Taste", "Personal Touch", "Refined Balance"];
  }, [fingerprint, storedStyleTags]);

  const displayPalette = useMemo(() => {
    if (!fingerprint) return PALETTE;
    const d = fingerprint.dimensions;
    if (d.colorTemperature > 0.65 && d.nature > 0.6) {
      return [
        { color: "#F5F0E8", label: "#F5F0E8" },
        { color: "#A8B5A0", label: "#A8B5A0" },
        { color: "#7A5C3E", label: "#7A5C3E" },
        { color: "#B8AFA6", label: "#B8AFA6" },
        { color: "#C9A84C", label: "#C9A84C" },
      ];
    }
    if (d.colorTemperature < 0.4) {
      return [
        { color: "#E8EDF2", label: "#E8EDF2" },
        { color: "#8BA3C0", label: "#8BA3C0" },
        { color: "#4A6B8A", label: "#4A6B8A" },
        { color: "#2C3E50", label: "#2C3E50" },
        { color: "#C9A84C", label: "#C9A84C" },
      ];
    }
    if (d.colorSaturation > 0.65) {
      return [
        { color: "#F0D080", label: "#F0D080" },
        { color: "#C06040", label: "#C06040" },
        { color: "#2D5A27", label: "#2D5A27" },
        { color: "#4A3060", label: "#4A3060" },
        { color: "#C9A84C", label: "#C9A84C" },
      ];
    }
    return PALETTE; // default warm natural
  }, [fingerprint]);

  // Auth gate
  useEffect(() => {
    const checkAuth = async () => {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push("/auth?next=/design/step-4");
    };
    checkAuth();
  }, [router]);

  // Fetch fingerprint from API if not yet in store but quiz responses exist
  useEffect(() => {
    if (fingerprint) return; // already computed
    if (phaseBResponses.length === 0) return; // no quiz data

    const computeFingerprint = async () => {
      try {
        const res = await fetch("/api/quiz/fingerprint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase_a_selections: useFingerprintStore.getState().phaseASelections,
            phase_b_responses: phaseBResponses,
            room_type: useFingerprintStore.getState().roomType ?? "living_room",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.fingerprint) {
            useFingerprintStore
              .getState()
              .setFingerprint(
                data.fingerprint,
                data.styleName || "",
                data.styleTags || [],
              );
          }
        }
      } catch (e) {
        console.warn("[step-4] Fingerprint API failed, using defaults", e);
      }
    };
    computeFingerprint();
  }, [fingerprint, phaseBResponses]);

  // Fetch plain-English style explanation (cached in store)
  useEffect(() => {
    if (!fingerprint || styleExplanation) return;
    const fetchExplanation = async () => {
      try {
        const res = await fetch("/api/fingerprint/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dimensions: fingerprint.dimensions }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.explanation) setStyleExplanation(data.explanation);
        }
      } catch (e) {
        console.warn("[step-4] Style explanation fetch failed", e);
      }
    };
    fetchExplanation();
  }, [fingerprint, styleExplanation, setStyleExplanation]);

  // Reveal overlay animation
  useEffect(() => {
    const overlay = overlayRef.current;
    const canvas = revealCanvasRef.current;
    if (!overlay || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const particles: Array<{
      startX: number;
      startY: number;
      targetX: number;
      targetY: number;
      x: number;
      y: number;
      size: number;
      alpha: number;
      delay: number;
      speed: number;
      update: (p: number) => void;
      draw: () => void;
    }> = [];

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const makeParticle = () => {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.max(w, h) * 0.8;
      const p = {
        startX: w / 2 + Math.cos(angle) * dist,
        startY: h / 2 + Math.sin(angle) * dist,
        targetX: w / 2 + (Math.random() - 0.5) * 60,
        targetY: h / 2 + (Math.random() - 0.5) * 60,
        x: 0,
        y: 0,
        size: Math.random() * 3 + 1,
        alpha: 0,
        delay: Math.random() * 0.4,
        speed: 0.6 + Math.random() * 0.4,
        update(progress: number) {
          const prog = Math.max(
            0,
            Math.min(1, (progress - this.delay) / this.speed),
          );
          const ease = 1 - Math.pow(1 - prog, 3);
          this.x = this.startX + (this.targetX - this.startX) * ease;
          this.y = this.startY + (this.targetY - this.startY) * ease;
          if (progress < 0.7) {
            this.alpha = ease * 0.9;
          } else {
            this.alpha = Math.max(0, (1 - (progress - 0.7) / 0.3) * 0.9);
          }
        },
        draw() {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(201,168,76,${this.alpha})`;
          ctx.fill();
        },
      };
      p.x = p.startX;
      p.y = p.startY;
      return p;
    };

    for (let i = 0; i < 120; i++) particles.push(makeParticle());

    const startTime = performance.now();
    let rafId = 0;
    let fadeTimeout: ReturnType<typeof setTimeout> | null = null;

    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1500;
      ctx.clearRect(0, 0, w, h);

      if (elapsed < 0.75) {
        const burstProgress = elapsed / 0.75;
        const burstAlpha =
          burstProgress > 0.5 ? (1 - burstProgress) * 2 : burstProgress * 0.6;
        const grad = ctx.createRadialGradient(
          w / 2,
          h / 2,
          0,
          w / 2,
          h / 2,
          100 * burstProgress,
        );
        grad.addColorStop(0, `rgba(201,168,76,${burstAlpha * 0.3})`);
        grad.addColorStop(1, "rgba(201,168,76,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      particles.forEach((p) => {
        p.update(elapsed);
        p.draw();
      });

      if (elapsed < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        overlay.classList.add("fade-out");
        fadeTimeout = setTimeout(() => {
          if (overlay) overlay.style.display = "none";
        }, 600);
      }
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafId);
      if (fadeTimeout) clearTimeout(fadeTimeout);
    };
  }, []);

  // Ambient particles
  useEffect(() => {
    const canvas = particleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = document.documentElement.scrollHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: Array<{
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      alpha: number;
      reset: () => void;
      update: () => void;
      draw: () => void;
    }> = [];

    const makeP = () => {
      const p = {
        x: 0,
        y: 0,
        size: 0,
        speedX: 0,
        speedY: 0,
        alpha: 0,
        reset() {
          this.x = Math.random() * w;
          this.y = Math.random() * h;
          this.size = Math.random() * 1.8 + 0.5;
          this.speedX = (Math.random() - 0.5) * 0.3;
          this.speedY = (Math.random() - 0.5) * 0.2;
          this.alpha = Math.random() * 0.25 + 0.05;
        },
        update() {
          this.x += this.speedX;
          this.y += this.speedY;
          if (this.x < 0 || this.x > w || this.y < 0 || this.y > h)
            this.reset();
        },
        draw() {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(201,168,76,${this.alpha})`;
          ctx.fill();
        },
      };
      p.reset();
      return p;
    };
    for (let i = 0; i < 50; i++) particles.push(makeP());

    let rafId = 0;
    const animate = () => {
      ctx.clearRect(0, 0, w, h);
      particles.forEach((p) => {
        p.update();
        p.draw();
      });
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Radar chart — re-runs when computedDimensions changes (fingerprint loaded)
  useEffect(() => {
    const canvas = radarCanvasRef.current;
    const tooltip = radarTooltipRef.current;
    const container = radarContainerRef.current;
    if (!canvas || !tooltip || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 480;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 180;
    const numAxes = computedDimensions.length;
    const angleStep = (Math.PI * 2) / numAxes;
    const DELAY = 2000;
    let startTime: number | null = null;
    let rafId = 0;

    const getPoint = (index: number, value: number) => {
      const angle = angleStep * index - Math.PI / 2;
      const r = radius * (value / 100);
      return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    };
    const getAxisEnd = (index: number) => {
      const angle = angleStep * index - Math.PI / 2;
      return {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      };
    };

    const drawGrid = () => {
      ctx.strokeStyle = "rgba(201,168,76,0.06)";
      ctx.lineWidth = 1;
      for (let ring = 1; ring <= 4; ring++) {
        const r = radius * (ring / 4);
        ctx.beginPath();
        for (let i = 0; i <= numAxes; i++) {
          const angle = angleStep * i - Math.PI / 2;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    const draw = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      if (elapsed < DELAY) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      const t = elapsed - DELAY;
      ctx.clearRect(0, 0, size, size);
      drawGrid();

      for (let i = 0; i < numAxes; i++) {
        const axisStart = i * 150;
        const axisT = Math.max(0, Math.min(1, (t - axisStart) / 400));
        if (axisT > 0) {
          const end = getAxisEnd(i);
          const curX = cx + (end.x - cx) * axisT;
          const curY = cy + (end.y - cy) * axisT;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(curX, curY);
          ctx.strokeStyle = `rgba(201,168,76,${0.3 * axisT})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          if (axisT > 0.5) {
            const labelAlpha = (axisT - 0.5) * 2;
            const angle = angleStep * i - Math.PI / 2;
            const labelR = radius + 24;
            const lx = cx + Math.cos(angle) * labelR;
            const ly = cy + Math.sin(angle) * labelR;
            ctx.font = "11px DM Sans";
            ctx.fillStyle = `rgba(245,240,232,${0.4 * labelAlpha})`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(computedDimensions[i].name, lx, ly);
          }
        }
      }

      const allAxesDone = t > numAxes * 150 + 400;
      if (allAxesDone) {
        const polyProgress = Math.min(1, (t - (numAxes * 150 + 400)) / 600);
        const eased = 1 - Math.pow(1 - polyProgress, 3);

        ctx.beginPath();
        for (let i = 0; i < numAxes; i++) {
          const pt = getPoint(i, computedDimensions[i].score * eased);
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(201,168,76,${0.12 * polyProgress})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(201,168,76,${0.7 * polyProgress})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        const dotPulse = (Math.sin((t / 1000) * Math.PI) + 1) / 2;
        const dotScale = 1 + dotPulse * 0.15;
        for (let i = 0; i < numAxes; i++) {
          const pt = getPoint(i, computedDimensions[i].score * eased);
          const r = 4 * dotScale;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(201,168,76,${0.9 * polyProgress})`;
          ctx.fill();

          const grad = ctx.createRadialGradient(
            pt.x,
            pt.y,
            0,
            pt.x,
            pt.y,
            r * 3,
          );
          grad.addColorStop(
            0,
            `rgba(201,168,76,${0.3 * polyProgress * dotPulse})`,
          );
          grad.addColorStop(1, "rgba(201,168,76,0)");
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r * 3, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }

      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = size / rect.width;
      const scaleY = size / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      let found = false;
      for (let i = 0; i < numAxes; i++) {
        const pt = getPoint(i, computedDimensions[i].score);
        const dist = Math.sqrt((mx - pt.x) ** 2 + (my - pt.y) ** 2);
        if (dist < 20) {
          tooltip.textContent = `${computedDimensions[i].name} · ${computedDimensions[i].score}%`;
          tooltip.style.opacity = "1";
          const tipX = e.clientX - container.getBoundingClientRect().left;
          const tipY = e.clientY - container.getBoundingClientRect().top - 40;
          tooltip.style.left = `${tipX}px`;
          tooltip.style.top = `${tipY}px`;
          tooltip.style.transform = "translateX(-50%)";
          found = true;
          break;
        }
      }
      if (!found) tooltip.style.opacity = "0";
    };
    const onLeave = () => {
      tooltip.style.opacity = "0";
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
    };
  }, [computedDimensions]);

  const handleRoomMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `translateY(-10px) scale(1.02) rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`;
  };

  const handleRoomMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = "";
  };

  const submitTweak = () => {
    const val = tweakInput.trim();
    if (!val || tweakLoading) return;
    setTweakLoading(true);
    setTimeout(() => {
      const lower = val.toLowerCase();
      let picked: StyleVariation = DEFAULT_VARIATION;
      for (const [key, variation] of Object.entries(STYLE_VARIATIONS)) {
        if (lower.includes(key)) {
          picked = variation;
          break;
        }
      }
      setTweakResult(picked);
      setTweakLoading(false);
    }, 1200);
  };

  return (
    <div className="step4-wrapper">
      <div className="loading-overlay" ref={overlayRef}>
        <canvas ref={revealCanvasRef} />
      </div>

      <canvas className="particle-canvas" ref={particleCanvasRef} />

      <div className="top-bar">
        <button
          type="button"
          className="wordmark"
          onClick={() => router.push("/")}
          aria-label="Cova home"
        >
          Cova
        </button>
        <button
          type="button"
          className="back-btn"
          onClick={() => router.push("/design/step-3")}
        >
          ← Back
        </button>
      </div>

      <div className="main-wrap">
        <section className="fingerprint-section">
          <div className="eyebrow">Your Style Fingerprint</div>
          <h1 className="headline">
            You are a<span className="style-name">{displayStyleName}</span>
          </h1>
          {styleExplanation && (
            <p
              className="style-description"
              style={{ fontStyle: "italic", opacity: 0.85, marginBottom: 12 }}
            >
              {styleExplanation}
            </p>
          )}
          <p className="style-description">{displayDescription}</p>
          <div className="traits">
            {displayTraits.map((trait) => (
              <span key={trait} className="trait-pill">
                {trait}
              </span>
            ))}
          </div>
          <div className="palette">
            {displayPalette.map((swatch) => (
              <div key={swatch.color} className="palette-swatch">
                <div
                  className="swatch-circle"
                  style={{ background: swatch.color }}
                />
                <span className="swatch-label">{swatch.label}</span>
              </div>
            ))}
          </div>
          <div className="cta-group">
            <button
              type="button"
              className="cta-primary"
              onClick={() => router.push("/design/step-5")}
            >
              Design My Room <span style={{ fontSize: 18 }}>→</span>
            </button>
            <button
              type="button"
              className="cta-secondary"
              onClick={() => router.push("/design/step-3")}
            >
              Retake quiz
            </button>
          </div>
        </section>

        <div className="section-divider" />

        <section className="radar-section">
          <div className="eyebrow">Your Style DNA</div>
          <h2 className="radar-title">Fingerprint Map</h2>
          <p className="radar-description">
            Your unique design fingerprint mapped across eight dimensions of
            taste. Each axis reveals how strongly you lean into a particular
            aesthetic quality — from calm to drama, nature to luxury.
          </p>
          <div className="radar-container" ref={radarContainerRef}>
            <div className="radar-wrapper">
              <canvas
                className="radar-canvas"
                ref={radarCanvasRef}
                width={480}
                height={480}
              />
            </div>
            <div className="radar-tooltip" ref={radarTooltipRef} />
          </div>
        </section>

        <div className="section-divider section-divider-late" />

        <section className="rooms-section">
          <div className="eyebrow">Rooms Like Yours</div>
          <h2 className="rooms-title">Your Style, Three Ways</h2>
          <p className="rooms-subtitle">
            See how your style fingerprint translates across different spaces —
            each room curated to match your exact aesthetic DNA.
          </p>
          <div className="rooms-grid">
            {ROOMS.map((room) => (
              <div
                key={room.id}
                className="room-card"
                onMouseMove={handleRoomMouseMove}
                onMouseLeave={handleRoomMouseLeave}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={room.src} alt={room.alt} loading="lazy" />
                <div className="room-match-badge">✦ {room.match}</div>
                <div className="room-card-overlay">
                  <div className="room-card-label">{room.label}</div>
                  <div className="room-card-name">{room.name}</div>
                  <div className="room-card-desc">{room.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="section-divider section-divider-latest" />

        <section className="tweak-section">
          <div className="eyebrow">Personalize Further</div>
          <h2 className="tweak-title">Tweak My Style</h2>
          <p className="tweak-subtitle">
            Want to shift your aesthetic? Describe what you&apos;d change — more
            warmth, bolder colors, vintage touches — and we&apos;ll reimagine
            your style fingerprint.
          </p>
          <div className="tweak-input-wrap">
            <input
              type="text"
              className="tweak-input"
              placeholder="e.g. Make it warmer with more earth tones..."
              autoComplete="off"
              value={tweakInput}
              onChange={(e) => setTweakInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitTweak();
              }}
            />
            <button
              type="button"
              className="tweak-submit"
              onClick={submitTweak}
              disabled={tweakLoading}
            >
              {tweakLoading ? "..." : "Reimagine"}
            </button>
          </div>
          <div className={`tweak-result${tweakResult ? " visible" : ""}`}>
            {tweakResult && (
              <div className="tweak-result-card">
                <div className="tweak-result-label">Your Updated Style</div>
                <div className="tweak-result-name">{tweakResult.name}</div>
                <div className="tweak-result-text">{tweakResult.desc}</div>
                <div className="tweak-new-traits">
                  {tweakResult.traits.map((t) => (
                    <span key={t} className="tweak-new-trait">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="footer-strip">
          <div className="footer-text">
            <span className="sparkle">✦</span>
            Inspired by 2,847 rooms with similar fingerprints
            <span className="sparkle">✦</span>
          </div>
        </div>
      </div>
    </div>
  );
}
