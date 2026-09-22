import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Select,
  Spinner,
  Table,
  Td,
  TextInput,
  Th,
  Warning,
} from '../components/ui.js';
import { api } from '../lib/api.js';
import { dateLabel, parsePercent, parseRands, percent, rands } from '../lib/format.js';
import type { Assumption, GroupSettings } from '../lib/types.js';

interface FeeScaleRow {
  id: string;
  kind: 'transfer_duty' | 'transfer_attorney' | 'bond_registration';
  effectiveFrom: string;
  lower: number;
  upper: number | null;
  baseAmount: number;
  marginalRate: number;
  verified: boolean;
  source: string | null;
}

const KIND_LABEL = {
  transfer_duty: 'Transfer duty',
  transfer_attorney: 'Transfer attorney and deeds office',
  bond_registration: 'Bond registration and initiation',
};

export default function AssumptionsPage() {
  const assumptions = useQuery({
    queryKey: ['assumptions'],
    queryFn: () => api.get<{ assumptions: Assumption[]; unverifiedCount: number }>('/api/assumptions'),
  });
  const feeScales = useQuery({ queryKey: ['fee-scales'], queryFn: () => api.get<FeeScaleRow[]>('/api/fee-scales') });
  const group = useQuery({ queryKey: ['group-settings'], queryFn: () => api.get<GroupSettings>('/api/group-settings') });

  if (assumptions.isLoading) return <Spinner label="Loading the register" />;
  if (assumptions.error) return <ErrorNote error={assumptions.error} />;
  if (!assumptions.data) return null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Assumptions register</h1>
        <p className="max-w-3xl text-sm text-ink-soft">
          Every global rate in one place. Nothing in this table is duplicated as a constant in code, so changing a value
          here flows to every projection immediately.
        </p>
      </header>

      {assumptions.data.unverifiedCount > 0 && (
        <Warning tone="caution" title={`${assumptions.data.unverifiedCount} of ${assumptions.data.assumptions.length} assumptions are unverified.`}>
          They were seeded to make the app runnable, not researched. Three things should be settled outside this app
          before anyone relies on it: the current transfer duty brackets and attorney fee scales, the VAT position on
          short-term accommodation and on buying fixed property from a non-vendor, and the assessed-loss and
          dividends-tax treatment for a five-director property company. Those are accountant questions.
        </Warning>
      )}

      <Card title="The register">
        <Table className="min-w-[48rem]">
          <thead>
            <tr>
              <Th>Assumption</Th>
              <Th align="right">Value</Th>
              <Th>Source</Th>
              <Th>Verified</Th>
              <Th>Effective from</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {assumptions.data.assumptions.map((assumption) => (
              <AssumptionRow key={assumption.key} assumption={assumption} />
            ))}
          </tbody>
        </Table>
      </Card>

      {group.data && <GroupSettingsCard settings={group.data} />}

      <Card
        title="Fee scales and transfer duty brackets"
        subtitle="Dated, because they change most Februaries and a deal transferred last year must still reprice against the set in force then."
      >
        {feeScales.isLoading ? (
          <Spinner />
        ) : (
          (['transfer_duty', 'transfer_attorney', 'bond_registration'] as const).map((kind) => (
            <div key={kind} className="mb-5">
              <h3 className="text-sm font-semibold">{KIND_LABEL[kind]}</h3>
              <Table>
                <thead>
                  <tr>
                    <Th>Effective from</Th>
                    <Th align="right">From</Th>
                    <Th align="right">To</Th>
                    <Th align="right">Base amount</Th>
                    <Th align="right">Rate on the excess</Th>
                    <Th>Verified</Th>
                  </tr>
                </thead>
                <tbody>
                  {(feeScales.data ?? [])
                    .filter((row) => row.kind === kind)
                    .map((row) => (
                      <tr key={row.id}>
                        <Td>{row.effectiveFrom}</Td>
                        <Td align="right">{rands(row.lower)}</Td>
                        <Td align="right">{row.upper === null ? 'and above' : rands(row.upper)}</Td>
                        <Td align="right">{rands(row.baseAmount)}</Td>
                        <Td align="right">{percent(row.marginalRate, 2)}</Td>
                        <Td>
                          <Badge tone={row.verified ? 'pass' : 'caution'}>{row.verified ? 'Verified' : 'Unverified'}</Badge>
                        </Td>
                      </tr>
                    ))}
                </tbody>
              </Table>
            </div>
          ))
        )}
        <FeeScaleEditor rows={feeScales.data ?? []} />
      </Card>
    </div>
  );
}

