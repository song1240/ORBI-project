import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetPilotSettingsQueryKey, useGetPilotSettings, useUpdatePilotSettings } from '@workspace/api-client-react';
import { Check, Info, Save, Server, ShieldCheck, SlidersHorizontal, Radio } from 'lucide-react';
import { QueryState, Shell, PageHeading } from '@/components/model-pilot';
import { useLanguage } from '@/lib/i18n';

type FormState = { provider: string; port: string; contextWarning: string; contextCritical: string; switchThreshold: string; telemetry: boolean; mockMode: boolean };
const defaults: FormState = { provider: 'anthropic', port: '4317', contextWarning: '70', contextCritical: '88', switchThreshold: '76', telemetry: true, mockMode: false };

export default function SettingsPage() {
  const { tr } = useLanguage();
  const settings = useGetPilotSettings({ query: { queryKey: getGetPilotSettingsQueryKey() } });
  const update = useUpdatePilotSettings();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(defaults);
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (settings.data && !initialized.current) {
      initialized.current = true;
      setForm({ provider: settings.data.provider, port: String(settings.data.port), contextWarning: String(settings.data.contextWarning), contextCritical: String(settings.data.contextCritical), switchThreshold: String(settings.data.switchThreshold), telemetry: settings.data.telemetry, mockMode: settings.data.mockMode });
    }
  }, [settings.data]);
  const set = (key: keyof FormState, value: string | boolean) => { setSaved(false); setForm(current => ({ ...current, [key]: value })); };
  const save = () => {
    update.mutate({ data: { provider: form.provider, port: Number(form.port), contextWarning: Number(form.contextWarning), contextCritical: Number(form.contextCritical), switchThreshold: Number(form.switchThreshold), telemetry: form.telemetry, mockMode: form.mockMode } }, {
      onSuccess: result => { queryClient.setQueryData(getGetPilotSettingsQueryKey(), result); setSaved(true); },
    });
  };
  if (settings.isLoading) return <Shell><QueryState type="loading" /></Shell>;
  if (settings.isError || !settings.data) return <Shell><QueryState type="error" onRetry={() => settings.refetch()} /></Shell>;
  return <Shell>
    <PageHeading eyebrow={tr('configuration', '환경 설정')} title={tr('Pilot settings', '파일럿 설정')} description={tr('Tune the local advisor around your provider, context budget, and privacy boundary.', 'Provider, 컨텍스트 예산, 개인정보 보호 범위에 맞게 로컬 Advisor를 설정합니다.')} action={saved ? <span className="inline-flex items-center gap-2 text-xs text-primary"><Check size={15} /> {tr('changes saved', '변경사항 저장됨')}</span> : undefined} />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.7fr)]">
      <div className="space-y-6">
        <SettingsSection icon={Server} title={tr('Provider connection', 'Provider 연결')} description={tr('The local bridge uses this connection to understand your active coding session.', '로컬 브리지가 이 연결을 통해 현재 코딩 세션을 파악합니다.')}>
          <div className="grid gap-5 sm:grid-cols-2"><Field label="provider" hint={tr('active model gateway', '활성 모델 게이트웨이')}><select value={form.provider} onChange={e => set('provider', e.target.value)} className="field-control" data-testid="select-provider"><option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="ollama">Ollama</option><option value="local">{tr('Local adapter', '로컬 어댑터')}</option></select></Field><Field label={tr('bridge port', '브리지 포트')} hint={tr('localhost only', '로컬호스트 전용')}><input type="number" value={form.port} onChange={e => set('port', e.target.value)} className="field-control mono" data-testid="input-port" /></Field></div>
        </SettingsSection>
        <SettingsSection icon={SlidersHorizontal} title={tr('Decision thresholds', '판단 임계값')} description={tr('Thresholds shape when the pilot moves from confidence to caution. Values are percentages of the active context window.', '임계값은 파일럿이 정상 상태에서 주의 상태로 전환되는 기준입니다. 값은 활성 컨텍스트 창의 비율입니다.')}>
          <div className="grid gap-5 sm:grid-cols-3"><Field label={tr('context warning', '컨텍스트 경고')} hint={tr('start watching', '주의 시작')}><input type="number" min="1" max="99" value={form.contextWarning} onChange={e => set('contextWarning', e.target.value)} className="field-control mono" data-testid="input-context-warning" /></Field><Field label={tr('context critical', '컨텍스트 위험')} hint={tr('headroom is tight', '여유 공간 부족')}><input type="number" min="1" max="100" value={form.contextCritical} onChange={e => set('contextCritical', e.target.value)} className="field-control mono" data-testid="input-context-critical" /></Field><Field label={tr('switch threshold', '전환 임계값')} hint={tr('recommended fit', '추천 적합도')}><input type="number" min="1" max="100" value={form.switchThreshold} onChange={e => set('switchThreshold', e.target.value)} className="field-control mono" data-testid="input-switch-threshold" /></Field></div>
        </SettingsSection>
        <SettingsSection icon={ShieldCheck} title={tr('Privacy & telemetry', '개인정보 및 텔레메트리')} description={tr('Model Pilot is local-first. Choose which signals can leave the process boundary.', 'Model Pilot은 로컬 우선으로 동작합니다. 외부 전송이 허용되는 신호를 선택하세요.')}>
          <Toggle label={tr('Anonymous telemetry', '익명 텔레메트리')} detail={tr('Share aggregate performance signals to improve recommendations.', '추천 개선을 위해 집계된 성능 신호를 공유합니다.')} checked={form.telemetry} onChange={value => set('telemetry', value)} testId="switch-telemetry" /><Toggle label={tr('Mock mode', 'Mock 모드')} detail={tr('Use a generated local session when no coding agent is connected.', '연결된 코딩 에이전트가 없을 때 생성된 로컬 세션을 사용합니다.')} checked={form.mockMode} onChange={value => set('mockMode', value)} testId="switch-mock-mode" />
        </SettingsSection>
        {update.isError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive" data-testid="status-save-error">{tr('Could not save settings. Check the local bridge and try again.', '설정을 저장할 수 없습니다. 로컬 브리지를 확인한 후 다시 시도하세요.')}</div>}
        <div className="flex justify-end"><button onClick={save} disabled={update.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60" data-testid="button-save-settings"><Save size={15} />{update.isPending ? tr('Saving changes…', '변경사항 저장 중…') : tr('Save changes', '변경사항 저장')}</button></div>
      </div>
      <div className="space-y-6">
        <div className="panel rounded-xl p-5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><Radio size={17} /></div><div><div className="text-sm font-semibold text-slate-100">{tr('Local bridge', '로컬 브리지')}</div><div className="mono mt-1 text-[10px] text-primary">{tr('ready to observe', '관찰 준비됨')}</div></div></div><div className="mt-5 space-y-3 border-t border-border/70 pt-4"><StatusLine label={tr('agent connection', '에이전트 연결')} value={tr('listening', '수신 중')} /><StatusLine label="provider" value={form.provider} /><StatusLine label={tr('endpoint', '엔드포인트')} value={`127.0.0.1:${form.port}`} /></div></div>
        <div className="rounded-xl border border-accent/20 bg-accent/[.055] p-5"><div className="flex items-center gap-2 text-accent"><Info size={15} /><span className="text-xs font-semibold">{tr('A useful boundary', '유용한 안전 기준')}</span></div><p className="mt-3 text-xs leading-6 text-slate-300">{tr('Context thresholds are guardrails, not hard stops. The pilot will explain its recommendation before asking you to change models.', '컨텍스트 임계값은 강제 중단이 아닌 안전 기준입니다. 파일럿은 모델 변경을 권하기 전에 추천 이유를 설명합니다.')}</p></div>
      </div>
    </div>
  </Shell>;
}

function SettingsSection({ icon: Icon, title, description, children }: { icon: React.ElementType; title: string; description: string; children: React.ReactNode }) { return <section className="panel rounded-xl p-5 md:p-6"><div className="flex items-start gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Icon size={16} /></div><div><h2 className="text-sm font-semibold text-slate-100">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div></div><div className="mt-6">{children}</div></section>; }
function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) { return <label className="block"><span className="mono block text-[10px] uppercase tracking-[.13em] text-muted-foreground">{label}</span><span className="mt-1 block text-[10px] text-muted-foreground">{hint}</span>{children}</label>; }
function Toggle({ label, detail, checked, onChange, testId }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void; testId: string }) { return <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3.5 first:pt-0 last:border-0 last:pb-0"><div><div className="text-xs font-semibold text-slate-200">{label}</div><div className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail}</div></div><button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? 'border-primary/50 bg-primary/25' : 'border-border bg-secondary'}`} data-testid={testId}><span className={`absolute top-1 h-4 w-4 rounded-full transition-transform ${checked ? 'translate-x-6 bg-primary' : 'translate-x-1 bg-muted-foreground'}`} /></button></div>; }
function StatusLine({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="mono text-slate-200">{value}</span></div>; }