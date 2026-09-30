// Vertical torn-paper edge for the right border of the admin sidebar —
// same jagged-receipt motif as order/TornEdge.tsx (rotated 90°), so the
// solid maroon sidebar reads as torn paper bleeding into the lighter
// content area beside it. `color` should match the sidebar's own
// background (e.g. text-achuete-700) since the shape is filled with
// currentColor.
export default function SidebarTornEdge({
  className = "",
  color = "text-achuete-700",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      className={`pointer-events-none absolute -right-2.5 top-0 h-full w-3 ${color} ${className}`}
      viewBox="0 0 6 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M0,0 L3,0 L6,4 L3,8 L6,12 L3,16 L6,20 L3,24 L6,28 L3,32 L6,36 L3,40 L6,44 L3,48 L6,52 L3,56 L6,60 L3,64 L6,68 L3,72 L6,76 L3,80 L6,84 L3,88 L6,92 L3,96 L6,100 L0,100 Z"
      />
    </svg>
  );
}
