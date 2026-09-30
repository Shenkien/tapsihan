export default function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-charcoal-900">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-charcoal-900/60">{description}</p>}
      </div>
      {action}
    </div>
  );
}
