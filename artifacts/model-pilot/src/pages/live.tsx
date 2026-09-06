import { useGetPilotLive, getGetPilotLiveQueryKey } from '@workspace/api-client-react';
import { Clock3, Code2, Gauge, Layers3, Sparkles, Zap } from 'lucide-react';
import { QueryState, Shell, LiveHeader, Metric, SectionLabel, ContextMeter, RecommendationCard, ActivityRow, formatMoney, formatTokens, Sparkline } from '@/components/model-pilot';
import { useLanguage } from '@/lib/i18n';

export default function LivePage() {
  const { tr } = useLanguage();
  const live = useGetPilotLive({ query: { queryKey: getGetPilotLiveQueryKey(), refetchInterval: 7000 } });
  if (live.isLoading) return <Shell><div className="space-y-6"><div><div className="h-3 w-24 animate-pulse rounded bg-secondary" /><div className="mt-4 h-9 w-64 animate-pulse rounded bg-secondary" /></div><QueryState type="loading" /></div></Shell>;
  if (live.isError || !live.data) return <Shell><QueryState type="error" onRetry={() => live.refetch()} /></Shell>;
  const snapshot = live.data;
  return <Shell>
    <LiveHeader project={snapshot.project} branch={snapshot.branch} connection={snapshot.connection} updatedAt={snapshot.updatedAt} onRefresh={() => live.refetch()} refreshing={live.isFetching} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
       <Metric label={tr('current model', '현재 모델')} value={snapshot.model} detail={`${snapshot.modelTier} ${tr('tier', '등급')}`} icon={Sparkles} tone="primary" />
       <Metric label={tr('session cost', '세션 비용')} value={formatMoney(snapshot.sessionCost)} detail={`${formatTokens(snapshot.tokenEstimate.min)}–${formatTokens(snapshot.tokenEstimate.max)} ${tr('est. tokens', '예상 토큰')}`} icon={Gauge} />
       <Metric label={tr('complexity', '복잡도')} value={`${snapshot.complexityScore} / 100`} detail={`${snapshot.complexityLevel} · ${snapshot.taskType}`} icon={Layers3} tone={snapshot.complexityScore > 75 ? 'accent' : 'default'} />
       <Metric label={tr('modified files', '변경 파일')} value={`${snapshot.modifiedFiles ?? 0}`} detail={`${snapshot.expectedToolCalls} ${tr('expected tool calls', '예상 도구 호출')}`} icon={Code2} />
    </div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.8fr)]">
      <div className="space-y-6">
        <RecommendationCard recommendation={snapshot.recommendation} />
        <div className="panel rounded-xl p-5">
           <SectionLabel action={<span className="mono text-[10px] text-muted-foreground">{tr('current task', '현재 작업')}</span>}>{tr('decision inputs', '판단 입력값')}</SectionLabel>
          <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
             <div><h2 className="text-base font-semibold leading-6 text-slate-100">{snapshot.task}</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><DataPair label={tr('task type', '작업 유형')} value={snapshot.taskType} /><DataPair label={tr('reasoning', '추론 수준')} value={snapshot.reasoningLevel} /><DataPair label={tr('expected files', '예상 파일')} value={`${snapshot.expectedFiles}`} /><DataPair label={tr('context risk', '컨텍스트 위험')} value={snapshot.contextRisk} tone={snapshot.contextRisk.toLowerCase().includes('high') ? 'danger' : snapshot.contextRisk.toLowerCase().includes('medium') ? 'accent' : 'primary'} /></div></div>
            <div className="rounded-lg border border-border bg-background/45 p-4"><ContextMeter used={snapshot.contextUsed} limit={snapshot.contextLimit} /></div>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
           <div className="panel rounded-xl p-5"><SectionLabel action={<span className="mono text-[10px] text-muted-foreground">{tr('prediction band', '예측 범위')}</span>}>{tr('token estimate', '토큰 예측')}</SectionLabel><div className="flex items-end justify-between"><div><div className="mono text-2xl text-slate-100">{formatTokens(snapshot.tokenEstimate.min)} <span className="text-sm text-muted-foreground">— {formatTokens(snapshot.tokenEstimate.max)}</span></div><div className="mt-1 text-xs text-muted-foreground">{Math.round(snapshot.tokenEstimate.confidence)}% {tr('confidence', '신뢰도')}</div></div><div className="w-24"><Sparkline values={[32, 38, 35, 45, 43, 56, 61, 58, 67, 64]} /></div></div></div>
          <div className="panel rounded-xl p-5"><SectionLabel action={<span className="mono text-[10px] text-muted-foreground">{tr('cost band', '비용 범위')}</span>}>{tr('cost estimate', '비용 예측')}</SectionLabel><div className="flex items-end justify-between"><div><div className="mono text-2xl text-slate-100">{formatMoney(snapshot.costEstimate.min)} <span className="text-sm text-muted-foreground">— {formatMoney(snapshot.costEstimate.max)}</span></div><div className="mt-1 text-xs text-muted-foreground">{Math.round(snapshot.costEstimate.confidence)}% {tr('confidence', '신뢰도')}</div></div><div className="w-24"><Sparkline values={[26, 24, 31, 29, 37, 34, 43, 41, 48, 45]} color="accent" /></div></div></div>
        </div>
      </div>
      <div className="panel rounded-xl p-5">
         <SectionLabel action={<span className="mono text-[10px] text-muted-foreground">{snapshot.recentActivity.length} {tr('events', '개 이벤트')}</span>}>{tr('recent activity', '최근 활동')}</SectionLabel>
        <div className="divide-y divide-border/70">{snapshot.recentActivity.length ? snapshot.recentActivity.map(item => <ActivityRow key={item.id} item={item} />) : <div className="py-10 text-center text-sm text-muted-foreground">{tr('Activity will appear as the agent works.', '에이전트가 작업하면 활동이 표시됩니다.')}</div>}</div>
        <div className="mt-4 flex items-center gap-2 border-t border-border/70 pt-4 text-[11px] text-muted-foreground"><Clock3 size={13} /> {tr('polling every 7 seconds', '7초마다 갱신')} <span className="ml-auto inline-flex items-center gap-1.5 text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot" /> {tr('live', '실시간')}</span></div>
      </div>
    </div>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/35 px-4 py-3 text-xs text-muted-foreground"><span className="flex items-center gap-2"><Zap size={14} className="text-accent" /> {tr('Every signal is evaluated locally. Nothing leaves this machine.', '모든 신호는 로컬에서 분석되며 이 컴퓨터 밖으로 전송되지 않습니다.')}</span><span className="mono text-[10px]">{tr('repository', '저장소')} / {snapshot.repository ?? tr('local workspace', '로컬 작업 공간')}</span></div>
  </Shell>;
}

function DataPair({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'primary' | 'accent' | 'danger' }) {
  const text = tone === 'primary' ? 'text-primary' : tone === 'accent' ? 'text-accent' : tone === 'danger' ? 'text-destructive' : 'text-slate-200';
  return <div className="rounded-md border border-border/70 bg-background/35 p-2.5"><div className="mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div><div className={`mt-1 truncate text-xs font-medium ${text}`}>{value}</div></div>;
}