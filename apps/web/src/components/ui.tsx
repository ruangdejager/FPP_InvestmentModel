import type { ReactNode } from 'react';

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`print-block rounded-xl border border-line bg-surface shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div>
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

export type Tone = 'pass' | 'caution' | 'fail' | 'neutral' | 'accent';

const TONE_CLASSES: Record<Tone, string> = {
  pass: 'bg-pass-soft text-pass border-pass/30',
  caution: 'bg-caution-soft text-caution border-caution/30',
  fail: 'bg-fail-soft text-fail border-fail/30',
  neutral: 'bg-canvas text-ink-soft border-line',
  accent: 'bg-accent-soft text-accent border-accent/30',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  size = 'normal',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  size?: 'normal' | 'large';
}) {
  const toneText =
    tone === 'pass' ? 'text-pass' : tone === 'fail' ? 'text-fail' : tone === 'caution' ? 'text-caution' : 'text-ink';
  return (
    <div className="print-block">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</div>
      <div className={`tabular mt-1 font-semibold ${toneText} ${size === 'large' ? 'text-3xl sm:text-4xl' : 'text-xl'}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs leading-snug text-ink-soft">{hint}</div>}
    </div>
  );
}

export function Warning({ tone = 'fail', title, children }: { tone?: Tone; title: ReactNode; children?: ReactNode }) {
  return (
    <div className={`print-block rounded-lg border px-4 py-3 ${TONE_CLASSES[tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm">{children}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

const INPUT_CLASS =
  'mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT_CLASS} ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${INPUT_CLASS} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${INPUT_CLASS} ${props.className ?? ''}`} />;
}

export function Button({
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent/90',
    secondary: 'border border-line bg-surface text-ink hover:bg-canvas',
    danger: 'border border-fail/30 bg-fail-soft text-fail hover:bg-fail/10',
    ghost: 'text-accent hover:underline',
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${props.className ?? ''}`}
    />
  );
}

/**
 * An evidence marker.
 *
 * A verdict built on a guess must not look as confident as one built on twelve
 * months of manager data, so every input that drives a verdict carries one of
 * these and the verdict page counts them.
 */
export function EvidenceMark({ evidenced, note }: { evidenced: boolean; note?: string | null }) {
  return (
    <span
      title={note ?? (evidenced ? 'Backed by evidence.' : 'This is an assumption, not evidence.')}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        evidenced ? TONE_CLASSES.pass : TONE_CLASSES.caution
      }`}
    >
      {evidenced ? 'Evidenced' : 'Assumed'}
    </span>
  );
}

export function Spinner({ label = 'Working' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-ink-soft">
      <span className="h-3 w-3 animate-pulse rounded-full bg-accent" aria-hidden />
      {label}…
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return <Warning title="That did not work">{message}</Warning>;
}

export function Table({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className={`tabular w-full min-w-[32rem] border-collapse text-sm ${className}`}>{children}</table>
    </div>
  );
}

// Written out rather than interpolated, because Tailwind only ships the classes
// it can see in the source.
const ALIGN: Record<'left' | 'right' | 'center', string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function Th({ children, align = 'left' }: { children?: ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={`border-b border-line px-2 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft ${ALIGN[align]}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return <td className={`border-b border-line/60 px-2 py-2 ${ALIGN[align]} ${className}`}>{children}</td>;
}

/** Expands an acronym on hover, as the glossary requires. */
export function Abbr({ term, expansion }: { term: string; expansion: string }) {
  return (
    <abbr title={expansion} className="cursor-help border-b border-dotted border-ink-soft no-underline">
      {term}
    </abbr>
  );
}
