// Torn-paper bottom edge, shared by every screen that transitions from a
// solid brand-colored band into a lighter surface below (kiosk welcome
// screen, order-confirmation banner, category picker header). `color`
// should match the surface underneath (e.g. text-rice-50, text-white).
export default function TornEdge({ className = "", color = "text-rice-50" }: { className?: string; color?: string }) {
  return (
    <svg
      className={`absolute -bottom-px left-0 h-6 w-full ${color} ${className}`}
      viewBox="0 0 100 6"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M0,6 L0,3 L4,0 L8,3 L12,0 L16,3 L20,0 L24,3 L28,0 L32,3 L36,0 L40,3 L44,0 L48,3 L52,0 L56,3 L60,0 L64,3 L68,0 L72,3 L76,0 L80,3 L84,0 L88,3 L92,0 L96,3 L100,0 L100,6 Z"
      />
    </svg>
  );
}
