import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { EB_Garamond } from "next/font/google";
import { toCovaKeyDisplayName } from "@/lib/ai/anchor-display";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { ManifestoReveal } from "@/components/landing/ManifestoReveal";
import { PinnedBar } from "@/components/landing/PinnedBar";
import { Scene } from "@/components/landing/Scene";
import s from "@/components/landing/landing.module.css";

// The root layout loads EB Garamond upright only; the landing page leans on
// true italics for its editorial moments, so it loads both styles here.
const serif = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-landing-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cova — Every room has another life in it",
  description:
    "Show Cova the room you have. It learns your taste, redesigns the room around it and your budget, and lets you shop every piece in the picture.",
};

const START = "/auth";

// Real Cova redesigns of real rooms (docs/gallery bench run). Style blends
// are the archetype weights each render was generated with; labels go
// through the display-name map so no internal style name reaches the page
// (CLAUDE.md rule 8).
const SCENES = [
  {
    act: "Scene one",
    title: ["The quiet", "bedroom"],
    styleKey: "COVAJAPANDI",
    weight: 85,
    brief: "Linen in oatmeal, pale timber, soft lamplight, one green branch. Somewhere to actually rest.",
    after: { src: "/landing/r01.webp", alt: "A bedroom redesigned by Cova: pale timber bed, oatmeal linen and paired lamps", position: "50% 60%" },
    before: { src: "/landing/o01.webp", alt: "The same bedroom before the redesign" },
    align: "left" as const,
  },
  {
    act: "Scene two",
    title: ["The loft,", "finally"],
    styleKey: "COVAINDUSTRIAL",
    weight: 80,
    brief: "Exposed brick, a wall of records and books, Edison pendants. The attic I always meant to fix.",
    after: { src: "/landing/r04.webp", alt: "An attic living room redesigned by Cova with exposed brick, a leather sofa and open shelving", position: "50% 50%" },
    before: { src: "/landing/o04.webp", alt: "The same attic room before the redesign" },
    align: "right" as const,
  },
  {
    act: "Scene three",
    title: ["The study"],
    styleKey: "COVAMIDCENTURY",
    weight: 85,
    brief: "A lounge chair in the corner, walnut everywhere, warm tungsten light by the window.",
    after: { src: "/landing/r08.webp", alt: "A bay-window study redesigned by Cova with a walnut desk and leather lounge chair", position: "50% 50%" },
    before: { src: "/landing/o08.webp", alt: "The same room before the redesign" },
    align: "left" as const,
  },
];

const MANIFESTO: { text: string; accent?: boolean }[] = [
  ..."Not a filter. Not a catalog.".split(" ").map((text) => ({ text })),
  { text: "Your", accent: true },
  { text: "walls," },
  { text: "your", accent: true },
  { text: "windows," },
  { text: "your", accent: true },
  ..."light — redesigned around the way you actually live, and every piece in it ready to bring home."
    .split(" ")
    .map((text) => ({ text })),
];

function Cta({ children, small = false }: { children: string; small?: boolean }) {
  return (
    <Link href={START} className={small ? `${s.cta} ${s.ctaSmall}` : s.cta}>
      <span>{children}</span> →
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className={`${s.root} ${serif.variable}`}>
      <LandingHeader>
        <Link href="/" className={`${s.mark} ${s.micro}`} aria-label="Cova home">
          COVA
          <i aria-hidden="true" />
        </Link>
        <Cta small>Begin</Cta>
      </LandingHeader>

      <main>
        <section className={s.hero}>
          <Image
            src="/landing/r06.webp"
            alt="A bay-window living room redesigned by Cova: linen sofa, rattan chair and tall plants in soft daylight"
            fill
            priority
            sizes="100vw"
            className={s.heroImg}
          />
          <div className={s.heroCopy}>
            <h1 className={s.heroTitle}>
              Every room
              <br />
              has another
              <br />
              <em>life in it.</em>
            </h1>
            <div className={s.heroSide}>
              <div className={s.micro}>Cova — AI interior design</div>
              <p className={s.heroLede}>
                Show us the room you have. We&apos;ll show you the one it could be — then help you build
                it, piece by piece.
              </p>
              <Cta>Design my room</Cta>
            </div>
          </div>
        </section>

        <section className={s.manifesto} aria-label="The idea">
          <span className={s.micro}>The idea</span>
          <ManifestoReveal words={MANIFESTO} />
        </section>

        {SCENES.map((scene) => (
          <Scene
            key={scene.styleKey}
            align={scene.align}
            media={
              <Image
                src={scene.after.src}
                alt={scene.after.alt}
                fill
                sizes="100vw"
                className={s.sceneImg}
                style={{ objectPosition: scene.after.position }}
              />
            }
          >
            <div className={s.act}>{scene.act}</div>
            <h2 className={s.sceneTitle}>
              {scene.title.map((line, i) => (
                <span key={line}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </h2>
            <div className={s.blend}>
              <span className={s.micro}>{toCovaKeyDisplayName(scene.styleKey)}</span>
              <div className={s.bar} aria-hidden="true">
                <i style={{ width: `${scene.weight}%` }} />
              </div>
              <span className={`${s.micro} ${s.gold}`}>{scene.weight}%</span>
            </div>
            <div className={`${s.micro} ${s.briefLabel}`}>The brief</div>
            <blockquote className={s.brief}>{scene.brief}</blockquote>
            <div className={s.before}>
              <Image
                src={scene.before.src}
                alt={scene.before.alt}
                width={120}
                height={90}
                className={s.beforeImg}
              />
              <span className={s.micro}>Where it began</span>
            </div>
          </Scene>
        ))}

        <section className={s.how} id="how-it-works">
          <div className={s.howLead}>
            <h2 className={s.howTitle}>
              Three moves.
              <br />
              <em>One room that&apos;s yours.</em>
            </h2>
            <Cta>Begin</Cta>
          </div>
          <div className={s.col}>
            <div className={s.numeral} aria-hidden="true">
              i
            </div>
            <h3>Show us your taste</h3>
            <p>
              A short visual quiz — pick rooms, choose between pairs. Cova builds a style fingerprint
              from what draws you in.
            </p>
          </div>
          <div className={s.col}>
            <div className={s.numeral} aria-hidden="true">
              ii
            </div>
            <h3>Show us your room</h3>
            <p>
              One photo. Tap what stays — Cova keeps those pieces exactly and redesigns everything
              around them, to your budget.
            </p>
          </div>
          <div className={s.col}>
            <div className={s.numeral} aria-hidden="true">
              iii
            </div>
            <h3>Bring it home</h3>
            <p>
              Every piece in your render is matched to a real product from retailers like Amazon, IKEA
              and CB2. Tap to shop.
            </p>
          </div>
        </section>

        <section className={s.final} id="begin">
          <Image src="/landing/r07.webp" alt="" fill sizes="100vw" className={s.finalImg} />
          <div className={s.finalInner}>
            <div className={`${s.micro} ${s.gold}`}>Your turn</div>
            <h2 className={s.finalTitle}>
              What&apos;s your room
              <br />
              <em>waiting to become?</em>
            </h2>
            <Cta>Design my room</Cta>
          </div>
        </section>
      </main>

      <PinnedBar href={START} />

      <footer className={`${s.footer} ${s.micro}`}>
        <span>COVA — {new Date().getFullYear()}</span>
        <span className={s.footerLinks}>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </span>
        <span className={s.footerFin}>Your room. Reimagined.</span>
      </footer>
    </div>
  );
}
