import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/**
 * The funding pipeline: grants, sponsors, investors and brand deals W.A.G.E. is
 * chasing, plus the cash figures behind the runway.
 *
 * These are the same rows the Studio Console desktop app reads and writes — one
 * pipeline, two front doors — which is why nothing here is derived or cached:
 * a deadline changed on the desktop is a fact this screen must show, not a copy
 * it keeps. Everything goes through the ws_admin_funding_* RPCs, which check the
 * caller is an admin; the tables themselves are unreachable with the anon key.
 */

type Kind = 'grant' | 'sponsor' | 'investor' | 'brand_deal' | 'loan' | 'accelerator' | 'other';
type Stage = 'researching' | 'applying' | 'submitted' | 'won' | 'lost' | 'passed';

const KINDS: Kind[] = ['grant', 'sponsor', 'investor', 'brand_deal', 'loan', 'accelerator', 'other'];
const STAGES: Stage[] = ['researching', 'applying', 'submitted', 'won', 'lost', 'passed'];

type Opportunity = {
  id: string;
  name: string;
  kind: Kind;
  stage: Stage;
  amount_cents: number | null;
  deadline: string | null;
  url: string | null;
  notes: string | null;
  eligibility: string | null;
  source: 'manual' | 'import';
  updated_at: string;
};

type Overview = {
  financials: {
    monthly_expenses_cents?: number;
    cash_on_hand_cents?: number;
    notes?: string | null;
  };
};

const dollars = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? '—'
    : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const label = (value: string) => value.replace(/_/g, ' ');

const isOpen = (stage: Stage) => stage === 'researching' || stage === 'applying' || stage === 'submitted';