function AssumptionRow({ assumption }: { assumption: Assumption }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(
    assumption.unit === 'rate' ? (assumption.value * 100).toFixed(3) : assumption.unit === 'cents' ? String(assumption.value / 100) : String(assumption.value),
  );
  const [source, setSource] = useState(assumption.source ?? '');
  const [verified, setVerified] = useState(assumption.verified);
  const [showHistory, setShowHistory] = useState(false);

  const history = useQuery({
    queryKey: ['assumption-history', assumption.key],
    queryFn: () =>
      api.get<{ id: string; value: number; verified: boolean; changedBy: string | null; changedAt: string }[]>(
        `/api/assumptions/${assumption.key}/history`,
      ),
    enabled: showHistory,
  });

  const save = useMutation({
    mutationFn: (body: unknown) => api.put(`/api/assumptions/${assumption.key}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setEditing(false);
    },
  });

  const display =
    assumption.unit === 'rate'
      ? percent(assumption.value, 2)
      : assumption.unit === 'cents'
        ? rands(assumption.value)
        : `${assumption.value} ${assumption.unit}`;

  const parse = (): number | null => {
    if (assumption.unit === 'rate') return parsePercent(value);
    if (assumption.unit === 'cents') return parseRands(value);
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  return (
    <>
      <tr>
        <Td>
          <div className="font-medium">{assumption.label}</div>
          <div className="text-xs text-ink-soft">{assumption.key}</div>
          {assumption.notes && <div className="mt-1 max-w-md text-xs text-ink-soft">{assumption.notes}</div>}
        </Td>
        <Td align="right">
          {editing ? <TextInput value={value} onChange={(event) => setValue(event.target.value)} /> : <span className="font-semibold">{display}</span>}
        </Td>
        <Td>
          {editing ? (
            <TextInput value={source} onChange={(event) => setSource(event.target.value)} placeholder="Where did you check it?" />
          ) : (
            <span className="text-xs text-ink-soft">{assumption.source ?? '—'}</span>
          )}
        </Td>
        <Td>
          {editing ? (
            <Select value={verified ? 'yes' : 'no'} onChange={(event) => setVerified(event.target.value === 'yes')}>
              <option value="no">Unverified</option>
              <option value="yes">Verified</option>
            </Select>
          ) : (
            <Badge tone={assumption.verified ? 'pass' : 'caution'}>
              {assumption.verified ? `Verified ${dateLabel(assumption.verifiedDate)}` : 'Unverified'}
            </Badge>
          )}
        </Td>
        <Td className="text-xs text-ink-soft">{assumption.effectiveFrom}</Td>
        <Td align="right">
          <div className="flex justify-end gap-2 text-xs">
            {editing ? (
              <>
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() => {
                    const parsed = parse();
                    if (parsed === null) return;
                    save.mutate({ value: parsed, source, verified });
                  }}
                >
                  Save
                </button>
                <button type="button" className="text-ink-soft hover:underline" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button type="button" className="text-accent hover:underline" onClick={() => setEditing(true)}>
                  Edit
                </button>
                <button type="button" className="text-ink-soft hover:underline" onClick={() => setShowHistory((open) => !open)}>
                  History
                </button>
              </>
            )}
          </div>
        </Td>
      </tr>
      {showHistory && (
        <tr>
          <Td className="bg-canvas" align="left">
            <span className="text-xs font-semibold">Change history</span>
          </Td>
          <Td className="bg-canvas" align="left">
            {(history.data ?? []).length === 0 ? (
              <span className="text-xs text-ink-soft">No changes recorded.</span>
            ) : (
              <ul className="text-xs text-ink-soft">
                {history.data?.map((entry) => (
                  <li key={entry.id}>
                    {dateLabel(entry.changedAt)}: was{' '}
                    {assumption.unit === 'rate' ? percent(entry.value, 2) : assumption.unit === 'cents' ? rands(entry.value) : entry.value}
                    {entry.changedBy ? ` · changed by ${entry.changedBy}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Td>
          <Td className="bg-canvas" align="left">
            {' '}
          </Td>
          <Td className="bg-canvas" align="left">
            {' '}
          </Td>
          <Td className="bg-canvas" align="left">
            {' '}
          </Td>
          <Td className="bg-canvas" align="left">
            {' '}
          </Td>
        </tr>
      )}
    </>
  );
}

