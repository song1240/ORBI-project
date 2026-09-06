import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  Cpu,
  Database,
  Gauge,
  GitBranch,
  History,
  Info,
  Layers3,
  LifeBuoy,
  Menu,
  MoreHorizontal,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { getHealthCheckQueryKey, useHealthCheck } from '@workspace/api-client-react';

export function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

export function timeAgo(value: string) {
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function StatusDot({ tone = 'good', pulse = false }: { tone?: 'good' | 'warn' | 'bad' | 'muted'; pulse?: boolean }) {
  const color = tone === 'good' ? 'bg-primary' : tone === 'warn' ? 'bg-accent' : tone === 'bad' ? 'bg-destructive' : 'bg-muted-foreground';
  return <span className={`inline-block h-2 w-2 rounded-full ${color} ${pulse ? 'pulse-dot' : ''}`} />;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 15000 } });
  const bridgeTone = health.isLoading ? 'muted' : health.isError ? 'bad' : 'good';
  const active = location === '/' ? '/' : location;
  const nav = [
    { href: '/', label: 'Live session', icon: Activity, testId: 'link-live-session' },
    { href: '/sessions', label: 'Session history', icon: History, testId: 'link-session-history' },
    { href: '/settings', label: 'Pilot settings', icon: SlidersHorizontal, testId: 'link-pilot-settings' },
  ];
  return (
    <div className="noise min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
              <CrosshairMark />
            </span>
            <span>
              <span className="block text-[15px] font-bold tracking-tight text-slate-100">model pilot</span>
              <span className="mono block text-[9px] uppercase tracking-[.18em] text-muted-foreground">local intelligence</span>
            </span>
          </Link>
          <button onClick={() => setMobileOpen(false)} className="rounded-md p-2 text-muted-foreground hover:bg-sidebar-accent md:hidden" data-testid="button-close-menu"><X size={17} /></button>
        </div>
        <div className="mt-8 px-2">
          <div className="mono mb-3 text-[10px] uppercase tracking-[.2em] text-muted-foreground">workspace</div>
          <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/45 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200"><StatusDot tone={bridgeTone} pulse={bridgeTone === 'good'} /> {health.isError ? 'bridge unavailable' : 'connected locally'}</div>
            <div className="mono mt-2 text-[10px] text-muted-foreground">127.0.0.1 : 4317</div>
          </div>
        </div>
        <nav className="mt-8 space-y-1" aria-label="Main navigation">
          <div className="mono mb-3 px-2 text-[10px] uppercase tracking-[.2em] text-muted-foreground">pilot console</div>
          {nav.map(({ href, label, icon: Icon, testId }) => {
            const isActive = active === href;
            return (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)} data-testid={testId} className={`group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-slate-100'}`}>
                <span className="flex items-center gap-3"><Icon size={17} strokeWidth={1.8} /><span>{label}</span></span>
                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-1 border-t border-sidebar-border pt-4">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-slate-100" data-testid="button-help"><LifeBuoy size={17} strokeWidth={1.8} /> Help & docs</button>
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-sidebar-accent/55 px-3 py-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent">MP</div>
            <div className="min-w-0"><div className="truncate text-xs font-semibold text-slate-200">local operator</div><div className="mono text-[10px] text-muted-foreground">no account required</div></div>
            <MoreHorizontal size={15} className="ml-auto text-muted-foreground" />
          </div>
        </div>
      </aside>
      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/55 md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-overlay-menu" />}
      <main className="min-h-[100dvh] md:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-xl md:px-9">
          <button onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-muted-foreground hover:bg-secondary md:hidden" data-testid="button-open-menu"><Menu size={20} /></button>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="mono text-[10px] uppercase tracking-[.16em]">pilot console</span><ChevronRight size={13} /><span className="text-slate-300">{location === '/' ? 'live session' : location.slice(1)}</span></div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:flex"><StatusDot tone={bridgeTone} pulse={bridgeTone === 'good'} /><span>{health.isError ? 'agent bridge offline' : 'agent bridge online'}</span></div>
            <button className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-slate-100" data-testid="button-notifications"><Bell size={17} /></button>
          </div>
        </header>
        <div className="mx-auto max-w-[1480px] px-5 py-7 md:px-9 md:py-9">{children}</div>
      </main>
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
    <div><div className="mono mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[.2em] text-primary"><span className="h-px w-4 bg-primary" />{eyebrow}</div><h1 className="text-2xl font-bold tracking-[-.035em] text-slate-100 md:text-[30px]">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>
    {action}
  </div>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`relative overflow-hidden rounded-md bg-secondary ${className}`}><span className="absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/[.06] to-transparent animate-[sweep_1.5s_ease-in-out_infinite]" /></div>;
}

export function QueryState({ type, onRetry }: { type: 'loading' | 'error' | 'empty'; onRetry?: () => void }) {
  if (type === 'loading') return <div className="space-y-4"><Skeleton className="h-40 w-full" /><div className="grid grid-cols-2 gap-4"><Skeleton className="h-24" /><Skeleton className="h-24" /></div></div>;
  if (type === 'empty') return <div className="panel flex min-h-[260px] flex-col items-center justify-center rounded-xl p-8 text-center"><div className="mb-4 grid h-12 w-12 place-items-center rounded-full border border-border bg-secondary text-muted-foreground"><Database size={20} /></div><h3 className="font-semibold text-slate-200">No sessions recorded yet</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Finish a coding session with the local bridge and its decision trail will appear here.</p></div>;
  return <div className="panel flex min-h-[240px] flex-col items-center justify-center rounded-xl p-8 text-center"><div className="mb-4 grid h-12 w-12 place-items-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive"><AlertTriangle size={20} /></div><h3 className="font-semibold text-slate-200">The pilot bridge is unreachable</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Check that the local service is running, then try again.</p>{onRetry && <button onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-secondary/80" data-testid="button-retry-query"><RefreshCw size={14} /> Retry connection</button>}</div>;
}

export function Metric({ label, value, detail, icon: Icon, tone = 'default' }: { label: string; value: string; detail?: string; icon: React.ElementType; tone?: 'default' | 'primary' | 'accent' | 'danger' }) {
  const color = tone === 'primary' ? 'text-primary' : tone === 'accent' ? 'text-accent' : tone === 'danger' ? 'text-destructive' : 'text-slate-100';
  return <div className="panel rounded-xl p-4 transition-transform duration-200 hover:-translate-y-0.5"><div className="mb-4 flex items-center justify-between"><span className="mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">{label}</span><Icon size={16} className={tone === 'default' ? 'text-muted-foreground' : color} /></div><div className={`mono text-2xl font-medium tracking-[-.04em] ${color}`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</div>{detail && <div className="mt-2 text-[11px] text-muted-foreground">{detail}</div>}</div>;
}

export function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return <div className="mb-3 flex items-center justify-between"><h2 className="mono text-[10px] font-medium uppercase tracking-[.18em] text-muted-foreground">{children}</h2>{action}</div>;
}

export function ContextMeter({ used, limit, warning = .7, critical = .88 }: { used: number; limit: number; warning?: number; critical?: number }) {
  const ratio = limit ? used / limit : 0;
  const tone = ratio >= critical ? 'danger' : ratio >= warning ? 'accent' : 'primary';
  const bar = tone === 'danger' ? 'bg-destructive' : tone === 'accent' ? 'bg-accent' : 'bg-primary';
  return <div data-testid="meter-context">
    <div className="mb-2 flex items-end justify-between"><div><span className="mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">context window</span><div className="mt-1 mono text-xl text-slate-100">{Math.round(ratio * 100)}<span className="text-sm text-muted-foreground">%</span></div></div><div className="text-right mono text-[10px] text-muted-foreground">{formatTokens(used)} / {formatTokens(limit)} tokens</div></div>
    <div className="relative h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full transition-[width] duration-700 ${bar}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
    <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${bar}`} />{ratio >= critical ? 'critical headroom' : ratio >= warning ? 'watch headroom' : 'healthy headroom'}</span><span>limit {formatTokens(limit)}</span></div>
  </div>;
}

export function RecommendationCard({ recommendation }: { recommendation: { action: string; title: string; reason: string; currentFit: number; recommendedFit: number; recommendedModel?: string | null } }) {
  const isUpgrade = recommendation.action.toLowerCase().includes('upgrade') || recommendation.action.toLowerCase().includes('switch');
  const isWatch = recommendation.action.toLowerCase().includes('watch') || recommendation.action.toLowerCase().includes('context');
  const color = isUpgrade ? 'accent' : isWatch ? 'accent' : 'primary';
  return <div className={`relative overflow-hidden rounded-xl border ${color === 'primary' ? 'border-primary/25 bg-primary/[.055]' : 'border-accent/25 bg-accent/[.055]'} p-5`} data-testid="card-recommendation">
    <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-primary/10 blur-3xl" />
    <div className="relative"><div className="flex items-start justify-between gap-4"><div><div className={`mono mb-2 text-[10px] uppercase tracking-[.18em] ${color === 'primary' ? 'text-primary' : 'text-accent'}`}>pilot recommendation</div><h2 className="text-lg font-semibold tracking-tight text-slate-100">{recommendation.title}</h2></div><div className={`rounded-md border px-2 py-1 mono text-[10px] uppercase tracking-wider ${color === 'primary' ? 'border-primary/30 text-primary' : 'border-accent/30 text-accent'}`}>{recommendation.action}</div></div><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{recommendation.reason}</p><div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-white/[.08] pt-4"><div><div className="mono text-[10px] uppercase text-muted-foreground">current fit</div><div className="mt-1 mono text-lg text-slate-100">{recommendation.currentFit}<span className="ml-1 text-xs text-muted-foreground">/ 100</span></div></div><ArrowUpRight size={16} className="text-muted-foreground" /><div><div className="mono text-[10px] uppercase text-muted-foreground">recommended fit</div><div className={`mt-1 mono text-lg ${color === 'primary' ? 'text-primary' : 'text-accent'}`}>{recommendation.recommendedFit}<span className="ml-1 text-xs text-muted-foreground">/ 100</span></div></div>{recommendation.recommendedModel && <><div className="h-7 w-px bg-border" /><div><div className="mono text-[10px] uppercase text-muted-foreground">consider</div><div className="mt-1 mono text-sm text-slate-200">{recommendation.recommendedModel}</div></div></>}</div></div>
  </div>;
}

export function Sparkline({ values, color = 'primary' }: { values: number[]; color?: 'primary' | 'accent' }) {
  const points = useMemo(() => {
    if (!values.length) return '';
    const min = Math.min(...values); const max = Math.max(...values); const spread = max - min || 1;
    return values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * 100},${34 - ((v - min) / spread) * 27}`).join(' ');
  }, [values]);
  return <svg viewBox="0 0 100 38" preserveAspectRatio="none" className="h-10 w-full overflow-visible"><polyline points={points} fill="none" stroke={color === 'primary' ? 'hsl(165 75% 52%)' : 'hsl(42 93% 62%)'} strokeWidth="1.8" vectorEffect="non-scaling-stroke" /></svg>;
}

