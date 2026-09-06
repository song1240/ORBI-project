import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  exportPilotHistory,
  getGetPilotSettingsQueryKey,
  getGetPilotStorageQueryKey,
  getListPilotProvidersQueryKey,
  getListPilotSessionsQueryKey,
  useClearPilotHistory,
  useGetPilotSettings,
  useGetPilotStorage,
  useListPilotProviders,
  useUpdatePilotSettings,
} from '@workspace/api-client-react';
import type { PilotProviderStatus } from '@workspace/api-client-react';
import { AlertTriangle, Check, Database, Download, Info, Loader2, Radio, RefreshCw, Save, Server, ShieldCheck, SlidersHorizontal, Terminal, Trash2 } from 'lucide-react';
import { QueryState, Shell, PageHeading } from '@/components/model-pilot';
import { useLanguage } from '@/lib/i18n';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type FormState = { port: string; contextWarning: string; contextCritical: string; switchThreshold: string; telemetry: boolean; mockMode: boolean };
const defaults: FormState = { port: '3792', contextWarning: '75', contextCritical: '85', switchThreshold: '15', telemetry: false, mockMode: true };

export default function SettingsPage() {
  const { tr } = useLanguage();
  const settings = useGetPilotSettings({ query: { queryKey: getGetPilotSettingsQueryKey() } });
  const providers = useListPilotProviders({ query: { queryKey: getListPilotProvidersQueryKey() } });
  const storage = useGetPilotStorage({ query: { queryKey: getGetPilotStorageQueryKey() } });
  const update = useUpdatePilotSettings();
  const clearHistory = useClearPilotHistory();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(defaults);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [clearedCount, setClearedCount] = useState<number | null>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (settings.data && !initialized.current) {
      initialized.current = true;
      setForm({ port: String(settings.data.port), contextWarning: String(settings.data.contextWarning), contextCritical: String(settings.data.contextCritical), switchThreshold: String(settings.data.switchThreshold), telemetry: settings.data.telemetry, mockMode: settings.data.mockMode });
    }
  }, [settings.data]);
  const set = (key: keyof FormState, value: string | boolean) => { setSaved(false); setForm(current => ({ ...current, [key]: value })); };
  const save = () => {
    update.mutate({ data: { port: Number(form.port), contextWarning: Number(form.contextWarning), contextCritical: Number(form.contextCritical), switchThreshold: Number(form.switchThreshold), telemetry: form.telemetry, mockMode: form.mockMode } }, {
      onSuccess: result => { queryClient.setQueryData(getGetPilotSettingsQueryKey(), result); setSaved(true); },
    });
  };
  const exportHistory = async () => {
    setExporting(true);
    setExportError(false);
    try {
      const history = await exportPilotHistory();
      const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `model-pilot-history-${history.exportedAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };
  const confirmClearHistory = () => {
    clearHistory.mutate(undefined, {
      onSuccess: result => {
        setClearedCount(result.clearedSessions);
        void queryClient.invalidateQueries({ queryKey: getGetPilotStorageQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListPilotSessionsQueryKey() });
      },
    });
  };
  if (settings.isLoading || storage.isLoading) return <Shell><QueryState type="loading" /></Shell>;
  if (settings.isError || !settings.data) return <Shell><QueryState type="error" onRetry={() => settings.refetch()} /></Shell>;
  const providerScanLocalOnly = providers.data?.available === false;

  return <Shell>
    <PageHeading eyebrow={tr('configuration', '환경 설정')} title={tr('Pilot settings', '파일럿 설정')} description={tr('Tune the local advisor around your provider, context budget, and privacy boundary.', 'Provider, 컨텍스트 예산, 개인정보 보호 범위에 맞게 로컬 Advisor를 설정합니다.')} action={saved ? <span className="inline-flex items-center gap-2 text-xs text-primary"><Check size={15} /> {tr('changes saved', '변경사항 저장됨')}</span> : undefined} />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.7fr)]">
      <div className="space-y-6">
        <SettingsSection icon={Server} title={tr('Active session adapter', '활성 세션 어댑터')} description={tr('Claude Code is the active monitoring adapter in this version. Other installed CLIs are detected below without being executed for tasks.', '이 버전에서는 Claude Code가 활성 모니터링 어댑터입니다. 아래의 다른 CLI는 감지만 하며 작업 실행에는 사용하지 않습니다.')}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={tr('session provider', '세션 Provider')} hint={tr('active monitoring bridge', '활성 모니터링 브리지')}><div className="field-control flex items-center">Claude Code</div></Field>
            <Field label={tr('bridge port', '브리지 포트')} hint={tr('localhost only', '로컬호스트 전용')}>
              <input type="number" value={form.port} onChange={e => set('port', e.target.value)} className="field-control mono" data-testid="input-port" />
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection
          icon={Terminal}
          title={tr('Local CLI detection', '로컬 CLI 감지')}
          description={tr('Model Pilot detects supported AI coding tools without reading their credentials. Codex and Gemini session adapters are not active yet.', 'Model Pilot은 인증 정보를 읽지 않고 지원 AI 코딩 도구를 감지합니다. Codex와 Gemini 세션 어댑터는 아직 활성화되지 않았습니다.')}
          action={
            <button
              onClick={() => providers.refetch()}
              disabled={providers.isRefetching || providers.isLoading}
              className="inline-flex items-center justify-center rounded-md border border-border bg-secondary p-1.5 text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-slate-200 disabled:opacity-50"
              title={tr('Refresh status', '상태 새로고침')}
              data-testid="button-refresh-providers"
            >
              <RefreshCw size={14} className={providers.isRefetching ? 'animate-spin' : ''} />
            </button>
          }
        >
          {providers.isLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-border/50 bg-card/50 py-8 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              <span className="ml-3 text-xs">{tr('Scanning local environment…', '로컬 환경 스캔 중…')}</span>
            </div>
          ) : providerScanLocalOnly ? (
            <div className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/10 p-4 text-accent">
              <Info size={16} className="mt-0.5 shrink-0" />
              <div className="text-xs">
                <div className="font-bold">{tr('Available in the desktop app', '데스크톱 앱에서 사용 가능')}</div>
                <div className="mt-1 leading-relaxed opacity-80">{tr('For privacy, installed AI tools are detected only when Model Pilot is running locally on your computer.', '개인정보 보호를 위해 설치된 AI 도구는 Model Pilot이 내 컴퓨터에서 로컬로 실행될 때만 감지합니다.')}</div>
              </div>
            </div>
          ) : providers.isError ? (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div className="text-xs">
                <div className="font-bold">{tr('Provider scan failed', 'Provider 스캔 실패')}</div>
                <div className="mt-1 leading-relaxed opacity-80">{tr('Could not check local provider status. Make sure the pilot bridge is running and responsive.', '로컬 Provider 상태를 확인할 수 없습니다. 파일럿 브리지가 실행 중인지 확인하세요.')}</div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {providers.data?.providers.map(provider => (
                <ProviderStatusItem key={provider.id} provider={provider} />
              ))}
              {(!providers.data || providers.data.providers.length === 0) && (
                <div className="col-span-full rounded-xl border border-border/50 bg-card/50 py-8 text-center text-xs text-muted-foreground">
                  {tr('No supported AI coding tools detected.', '지원되는 AI 코딩 도구가 감지되지 않았습니다.')}
                </div>
              )}
            </div>
          )}
        </SettingsSection>

        <SettingsSection icon={SlidersHorizontal} title={tr('Decision thresholds', '판단 임계값')} description={tr('Thresholds shape when the pilot moves from confidence to caution. Values are percentages of the active context window.', '임계값은 파일럿이 정상 상태에서 주의 상태로 전환되는 기준입니다. 값은 활성 컨텍스트 창의 비율입니다.')}>
          <div className="grid gap-5 sm:grid-cols-3"><Field label={tr('context warning', '컨텍스트 경고')} hint={tr('start watching', '주의 시작')}><input type="number" min="1" max="99" value={form.contextWarning} onChange={e => set('contextWarning', e.target.value)} className="field-control mono" data-testid="input-context-warning" /></Field><Field label={tr('context critical', '컨텍스트 위험')} hint={tr('headroom is tight', '여유 공간 부족')}><input type="number" min="1" max="100" value={form.contextCritical} onChange={e => set('contextCritical', e.target.value)} className="field-control mono" data-testid="input-context-critical" /></Field><Field label={tr('switch threshold', '전환 임계값')} hint={tr('recommended fit', '추천 적합도')}><input type="number" min="1" max="100" value={form.switchThreshold} onChange={e => set('switchThreshold', e.target.value)} className="field-control mono" data-testid="input-switch-threshold" /></Field></div>
        </SettingsSection>
        <SettingsSection icon={ShieldCheck} title={tr('Privacy & telemetry', '개인정보 및 텔레메트리')} description={tr('Model Pilot is local-first. Choose which signals can leave the process boundary.', 'Model Pilot은 로컬 우선으로 동작합니다. 외부 전송이 허용되는 신호를 선택하세요.')}>
          <Toggle label={tr('Anonymous telemetry', '익명 텔레메트리')} detail={tr('Share aggregate performance signals to improve recommendations.', '추천 개선을 위해 집계된 성능 신호를 공유합니다.')} checked={form.telemetry} onChange={value => set('telemetry', value)} testId="switch-telemetry" /><Toggle label={tr('Mock mode', 'Mock 모드')} detail={tr('Use a generated local session when no coding agent is connected.', '연결된 코딩 에이전트가 없을 때 생성된 로컬 세션을 사용합니다.')} checked={form.mockMode} onChange={value => set('mockMode', value)} testId="switch-mock-mode" />
        </SettingsSection>
        <SettingsSection icon={Database} title={tr('Local history', '로컬 기록')} description={tr('Inspect, back up, or clear the session history stored on this computer. These actions never upload your data.', '이 컴퓨터에 저장된 세션 기록을 확인하거나 백업 또는 삭제합니다. 데이터는 업로드되지 않습니다.')}>
          {storage.isError || !storage.data ? <div className="text-xs text-destructive" data-testid="status-storage-error">{tr('Could not read local storage details.', '로컬 저장소 정보를 읽을 수 없습니다.')}</div> : <div className="space-y-5">
            <div className="rounded-lg border border-border/70 bg-secondary/35 p-4">
              <div className="mono text-[10px] uppercase tracking-[.13em] text-muted-foreground">{tr('active database', '활성 데이터베이스')}</div>
              <div className="mono mt-2 break-all text-[11px] leading-5 text-slate-200" data-testid="text-database-path">{storage.data.databasePath}</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <StorageMetric label={tr('sessions', '세션')} value={String(storage.data.sessionCount)} testId="text-session-count" />
                <StorageMetric label={tr('projects', '프로젝트')} value={String(storage.data.projectCount)} testId="text-project-count" />
                <StorageMetric label={tr('disk use', '디스크 사용량')} value={formatBytes(storage.data.databaseBytes)} testId="text-database-size" />
              </div>
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">{tr('Export creates a portable JSON backup in your Downloads folder. Keep that file if you may need the history later; clearing cannot be undone inside Model Pilot. Your provider, thresholds, telemetry, and mock-mode settings are preserved.', '내보내기는 다운로드 폴더에 이식 가능한 JSON 백업을 만듭니다. 기록이 나중에 필요할 수 있다면 파일을 보관하세요. 삭제한 기록은 Model Pilot에서 복구할 수 없습니다. Provider, 임계값, 텔레메트리 및 Mock 모드 설정은 유지됩니다.')}</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => void exportHistory()} disabled={exporting} className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3.5 py-2.5 text-xs font-semibold text-slate-100 hover:border-primary/40 disabled:cursor-wait disabled:opacity-60" data-testid="button-export-history"><Download size={14} />{exporting ? tr('Preparing export…', '내보내기 준비 중…') : tr('Export JSON backup', 'JSON 백업 내보내기')}</button>
              <AlertDialog>
                <AlertDialogTrigger asChild><button disabled={clearHistory.isPending || storage.data.sessionCount === 0} className="inline-flex items-center gap-2 rounded-md border border-destructive/35 bg-destructive/10 px-3.5 py-2.5 text-xs font-semibold text-destructive hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-clear-history"><Trash2 size={14} />{tr('Clear history', '기록 삭제')}</button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>{tr('Clear all local session history?', '모든 로컬 세션 기록을 삭제할까요?')}</AlertDialogTitle><AlertDialogDescription>{tr('This permanently removes session and project history from the active local database. Pilot Settings stay unchanged. Export a JSON backup first if you may need to recover the history.', '활성 로컬 데이터베이스에서 세션 및 프로젝트 기록을 영구적으로 삭제합니다. Pilot 설정은 변경되지 않습니다. 기록을 복구해야 할 수 있다면 먼저 JSON 백업을 내보내세요.')}</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel data-testid="button-cancel-clear-history">{tr('Cancel', '취소')}</AlertDialogCancel><AlertDialogAction onClick={confirmClearHistory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-clear-history">{tr('Clear permanently', '영구 삭제')}</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {exportError && <div className="text-xs text-destructive" data-testid="status-export-error">{tr('Could not create the backup. Your local history was not changed.', '백업을 만들 수 없습니다. 로컬 기록은 변경되지 않았습니다.')}</div>}
            {clearHistory.isError && <div className="text-xs text-destructive" data-testid="status-clear-error">{tr('Could not clear history. No settings were changed.', '기록을 삭제할 수 없습니다. 설정은 변경되지 않았습니다.')}</div>}
            {clearedCount !== null && <div className="text-xs text-primary" data-testid="status-history-cleared">{tr(`${clearedCount} sessions cleared. Pilot Settings were preserved.`, `${clearedCount}개 세션을 삭제했습니다. Pilot 설정은 유지되었습니다.`)}</div>}
          </div>}
        </SettingsSection>
        {update.isError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive" data-testid="status-save-error">{tr('Could not save settings. Check the local bridge and try again.', '설정을 저장할 수 없습니다. 로컬 브리지를 확인한 후 다시 시도하세요.')}</div>}
        <div className="flex justify-end"><button onClick={save} disabled={update.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60" data-testid="button-save-settings"><Save size={15} />{update.isPending ? tr('Saving changes…', '변경사항 저장 중…') : tr('Save changes', '변경사항 저장')}</button></div>
      </div>
      <div className="space-y-6">
        <div className="panel rounded-xl p-5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><Radio size={17} /></div><div><div className="text-sm font-semibold text-slate-100">{tr('Local bridge', '로컬 브리지')}</div><div className="mono mt-1 text-[10px] text-primary">{tr('ready to observe', '관찰 준비됨')}</div></div></div><div className="mt-5 space-y-3 border-t border-border/70 pt-4"><StatusLine label={tr('agent connection', '에이전트 연결')} value={tr('listening', '수신 중')} /><StatusLine label="provider" value="claude-code" /><StatusLine label={tr('endpoint', '엔드포인트')} value={`127.0.0.1:${form.port}`} /></div></div>
        <div className="rounded-xl border border-accent/20 bg-accent/[.055] p-5"><div className="flex items-center gap-2 text-accent"><Info size={15} /><span className="text-xs font-semibold">{tr('A useful boundary', '유용한 안전 기준')}</span></div><p className="mt-3 text-xs leading-6 text-slate-300">{tr('Context thresholds are guardrails, not hard stops. The pilot will explain its recommendation before asking you to change models.', '컨텍스트 임계값은 강제 중단이 아닌 안전 기준입니다. 파일럿은 모델 변경을 권하기 전에 추천 이유를 설명합니다.')}</p></div>
      </div>
    </div>
  </Shell>;
}

function SettingsSection({ icon: Icon, title, description, action, children }: { icon: React.ElementType; title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel rounded-xl p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
            <Icon size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground max-w-xl">{description}</p>
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function ProviderStatusItem({ provider }: { provider: PilotProviderStatus }) {
  const { tr } = useLanguage();
  const isReady = provider.status === 'ready';
  const isInstalled = provider.installed;
  const detail = {
    'cli-not-found': tr('CLI not found on PATH.', 'PATH에서 CLI를 찾지 못했습니다.'),
    ready: tr('Installed and signed in.', '설치 및 로그인 상태를 확인했습니다.'),
    'installed-auth-unknown': tr('Installed; this CLI did not provide a verified sign-in result.', '설치됨; 이 CLI에서 확인 가능한 로그인 결과를 제공하지 않았습니다.'),
    'sign-in-required': tr('Installed; sign in with the provider CLI.', '설치됨; 해당 Provider CLI에서 로그인하세요.'),
    'probe-failed': tr('Installed, but the local status check failed or timed out.', '설치되어 있지만 로컬 상태 확인이 실패했거나 시간 초과되었습니다.'),
  }[provider.detailCode];

  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-4 transition-all ${isReady ? 'border-primary/20 bg-primary/[.03]' : isInstalled ? 'border-accent/20 bg-accent/[.03]' : 'border-border bg-card'}`} data-testid={`provider-item-${provider.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${isReady ? 'border-primary/30 bg-primary/10 text-primary' : isInstalled ? 'border-accent/30 bg-accent/10 text-accent' : 'border-border bg-secondary text-muted-foreground'}`}>
            <Terminal size={13} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-200 leading-none">{provider.name}</span>
              {provider.version && (
                <span className="mono rounded-md bg-secondary/80 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">v{provider.version}</span>
              )}
            </div>
            <div className="mono mt-1.5 text-[10px] text-muted-foreground leading-none">{provider.command}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusPill status={provider.status} />
          {isInstalled && (
            <AuthPill auth={provider.authentication} />
          )}
        </div>
      </div>
      <div className="mt-1 text-[11px] leading-relaxed text-slate-400">{detail}</div>
    </div>
  );
}

