// One colour per kind of action, used by every small icon button in the admin
// and staff screens, so the same colour always means the same thing:
//   blue = edit / rename      red = delete / remove / decline
//   green = save / restock / turn on       gray = cancel / close
//   amber = reset password / deduct        orange = deactivate
// The icon buttons also carry a `title`, so hovering (or long-pressing) shows
// what each one does. Class names are written out in full so Tailwind can
// see and generate them.
export type ActionTone =
  | "edit"
  | "delete"
  | "save"
  | "cancel"
  | "key"
  | "deactivate"
  | "activate"
  | "restock"
  | "deduct";

const TONE_CLASSES: Record<ActionTone, string> = {
  edit: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
  delete: "border-red-200 bg-[#fbe4e1] text-danger hover:bg-red-200",
  save: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  cancel: "border-border bg-white text-charcoal-900/60 hover:bg-rice-100 hover:text-charcoal-900",
  key: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  deactivate: "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100",
  activate: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  restock: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  deduct: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
};

/** Classes for a small square icon button. `pad` is the padding utility. */
export function actionBtn(tone: ActionTone, pad = "p-2"): string {
  return `inline-flex items-center justify-center rounded-lg border ${pad} transition disabled:opacity-40 ${TONE_CLASSES[tone]}`;
}

/** Classes for the Active / Inactive pill toggles on Categories and Units. */
export function activePill(active: boolean): string {
  return `rounded-full border px-3 py-1 text-xs font-bold transition ${
    active
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
      : "border-border bg-rice-100 text-charcoal-900/50 hover:bg-rice-100"
  }`;
}