export function CrosshairMark() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><path d="m8.8 8.8 6.4 6.4M15.2 8.8l-6.4 6.4" opacity=".45" /></svg>;
}

export function LiveHeader({ project, branch, connection, updatedAt, onRefresh, refreshing }: { project: string; branch: string; connection: string; updatedAt: string; onRefresh: () => void; refreshing?: boolean }) {
  return <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><div className="mono mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[.2em] text-primary"><StatusDot pulse />live telemetry</div><h1 className="text-2xl font-bold tracking-[-.035em] text-slate-100 md:text-[30px]">{project}</h1><div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><GitBranch size={13} className="text-primary" />{branch}</span><span className="h-3 w-px bg-border" /><span className="inline-flex items-center gap-1.5"><Wifi size={13} className="text-primary" />{connection}</span><span className="h-3 w-px bg-border" /><span className="mono">updated {timeAgo(updatedAt)}</span></div></div><button onClick={onRefresh} disabled={refreshing} className="inline-flex items-center justify-center gap-2 self-start rounded-md border border-border bg-secondary px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-secondary/80 disabled:opacity-60 lg:self-auto" data-testid="button-refresh-live"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh snapshot</button></div>;
}

export function ActivityRow({ item }: { item: { id: string; label: string; detail: string; timestamp: string; kind: string } }) {
  const icon = item.kind.toLowerCase().includes('tool') ? Terminal : item.kind.toLowerCase().includes('model') ? Cpu : item.kind.toLowerCase().includes('file') ? Code2 : Check;
  const Icon = icon;
  return <div className="flex items-start gap-3 py-3" data-testid={`activity-row-${item.id}`}><div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-secondary text-muted-foreground"><Icon size={13} /></div><div className="min-w-0 flex-1"><div className="text-xs text-slate-300">{item.label}</div><div className="mt-1 text-[11px] text-muted-foreground">{item.detail}</div></div><div className="mono shrink-0 text-[10px] text-muted-foreground">{timeAgo(item.timestamp)}</div></div>;
}