function GroupSettingsCard({ settings }: { settings: GroupSettings }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(settings);

  const save = useMutation({
    mutationFn: (body: unknown) => api.put('/api/group-settings', body),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  return (
    <Card
      title="Group settings"
      subtitle="VAT status, monthly capacity and the historic growth band the verdict is judged against."
      actions={
        <Button
          onClick={() =>
            save.mutate({
              vatRegistered: form.vatRegistered,
              vatRegisteredFromDate: form.vatRegisteredFromDate,
              vatPricingMode: form.vatPricingMode,
              monthlyCapacity: form.monthlyCapacity,
              growthBandLow: form.growthBandLow,
              growthBandHigh: form.growthBandHigh,
              growthBandSource: form.growthBandSource,
            })
          }
          disabled={save.isPending}
        >
          Save
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="VAT registered">
          <Select value={form.vatRegistered ? 'yes' : 'no'} onChange={(event) => setForm({ ...form, vatRegistered: event.target.value === 'yes' })}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </Select>
        </Field>
        <Field label="Registered from">
          <TextInput
            type="date"
            value={form.vatRegisteredFromDate ?? ''}
            onChange={(event) => setForm({ ...form, vatRegisteredFromDate: event.target.value || null })}
          />
        </Field>
        <Field label="VAT on nightly rates" hint="A pricing decision, not an accounting one.">
          <Select
            value={form.vatPricingMode}
            onChange={(event) => setForm({ ...form, vatPricingMode: event.target.value as 'absorbed' | 'added' })}
          >
            <option value="absorbed">Absorbed, the rate is unchanged</option>
            <option value="added">Added, the guest pays it</option>
          </Select>
        </Field>
        <Field label="Group monthly capacity" hint="What the five directors can carry between them each month.">
          <TextInput
            value={form.monthlyCapacity / 100}
            onChange={(event) => setForm({ ...form, monthlyCapacity: parseRands(event.target.value) ?? 0 })}
          />
        </Field>
        <Field label="Growth band, low">
          <TextInput
            value={(form.growthBandLow * 100).toFixed(1)}
            onChange={(event) => setForm({ ...form, growthBandLow: parsePercent(event.target.value) ?? form.growthBandLow })}
          />
        </Field>
        <Field label="Growth band, high">
          <TextInput
            value={(form.growthBandHigh * 100).toFixed(1)}
            onChange={(event) => setForm({ ...form, growthBandHigh: parsePercent(event.target.value) ?? form.growthBandHigh })}
          />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Where the growth band came from" hint="Lightstone, deeds data or agent evidence. The verdict is judged against this.">
            <TextInput
              value={form.growthBandSource ?? ''}
              onChange={(event) => setForm({ ...form, growthBandSource: event.target.value })}
            />
          </Field>
        </div>
      </div>
      {save.error && <div className="mt-3"><ErrorNote error={save.error} /></div>}
    </Card>
  );
}

function FeeScaleEditor({ rows }: { rows: FeeScaleRow[] }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<FeeScaleRow[] | null>(null);

  const save = useMutation({
    mutationFn: (body: unknown) => api.put('/api/fee-scales', body),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setDraft(null);
    },
  });

  if (!draft) {
    return (
      <Button variant="secondary" onClick={() => setDraft(rows)}>
        Edit the scales
      </Button>
    );
  }

  return (
    <div>
      <Table className="min-w-[46rem]">
        <thead>
          <tr>
            <Th>Kind</Th>
            <Th>Effective from</Th>
            <Th align="right">From</Th>
            <Th align="right">To</Th>
            <Th align="right">Base</Th>
            <Th align="right">Rate</Th>
            <Th>Verified</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {draft.map((row, index) => (
            <tr key={row.id}>
              <Td>
                <Select
                  value={row.kind}
                  onChange={(event) => {
                    const next = [...draft];
                    next[index] = { ...row, kind: event.target.value as FeeScaleRow['kind'] };
                    setDraft(next);
                  }}
                >
                  {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABEL[kind]}
                    </option>
                  ))}
                </Select>
              </Td>
              <Td>
                <TextInput
                  type="date"
                  value={row.effectiveFrom}
                  onChange={(event) => {
                    const next = [...draft];
                    next[index] = { ...row, effectiveFrom: event.target.value };
                    setDraft(next);
                  }}
                />
              </Td>
              <Td align="right">
                <TextInput
                  value={row.lower / 100}
                  onChange={(event) => {
                    const next = [...draft];
                    next[index] = { ...row, lower: parseRands(event.target.value) ?? 0 };
                    setDraft(next);
                  }}
                />
              </Td>
              <Td align="right">
                <TextInput
                  value={row.upper === null ? '' : row.upper / 100}
                  placeholder="and above"
                  onChange={(event) => {
                    const next = [...draft];
                    next[index] = { ...row, upper: event.target.value === '' ? null : parseRands(event.target.value) };
                    setDraft(next);
                  }}
                />
              </Td>
              <Td align="right">
                <TextInput
                  value={row.baseAmount / 100}
                  onChange={(event) => {
                    const next = [...draft];
                    next[index] = { ...row, baseAmount: parseRands(event.target.value) ?? 0 };
                    setDraft(next);
                  }}
                />
              </Td>
              <Td align="right">
                <TextInput
                  value={(row.marginalRate * 100).toFixed(2)}
                  onChange={(event) => {
                    const next = [...draft];
                    next[index] = { ...row, marginalRate: parsePercent(event.target.value) ?? 0 };
                    setDraft(next);
                  }}
                />
              </Td>
              <Td>
                <Select
                  value={row.verified ? 'yes' : 'no'}
                  onChange={(event) => {
                    const next = [...draft];
                    next[index] = { ...row, verified: event.target.value === 'yes' };
                    setDraft(next);
                  }}
                >
                  <option value="no">Unverified</option>
                  <option value="yes">Verified</option>
                </Select>
              </Td>
              <Td align="right">
                <button type="button" className="text-xs text-fail hover:underline" onClick={() => setDraft(draft.filter((_, i) => i !== index))}>
                  Remove
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            setDraft([
              ...draft,
              {
                id: `new-${Date.now()}`,
                kind: 'transfer_duty',
                effectiveFrom: new Date().toISOString().slice(0, 10),
                lower: 0,
                upper: null,
                baseAmount: 0,
                marginalRate: 0,
                verified: false,
                source: null,
              },
            ])
          }
        >
          Add a band
        </Button>
        <Button
          onClick={() =>
            save.mutate(
              draft.map((row) => ({
                kind: row.kind,
                effectiveFrom: row.effectiveFrom,
                lower: row.lower,
                upper: row.upper,
                baseAmount: row.baseAmount,
                marginalRate: row.marginalRate,
                verified: row.verified,
                source: row.source,
              })),
            )
          }
          disabled={save.isPending}
        >
          Save the scales
        </Button>
        <Button variant="secondary" onClick={() => setDraft(null)}>
          Cancel
        </Button>
      </div>
      {save.error && <div className="mt-3"><ErrorNote error={save.error} /></div>}
    </div>
  );
}
