// P01b — COVA wordmark. Single source of truth (P01b auth, P09 dashboard, P10 landing).
//
// Spec: phase doc §6 1B.
// - Uppercase tracked microtype (tracking-[0.4em]) "COVA" + gold em-dash beneath at 50% opacity.
// - align="left" (default): fixed top-left absolute.
// - align="center": in-flow.
// - Mobile: shrinks 16px → 14px on viewports < 400px (handled via Tailwind text-[12px] md:text-[16px]).

interface WordmarkProps {
  align?: "left" | "center";
}

export function Wordmark({ align = "left" }: WordmarkProps) {
  if (align === "center") {
    return (
      <div className="select-none flex flex-col items-center" aria-label="Cova">
        <div className="font-serif font-normal text-cova-ivory uppercase text-[14px] md:text-[16px] tracking-[0.4em]">
          COVA
        </div>
        <div
          className="font-sans text-[14px] text-cova-gold/50 mt-2 leading-none"
          aria-hidden="true"
        >
          —
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-10 top-6 left-6 md:top-8 md:left-10 select-none"
      aria-label="Cova"
    >
      <div className="font-serif font-normal text-cova-ivory uppercase text-[14px] md:text-[16px] tracking-[0.4em]">
        COVA
      </div>
      <div
        className="font-sans text-[14px] text-cova-gold/50 mt-2 leading-none"
        aria-hidden="true"
      >
        —
      </div>
    </div>
  );
}

export default Wordmark;