function StatusPill({ status }: { status: PilotProviderStatus['status'] }) {
  const { tr } = useLanguage();
  if (status === 'ready') {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{tr('Ready', '준비됨')}</span>;
  }
  if (status === 'installed') {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{tr('Installed', '설치됨')}</span>;
  }
  if (status === 'unavailable') {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"><span className="h-1.5 w-1.5 rounded-full bg-destructive" />{tr('Check failed', '확인 실패')}</span>;
  }
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />{tr('Not installed', '설치 안 됨')}</span>;
}

function AuthPill({ auth }: { auth: PilotProviderStatus['authentication'] }) {
  const { tr } = useLanguage();
  if (auth === 'connected') {
    return <span className="text-[10px] text-primary">{tr('Authenticated', '인증됨')}</span>;
  }
  if (auth === 'sign-in-required') {
    return <span className="text-[10px] text-destructive">{tr('Sign-in required', '로그인 필요')}</span>;
  }
  return <span className="text-[10px] text-muted-foreground">{tr('Sign-in not verified', '로그인 미확인')}</span>;
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) { return <label className="block"><span className="mono block text-[10px] uppercase tracking-[.13em] text-muted-foreground">{label}</span><span className="mt-1 block text-[10px] text-muted-foreground">{hint}</span>{children}</label>; }
function Toggle({ label, detail, checked, onChange, testId }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void; testId: string }) { return <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3.5 first:pt-0 last:border-0 last:pb-0"><div><div className="text-xs font-semibold text-slate-200">{label}</div><div className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail}</div></div><button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? 'border-primary/50 bg-primary/25' : 'border-border bg-secondary'}`} data-testid={testId}><span className={`absolute top-1 h-4 w-4 rounded-full transition-transform ${checked ? 'translate-x-6 bg-primary' : 'translate-x-1 bg-muted-foreground'}`} /></button></div>; }
function StatusLine({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="mono text-slate-200">{value}</span></div>; }
function StorageMetric({ label, value, testId }: { label: string; value: string; testId: string }) { return <div><div className="text-[10px] text-muted-foreground">{label}</div><div className="mono mt-1 text-xs text-slate-100" data-testid={testId}>{value}</div></div>; }
function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1024 ** 2).toFixed(1)} MB`; }