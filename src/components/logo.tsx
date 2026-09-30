/**
 * Tapsihan brand mark — the shop's real logo artwork (gold roundel with
 * crossed fork & spoon, maroon ring) instead of a drawn placeholder.
 * Two raster files back these components:
 *   - logo-icon.png    square medallion only — used at small sizes and on
 *                       both light and dark surfaces (it's self-contained,
 *                       no text to lose contrast).
 *   - logo-lockup.png  medallion + "KUY'S TAPSIHAN" wordmark, with "KUY'S"
 *                       in white so the full lockup reads on the maroon
 *                       header too, not just on light/cream surfaces.
 * Plain <img> (not next/image's `fill` mode) so callers can keep passing
 * ordinary sizing classes like "h-11 w-11" or "h-24 w-auto" and get the
 * same auto-aspect-ratio behavior the old inline SVGs had.
 */

/** Icon-only mark: the medallion, cropped square. Works on any surface. */
export function LogoMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/assets/brand/logo-icon.png" alt="Tapsihan" className={className} />;
}

/** Full lockup: medallion + "KUY'S TAPSIHAN" wordmark. For login cards and
 *  any other wide, mostly-light spot where the whole wordmark fits. */
export function LogoStacked({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/assets/brand/logo-lockup.png" alt="Kuy's Tapsihan" className={className} />;
}

const MAROON = "#760000";
const GOLD = "#FFC800";

/**
 * Crest mark: gold seal with "KUY'S" arched over the top, a bold "K"
 * monogram at the center, and "TAPSIHAN" arched along the bottom — the
 * kiosk-only mark (utensils removed, replaced by the initial). Built as
 * two curved <textPath> arcs so it reads as a proper badge/seal instead
 * of stacked straight lines of text.
 */
export function LogoCrest({ className, color = MAROON }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="KUY'S TAPSIHAN">
      <defs>
        <path id="crest-arch-top" d="M 24 108 A 76 76 0 0 1 176 108" fill="none" />
        <path id="crest-arch-bottom" d="M 34 132 A 68 68 0 0 0 166 132" fill="none" />
      </defs>

      <circle cx={100} cy={100} r={92} fill={color} opacity={0.12} />
      <circle cx={100} cy={100} r={80} fill={GOLD} stroke={color} strokeWidth={4} />
      <circle cx={100} cy={100} r={70} fill="none" stroke={color} strokeWidth={1.5} opacity={0.5} />

      <text
        fontFamily="var(--font-display, serif)"
        fontWeight={800}
        fontSize={15}
        letterSpacing={3}
        fill={color}
      >
        <textPath href="#crest-arch-top" startOffset="50%" textAnchor="middle">
          KUY&apos;S
        </textPath>
      </text>

      <text
        x={100}
        y={122}
        textAnchor="middle"
        fontFamily="var(--font-display, serif)"
        fontWeight={900}
        fontSize={78}
        fill={color}
      >
        K
      </text>

      <text
        fontFamily="var(--font-display, serif)"
        fontWeight={800}
        fontSize={13}
        letterSpacing={2}
        fill={color}
      >
        <textPath href="#crest-arch-bottom" startOffset="50%" textAnchor="middle">
          TAPSIHAN
        </textPath>
      </text>
    </svg>
  );
}

/** Horizontal lockup for header bars: small mark + "Tapsihan" wordmark. */
export function LogoLockup({
  className = "",
  variant = "light",
}: {
  className?: string;
  variant?: "light" | "dark";
}) {
  const isLight = variant === "light"; // tuned for a maroon/dark background
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-9 w-9 shrink-0" />
      <div className="leading-none">
        <div
          className={`font-display text-lg font-extrabold tracking-wide ${
            isLight ? "text-rice-50" : "text-achuete-600"
          }`}
        >
          Tapsihan
        </div>
        <div
          className={`-mt-0.5 text-[10px] font-bold tracking-[0.25em] ${
            isLight ? "text-rice-50/80" : "text-charcoal-900/50"
          }`}
        >
          SMART ORDERING
        </div>
      </div>
    </div>
  );
}
