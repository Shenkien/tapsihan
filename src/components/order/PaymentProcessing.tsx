import { CreditCard } from "lucide-react";

export default function PaymentProcessing() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-rice-50 p-6 text-center text-charcoal-900">
      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-turmeric-500/20">
        <CreditCard size={44} className="animate-pulse text-achuete-600" />
      </span>
      <h2 className="font-display text-2xl font-extrabold text-leaf-900">Processing Payment...</h2>
      <p className="text-charcoal-900/70">Please wait</p>
      <div className="flex gap-2" aria-hidden>
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-achuete-600 [animation-delay:-0.3s]" />
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-achuete-600 [animation-delay:-0.15s]" />
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-achuete-600" />
      </div>
    </div>
  );
}
