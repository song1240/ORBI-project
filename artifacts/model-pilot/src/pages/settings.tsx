import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetPilotSettingsQueryKey, useGetPilotSettings, useUpdatePilotSettings } from '@workspace/api-client-react';
import { Check, Info, Save, Server, ShieldCheck, SlidersHorizontal, Radio } from 'lucide-react';
import { QueryState, Shell, PageHeading } from '@/components/model-pilot';

type FormState = { provider: string; port: string; contextWarning: string; contextCritical: string; switchThreshold: string; telemetry: boolean; mockMode: boolean };
const defaults: FormState = { provider: 'anthropic', port: '4317', contextWarning: '70', contextCritical: '88', switchThreshold: '76', telemetry: true, mockMode: false };

export default function SettingsPage() {
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
    <PageHeading eyebrow="configuration" title="Pilot settings" description="Tune the local advisor around your provider, context budget, and privacy boundary." action={saved ? <span className="inline-flex items-center gap-2 text-xs text-primary"><Check size={15} /> changes saved</span> : undefined} />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.7fr)]">
      <div className="space-y-6">
        <SettingsSection icon={Server} title="Provider connection" description="The local bridge uses this connection to understand your active coding session.">
          <div className="grid gap-5 sm:grid-cols-2"><Field label="provider" hint="active model gateway"><select value={form.provider} onChange={e => set('provider', e.target.value)} className="field-control" data-testid="select-provider"><option value="anthropic">Anthropic</option><option value="openai">OpenAI</option><option value="ollama">Ollama</option><option value="local">Local adapter</option></select></Field><Field label="bridge port" hint="localhost only"><input type="number" value={form.port} onChange={e => set('port', e.target.value)} className="field-control mono" data-testid="input-port" /></Field></div>
        </SettingsSection>
        <SettingsSection icon={SlidersHorizontal} title="Decision thresholds" description="Thresholds shape when the pilot moves from confidence to caution. Values are percentages of the active context window.">
          <div className="grid gap-5 sm:grid-cols-3"><Field label="context warning" hint="start watching"><input type="number" min="1" max="99" value={form.contextWarning} onChange={e => set('contextWarning', e.target.value)} className="field-control mono" data-testid="input-context-warning" /></Field><Field label="context critical" hint="headroom is tight"><input type="number" min="1" max="100" value={form.contextCritical} onChange={e => set('contextCritical', e.target.value)} className="field-control mono" data-testid="input-context-critical" /></Field><Field label="switch threshold" hint="recommended fit"><input type="number" min="1" max="100" value={form.switchThreshold} onChange={e => set('switchThreshold', e.target.value)} className="field-control mono" data-testid="input-switch-threshold" /></Field></div>
        </SettingsSection>
        <SettingsSection icon={ShieldCheck} title="Privacy & telemetry" description="Model Pilot is local-first. Choose which signals can leave the process boundary.">
          <Toggle label="Anonymous telemetry" detail="Share aggregate performance signals to improve recommendations." checked={form.telemetry} onChange={value => set('telemetry', value)} testId="switch-telemetry" /><Toggle label="Mock mode" detail="Use a generated local session when no coding agent is connected." checked={form.mockMode} onChange={value => set('mockMode', value)} testId="switch-mock-mode" />
        </SettingsSection>
        {update.isError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive" data-testid="status-save-error">Could not save settings. Check the local bridge and try again.</div>}
        <div className="flex justify-end"><button onClick={save} disabled={update.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60" data-testid="button-save-settings"><Save size={15} />{update.isPending ? 'Saving changes…' : 'Save changes'}</button></div>
      </div>
      <div className="space-y-6">
        <div className="panel rounded-xl p-5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><Radio size={17} /></div><div><div className="text-sm font-semibold text-slate-100">Local bridge</div><div className="mono mt-1 text-[10px] text-primary">ready to observe</div></div></div><div className="mt-5 space-y-3 border-t border-border/70 pt-4"><StatusLine label="agent connection" value="listening" /><StatusLine label="provider" value={form.provider} /><StatusLine label="endpoint" value={`127.0.0.1:${form.port}`} /></div></div>
        <div className="rounded-xl border border-accent/20 bg-accent/[.055] p-5"><div className="flex items-center gap-2 text-accent"><Info size={15} /><span className="text-xs font-semibold">A useful boundary</span></div><p className="mt-3 text-xs leading-6 text-slate-300">Context thresholds are guardrails, not hard stops. The pilot will explain its recommendation before asking you to change models.</p></div>
      </div>
    </div>
  </Shell>;
}

function SettingsSection({ icon: Icon, title, description, children }: { icon: React.ElementType; title: string; description: string; children: React.ReactNode }) { return <section className="panel rounded-xl p-5 md:p-6"><div className="flex items-start gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Icon size={16} /></div><div><h2 className="text-sm font-semibold text-slate-100">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div></div><div className="mt-6">{children}</div></section>; }
function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) { return <label className="block"><span className="mono block text-[10px] uppercase tracking-[.13em] text-muted-foreground">{label}</span><span className="mt-1 block text-[10px] text-muted-foreground">{hint}</span>{children}</label>; }
function Toggle({ label, detail, checked, onChange, testId }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void; testId: string }) { return <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3.5 first:pt-0 last:border-0 last:pb-0"><div><div className="text-xs font-semibold text-slate-200">{label}</div><div className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail}</div></div><button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? 'border-primary/50 bg-primary/25' : 'border-border bg-secondary'}`} data-testid={testId}><span className={`absolute top-1 h-4 w-4 rounded-full transition-transform ${checked ? 'translate-x-6 bg-primary' : 'translate-x-1 bg-muted-foreground'}`} /></button></div>; }
function StatusLine({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="mono text-slate-200">{value}</span></div>; }