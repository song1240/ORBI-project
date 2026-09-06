import { useMemo, useState } from 'react';
import { useListPilotSessions, getListPilotSessionsQueryKey } from '@workspace/api-client-react';
import { ArrowDown, ArrowUp, ChevronDown, Filter, Search, X } from 'lucide-react';
import { QueryState, Shell, PageHeading, formatMoney, formatTokens } from '@/components/model-pilot';
import { useLanguage } from '@/lib/i18n';

export default function SessionsPage() {
  const { language, tr } = useLanguage();
  const sessions = useListPilotSessions({ query: { queryKey: getListPilotSessionsQueryKey() } });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'date' | 'cost' | 'tokens'>('date');
  const [direction, setDirection] = useState<'up' | 'down'>('down');
  const [filter, setFilter] = useState('all');
  const items = useMemo(() => {
    const filtered = (sessions.data ?? []).filter(item => {
      const matchesQuery = `${item.project} ${item.task} ${item.model}`.toLowerCase().includes(query.toLowerCase());
      const matchesFilter = filter === 'all' || item.recommendation.toLowerCase().includes(filter);
      return matchesQuery && matchesFilter;
    });
    return filtered.sort((a, b) => {
      const av = sort === 'cost' ? a.cost : sort === 'tokens' ? a.actualTokens : new Date(a.date).getTime();
      const bv = sort === 'cost' ? b.cost : sort === 'tokens' ? b.actualTokens : new Date(b.date).getTime();
      return direction === 'down' ? Number(bv) - Number(av) : Number(av) - Number(bv);
    });
  }, [sessions.data, query, filter, sort, direction]);
  const changeSort = (value: 'date' | 'cost' | 'tokens') => { if (sort === value) setDirection(direction === 'down' ? 'up' : 'down'); else { setSort(value); setDirection('down'); } };
  return <Shell>
    <PageHeading eyebrow={tr('work history', '작업 기록')} title={tr('Session history', '세션 기록')} description={tr("A searchable record of the pilot's calls, predictions, and model decisions.", '파일럿의 호출, 예측, 모델 판단 기록을 검색할 수 있습니다.')} action={<div className="mono hidden rounded-md border border-border bg-card px-3 py-2 text-[10px] text-muted-foreground sm:block">{tr('local archive', '로컬 기록')} · {sessions.data?.length ?? 0} {tr('sessions', '개 세션')}</div>} />
    {sessions.isLoading ? <QueryState type="loading" /> : sessions.isError ? <QueryState type="error" onRetry={() => sessions.refetch()} /> : !sessions.data?.length ? <QueryState type="empty" /> : <div className="panel overflow-hidden rounded-xl">
      <div className="flex flex-col gap-3 border-b border-border/70 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-sm"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={tr('Search project, task, or model', '프로젝트, 작업 또는 모델 검색')} className="h-9 w-full rounded-md border border-border bg-background/55 pl-9 pr-8 text-xs text-slate-200 outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60" data-testid="input-search-sessions" />{query && <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-slate-200" data-testid="button-clear-search"><X size={13} /></button>}</div>
        <div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-1 rounded-md border border-border bg-background/45 p-1"><span className="px-2 text-[10px] text-muted-foreground"><Filter size={12} /></span>{['all', 'upgrade', 'watch'].map(value => <button key={value} onClick={() => setFilter(value)} className={`rounded px-2 py-1.5 text-[10px] capitalize transition-colors ${filter === value ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-slate-200'}`} data-testid={`button-filter-${value}`}>{language === 'ko' ? ({ all: '전체', upgrade: '업그레이드', watch: '주의' }[value]) : value}</button>)}</div><span className="mono ml-1 text-[10px] text-muted-foreground">{items.length} {tr('shown', '개 표시')}</span></div>
      </div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[800px] text-left"><thead className="border-b border-border/70 bg-secondary/30"><tr><Header label={tr('session', '세션')} /><Header label={tr('model', '모델')} /><Header label={tr('tokens', '토큰')} sortKey="tokens" active={sort} direction={direction} onSort={changeSort} /><Header label={tr('cost', '비용')} sortKey="cost" active={sort} direction={direction} onSort={changeSort} /><Header label={tr('complexity', '복잡도')} /><Header label={tr('recommendation', '추천')} /></tr></thead><tbody className="divide-y divide-border/60">{items.map(item => <SessionRow key={item.id} item={item} language={language} />)}</tbody></table></div>
      <div className="divide-y divide-border/60 md:hidden">{items.map(item => <MobileSessionRow key={item.id} item={item} language={language} />)}</div>
      {!items.length && <div className="p-12 text-center text-sm text-muted-foreground">{tr('No sessions match these filters.', '조건에 맞는 세션이 없습니다.')}</div>}
    </div>}
  </Shell>;
}

function Header({ label, sortKey, active, direction, onSort }: { label: string; sortKey?: 'date' | 'cost' | 'tokens'; active?: string; direction?: 'up' | 'down'; onSort?: (value: 'date' | 'cost' | 'tokens') => void }) {
  return <th className="px-5 py-3.5"><button disabled={!sortKey} onClick={() => sortKey && onSort?.(sortKey)} className={`inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[.12em] ${sortKey ? 'text-muted-foreground hover:text-slate-200' : 'text-muted-foreground'}`} data-testid={sortKey ? `button-sort-${sortKey}` : `header-${label}`}>{label}{sortKey && (active === sortKey ? direction === 'down' ? <ArrowDown size={12} /> : <ArrowUp size={12} /> : <ChevronDown size={12} className="opacity-40" />)}</button></th>;
}
function SessionRow({ item, language }: { item: any; language: 'ko' | 'en' }) {
  const rec = item.recommendation.toLowerCase(); const tone = rec.includes('upgrade') || rec.includes('switch') ? 'accent' : rec.includes('watch') ? 'danger' : 'primary';
  return <tr className="group transition-colors hover:bg-secondary/35" data-testid={`row-session-${item.id}`}><td className="px-5 py-4"><div className="text-xs font-semibold text-slate-200">{item.project}</div><div className="mt-1 max-w-[260px] truncate text-[11px] text-muted-foreground">{item.task}</div><div className="mono mt-1 text-[10px] text-muted-foreground">{new Date(item.date).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div></td><td className="px-5 py-4"><span className="mono text-xs text-slate-300">{item.model}</span></td><td className="px-5 py-4"><div className="mono text-xs text-slate-200">{formatTokens(item.actualTokens)}</div><div className="mt-1 text-[10px] text-muted-foreground">{formatTokens(item.predictedTokens.min)}–{formatTokens(item.predictedTokens.max)} {language === 'ko' ? '예측' : 'pred.'}</div></td><td className="px-5 py-4 mono text-xs text-slate-200">{formatMoney(item.cost)}</td><td className="px-5 py-4"><div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${item.complexity}%` }} /></div><span className="mono text-[10px] text-muted-foreground">{item.complexity}</span></div></td><td className="px-5 py-4"><span className={`inline-flex rounded-md border px-2 py-1 text-[10px] ${tone === 'accent' ? 'border-accent/25 bg-accent/10 text-accent' : tone === 'danger' ? 'border-destructive/25 bg-destructive/10 text-destructive' : 'border-primary/25 bg-primary/10 text-primary'}`}>{language === 'ko' ? (rec.includes('upgrade') ? '업그레이드' : rec.includes('watch') ? '주의' : '유지') : item.recommendation}</span></td></tr>;
}
function MobileSessionRow({ item, language }: { item: any; language: 'ko' | 'en' }) { return <div className="p-4" data-testid={`card-session-${item.id}`}><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-200">{item.project}</div><div className="mt-1 text-xs text-muted-foreground">{item.task}</div></div><span className="mono text-[10px] text-primary">{item.recommendation}</span></div><div className="mt-4 grid grid-cols-3 gap-2"><div><div className="mono text-[9px] uppercase text-muted-foreground">{language === 'ko' ? '토큰' : 'tokens'}</div><div className="mono mt-1 text-xs">{formatTokens(item.actualTokens)}</div></div><div><div className="mono text-[9px] uppercase text-muted-foreground">{language === 'ko' ? '비용' : 'cost'}</div><div className="mono mt-1 text-xs">{formatMoney(item.cost)}</div></div><div><div className="mono text-[9px] uppercase text-muted-foreground">{language === 'ko' ? '복잡도' : 'complexity'}</div><div className="mono mt-1 text-xs">{item.complexity}</div></div></div></div>; }