function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  const due = new Date(`${deadline}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function Notice({ tone, children }: { tone: 'error' | 'ok'; children: React.ReactNode }) {
  const skin =
    tone === 'error'
      ? 'border-wage-error/40 bg-wage-error/[0.08] text-wage-error'
      : 'border-wage-success/40 bg-wage-success/[0.08] text-wage-success';
  return <p role="status" className={`mb-4 border px-4 py-2.5 text-sm ${skin}`}>{children}</p>;
}

function Tile({ value, label: caption, hint }: { value: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="wage-card wage-card-sm px-4 py-5">
      <div className="wage-num text-[28px] leading-none text-wage-amber-2">{value}</div>
      <div className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-wage-muted-2">{caption}</div>
      {hint && <div className="mt-1 text-[12px] text-wage-muted">{hint}</div>}
    </div>
  );
}

const EMPTY = {
  name: '',
  kind: 'grant' as Kind,
  stage: 'researching' as Stage,
  amount: '',
  deadline: '',
  url: '',
  notes: '',
};

type Form = typeof EMPTY;

export function FundingTab() {
  const [rows, setRows] = useState<Opportunity[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    const [list, summary] = await Promise.all([
      supabase.rpc('ws_admin_funding_list'),
      supabase.rpc('ws_admin_funding_overview'),
    ]);
    setBusy(false);

    if (list.error || summary.error) {
      setErr(list.error?.message ?? summary.error?.message ?? 'Could not load the pipeline');
      return;
    }

    setErr(null);
    setRows((list.data ?? []) as Opportunity[]);
    setOverview(summary.data as Overview);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(target: Opportunity | null, values: Form) {
    const { error } = await supabase.rpc('ws_admin_funding_save', {
      p_id: target?.id ?? null,
      p_name: values.name.trim(),
      p_kind: values.kind,
      p_stage: values.stage,
      p_amount_cents: values.amount.trim() === '' ? null : Math.round(Number(values.amount) * 100),
      p_deadline: values.deadline || null,
      p_url: values.url.trim() || null,
      p_notes: values.notes.trim() || null,
    });

    if (error) { setErr(error.message); return; }

    setErr(null);
    setEditing(null);
    setAdding(false);
    setForm(EMPTY);
    setSaved(values.name.trim());
    setTimeout(() => setSaved(null), 3000);
    await load();
  }

  async function remove(row: Opportunity) {
    const { error } = await supabase.rpc('ws_admin_funding_delete', { p_id: row.id });
    if (error) { setErr(error.message); return; }
    await load();
  }

  const open = rows.filter((row) => isOpen(row.stage));
  const won = rows.filter((row) => row.stage === 'won');
  const closing = rows.filter((row) => {
    const days = daysLeft(row.deadline);
    return isOpen(row.stage) && days !== null && days >= 0 && days <= 21;
  });

  const sought = open.reduce((total, row) => total + (row.amount_cents ?? 0), 0);
  const secured = won.reduce((total, row) => total + (row.amount_cents ?? 0), 0);

  const monthly = overview?.financials?.monthly_expenses_cents ?? 0;
  const cash = overview?.financials?.cash_on_hand_cents ?? 0;

  return (
    <div className="space-y-10">
      {err && <Notice tone="error">{err}</Notice>}
      {saved && <Notice tone="ok">Saved “{saved}”.</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile value={open.length} label="Open" hint={`${dollars(sought)} sought`} />
        <Tile value={won.length} label="Won" hint={dollars(secured)} />
        <Tile
          value={closing.length}
          label="Closing soon"
          hint={closing.length > 0 ? 'within 21 days' : 'nothing imminent'}
        />
        {/* Months of cover at the stated costs. Income is not in this figure —
            it lives in Stripe and is not fetched here, so the caption says what
            the number is rather than implying a forecast. */}
        <Tile
          value={monthly > 0 ? `${(cash / monthly).toFixed(1)} mo` : '—'}
          label="Cover"
          hint={monthly > 0 ? 'at current costs, before income' : 'enter monthly costs below'}
        />
      </div>

      <CashPosition overview={overview} onSaved={load} onError={setErr} />

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="wage-eyebrow-mute font-mono text-[10.5px] uppercase tracking-[0.16em]">Pipeline</div>
          <button className="wage-btn wage-btn-primary !px-3 !py-1 text-sm" onClick={() => { setForm(EMPTY); setAdding(true); }}>
            Add opportunity
          </button>
        </div>

        {busy && rows.length === 0 && <p className="text-wage-muted">Loading...</p>}

        {!busy && rows.length === 0 && (
          <div className="wage-card wage-card-sm px-5 py-10 text-center text-[15px] text-wage-muted">
            Nothing tracked yet. Add one here, or run a search from the Studio Console app.
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-wage-muted-2">
                <tr>
                  <th className="py-2 pr-3">Opportunity</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Stage</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Deadline</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const days = daysLeft(row.deadline);
                  return (
                    <tr key={row.id} className="border-t border-wage-line align-top">
                      <td className="py-2.5 pr-3">
                        {row.url ? (
                          <a href={row.url} target="_blank" rel="noreferrer" className="text-wage-amber-2 hover:underline">
                            {row.name}
                          </a>
                        ) : (
                          row.name
                        )}
                        {row.eligibility && <div className="mt-1 text-[12px] text-wage-muted">{row.eligibility}</div>}
                      </td>
                      <td className="py-2.5 pr-3 text-wage-muted">{label(row.kind)}</td>
                      <td className="py-2.5 pr-3 text-wage-muted">{row.stage}</td>
                      <td className="py-2.5 pr-3">{dollars(row.amount_cents)}</td>
                      <td className={`py-2.5 pr-3 ${days !== null && days >= 0 && days <= 21 ? 'text-wage-warning' : 'text-wage-muted'}`}>
                        {row.deadline ? `${row.deadline}${days === null ? '' : days < 0 ? ' (passed)' : ` (${days}d)`}` : '—'}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="wage-btn wage-btn-ghost !px-3 !py-1 text-sm"
                            onClick={() => {
                              setEditing(row);
                              setForm({
                                name: row.name,
                                kind: row.kind,
                                stage: row.stage,
                                amount: row.amount_cents === null ? '' : String(row.amount_cents / 100),
                                deadline: row.deadline ?? '',
                                url: row.url ?? '',
                                notes: row.notes ?? '',
                              });
                            }}
                          >
                            Edit
                          </button>
                          <DeleteButton onDelete={() => remove(row)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {(adding || editing) && (
        <OpportunityDialog
          title={editing ? editing.name : 'New opportunity'}
          origin={null}
          form={form}
          setForm={setForm}
          onCancel={() => { setAdding(false); setEditing(null); }}
          onSave={() => save(editing, form)}
        />
      )}
    </div>
  );
}

/** Two-step delete: the first click arms it, the second commits. */
function DeleteButton({ onDelete }: { onDelete: () => Promise<void> | void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      onClick={() => (armed ? (setArmed(false), onDelete()) : setArmed(true))}
      className={`wage-btn !px-3 !py-1 text-sm ${armed ? 'wage-btn-primary' : 'wage-btn-ghost'}`}
    >
      {armed ? 'Confirm' : 'Delete'}
    </button>
  );
}

function CashPosition({
  overview,
  onSaved,
  onError,
}: {
  overview: Overview | null;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [expenses, setExpenses] = useState('');
  const [cash, setCash] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!overview) return;
    const financials = overview.financials ?? {};
    setExpenses(financials.monthly_expenses_cents ? String(financials.monthly_expenses_cents / 100) : '');
    setCash(financials.cash_on_hand_cents ? String(financials.cash_on_hand_cents / 100) : '');
    setNotes(financials.notes ?? '');
  }, [overview]);

  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc('ws_admin_funding_save_financials', {
      p_monthly_expenses_cents: Math.round((Number(expenses) || 0) * 100),
      p_cash_on_hand_cents: Math.round((Number(cash) || 0) * 100),
      p_notes: notes.trim() || null,
    });
    setBusy(false);
    if (error) { onError(error.message); return; }
    await onSaved();
  }

  return (
    <div>
      <div className="mb-3 wage-eyebrow-mute font-mono text-[10.5px] uppercase tracking-[0.16em]">Cash position</div>
      <div className="wage-card wage-card-sm px-5 py-5">
        <p className="text-sm text-wage-muted">
          Stripe knows what came in; it can&apos;t know rent, subscriptions or money held elsewhere. These
          two figures are what turn revenue into a runway, and the Studio Console app shows the same values.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-wage-muted">Monthly costs ($)</span>
            <input className="input mt-1 w-full" inputMode="decimal" value={expenses} onChange={(e) => setExpenses(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-wage-muted">Cash outside Stripe ($)</span>
            <input className="input mt-1 w-full" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-wage-muted">Notes</span>
          <textarea className="input mt-1 w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button className="wage-btn wage-btn-primary mt-4 !px-4 !py-1.5 text-sm" onClick={save} disabled={busy}>
          {busy ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function OpportunityDialog({
  title,
  origin,
  form,
  setForm,
  onCancel,
  onSave,
}: {
  title: string;
  origin: string | null;
  form: Form;
  setForm: (next: Form) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-6">
      <div className="wage-card w-full max-w-2xl px-6 py-6">
        <h3 className="wage-cut text-[20px]">{title}</h3>
        {origin && <p className="mt-1 text-sm text-wage-muted">{origin}</p>}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="text-wage-muted">Name</span>
            <input className="input mt-1 w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>

          <label className="block text-sm">
            <span className="text-wage-muted">Type</span>
            <select className="input mt-1 w-full" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
              {KINDS.map((kind) => <option key={kind} value={kind}>{label(kind)}</option>)}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-wage-muted">Stage</span>
            <select className="input mt-1 w-full" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as Stage })}>
              {STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-wage-muted">Amount ($) — blank if unknown</span>
            <input className="input mt-1 w-full" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>

          <label className="block text-sm">
            <span className="text-wage-muted">Deadline — blank if rolling</span>
            <input className="input mt-1 w-full" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="text-wage-muted">Link</span>
            <input className="input mt-1 w-full" placeholder="https://" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="text-wage-muted">Notes</span>
            <textarea className="input mt-1 w-full" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button className="wage-btn wage-btn-ghost !px-4 !py-1.5 text-sm" onClick={onCancel}>Cancel</button>
          <button
            className="wage-btn wage-btn-primary !px-4 !py-1.5 text-sm"
            disabled={busy || form.name.trim() === ''}
            onClick={async () => { setBusy(true); await onSave(); setBusy(false); }}
          >
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
