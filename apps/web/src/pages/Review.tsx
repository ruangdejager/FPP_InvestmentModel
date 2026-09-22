import { ASSET_TYPES, ASSET_TYPE_LABELS } from '@fp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StrGateBadge } from '../components/StrGate.js';
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
import { monthLabel, parseRands, percent, rands } from '../lib/format.js';
import type { VerdictSummary } from '../lib/types.js';

type SortKey = 'breakevenGrowth' | 'worstShortfall' | 'peak' | 'name' | 'yield';

const OUTCOME_TONE = {
  pass: 'pass',
  acceptable: 'caution',
  fail: 'fail',
  blocked: 'fail',
  never_breaks_even: 'fail',
} as const;

const OUTCOME_LABEL = {
  pass: 'Pass',
  acceptable: 'Acceptable',
  fail: 'Fail',
  blocked: 'Blocked',
  never_breaks_even: 'Never breaks even',
} as const;

export default function ReviewPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortKey>('breakevenGrowth');
  const [showNew, setShowNew] = useState(false);

  const summaries = useQuery({
    queryKey: ['verdict-summaries'],
    queryFn: () => api.get<VerdictSummary[]>('/api/verdict-summaries'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/properties/${id}`),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const rows = useMemo(() => {
    const all = (summaries.data ?? []).filter((row) => row.property.status === 'review');
    const sorted = [...all];
    sorted.sort((a, b) => {
      if (a.error || b.error) return a.error ? 1 : -1;
      switch (sort) {
        case 'breakevenGrowth':
          return a.breakevenGrowth - b.breakevenGrowth;
        case 'worstShortfall':
          return b.worstMonthYearOnePerDirector - a.worstMonthYearOnePerDirector;
        case 'peak':
          return a.peakCumulativeOutflowPerDirector - b.peakCumulativeOutflowPerDirector;
        case 'yield':
          return (b.netOperatingYield ?? 0) - (a.netOperatingYield ?? 0);
        default:
          return a.property.name.localeCompare(b.property.name);
      }
    });
    return sorted;
  }, [summaries.data, sort]);

  if (summaries.isLoading) return <Spinner label="Running every deal" />;
  if (summaries.error) return <ErrorNote error={summaries.error} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Properties under review</h1>
          <p className="text-sm text-ink-soft">
            Sorted so the best candidate is obvious. The decisive number is the growth each unit must achieve to beat
            the ETF.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <Field label="Sort by">
            <Select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="breakevenGrowth">Breakeven growth, lowest first</option>
              <option value="worstShortfall">Worst month of year one</option>
              <option value="peak">Peak cash per director</option>
              <option value="yield">Net operating yield</option>
              <option value="name">Name</option>
            </Select>
          </Field>
          <Button onClick={() => setShowNew((open) => !open)}>{showNew ? 'Close' : 'Add a property'}</Button>
        </div>
      </div>

      {showNew && <NewPropertyForm onCreated={(id) => navigate(`/properties/${id}`)} />}

      {rows.length === 0 && (
        <Card>
          <p className="text-sm text-ink-soft">No properties under review yet. Add one to model it.</p>
        </Card>
      )}

      <div className="grid gap-4 lg:hidden">
        {rows.map((row) => (
          <Card key={row.property.id} title={row.property.name} subtitle={row.property.suburb ?? undefined}>
            {row.error ? (
              <Warning title="This deal could not be projected">{row.error}</Warning>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={OUTCOME_TONE[row.outcome]}>{OUTCOME_LABEL[row.outcome]}</Badge>
                  <StrGateBadge status={row.property.strPermitted} />
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase text-ink-soft">Breakeven growth</dt>
                    <dd className="tabular font-semibold">{percent(row.breakevenGrowth)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-ink-soft">Worst month, per director</dt>
                    <dd className="tabular font-semibold">{rands(row.worstMonthYearOnePerDirector)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-ink-soft">Peak cash, per director</dt>
                    <dd className="tabular font-semibold">{rands(row.peakCumulativeOutflowPerDirector)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-ink-soft">Breakeven</dt>
                    <dd className="tabular font-semibold">
                      {row.breakevenMonth === null ? 'never' : monthLabel(row.breakevenMonth)}
                    </dd>
                  </div>
                </dl>
                <div className="flex gap-3 text-sm">
                  <Link className="font-medium text-accent hover:underline" to={`/properties/${row.property.id}/verdict`}>
                    Verdict
                  </Link>
                  <Link className="font-medium text-accent hover:underline" to={`/properties/${row.property.id}`}>
                    Inputs
                  </Link>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card className="hidden lg:block">
        <Table>
          <thead>
            <tr>
              <Th>Property</Th>
              <Th>Verdict</Th>
              <Th>Gate</Th>
              <Th align="right">Breakeven growth</Th>
              <Th align="right">Month 1 / director</Th>
              <Th align="right">Worst month / director</Th>
              <Th align="right">Peak cash / director</Th>
              <Th align="right">Breakeven</Th>
              <Th align="right">Yield</Th>
              <Th align="right">Evidence</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.property.id} className="hover:bg-canvas/60">
                <Td>
                  <Link className="font-medium text-accent hover:underline" to={`/properties/${row.property.id}/verdict`}>
                    {row.property.name}
                  </Link>
                  <div className="text-xs text-ink-soft">
                    {ASSET_TYPE_LABELS[row.property.assetType as keyof typeof ASSET_TYPE_LABELS] ?? row.property.assetType} ·{' '}
                    {rands(row.property.purchasePrice)}
                    {row.property.isDemo && ' · demo'}
                  </div>
                </Td>
                {row.error ? (
                  <Td className="text-fail" align="left">
                    {row.error}
                  </Td>
                ) : (
                  <>
                    <Td>
                      <Badge tone={OUTCOME_TONE[row.outcome]}>{OUTCOME_LABEL[row.outcome]}</Badge>
                    </Td>
                    <Td>
                      <StrGateBadge status={row.property.strPermitted} />
                    </Td>
                    <Td align="right">
                      <span className={row.growthVerdict === 'bet' ? 'font-semibold text-fail' : 'font-semibold'}>
                        {row.breakevenGrowthConverged ? percent(row.breakevenGrowth) : 'unsolved'}
                      </span>
                      <div className="text-xs text-ink-soft">
                        band {percent(row.growthBand.low, 0)}–{percent(row.growthBand.high, 0)}
                      </div>
                    </Td>
                    <Td align="right">{rands(row.monthOneShortfallPerDirector)}</Td>
                    <Td align="right">{rands(row.worstMonthYearOnePerDirector)}</Td>
                    <Td align="right">{rands(row.peakCumulativeOutflowPerDirector)}</Td>
                    <Td align="right">{row.breakevenMonth === null ? 'never' : `month ${row.breakevenMonth}`}</Td>
                    <Td align="right">{percent(row.netOperatingYield)}</Td>
                    <Td align="right">
                      {row.confidence.evidencedCount}/{row.confidence.totalCount}
                    </Td>
                  </>
                )}
                <Td align="right">
                  <div className="flex justify-end gap-2 text-xs">
                    <Link className="text-accent hover:underline" to={`/properties/${row.property.id}`}>
                      Inputs
                    </Link>
                    <button
                      type="button"
                      className="text-fail hover:underline"
                      onClick={() => {
                        const label = row.property.isDemo ? 'the demo property' : row.property.name;
                        if (window.confirm(`Delete ${label} and everything recorded against it? This cannot be undone.`)) {
                          remove.mutate(row.property.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function NewPropertyForm({ onCreated }: { onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [suburb, setSuburb] = useState('');
  const [assetType, setAssetType] = useState<(typeof ASSET_TYPES)[number]>('apt_1bed');
  const [price, setPrice] = useState('');
  const [strPermitted, setStrPermitted] = useState<'yes' | 'no' | 'unknown'>('unknown');

  const create = useMutation({
    mutationFn: (body: unknown) => api.post<{ id: string }>('/api/properties', body),
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      onCreated(result.id);
    },
  });

  return (
    <Card title="Add a property" subtitle="The revenue benchmark for the asset type is used as a starting figure, marked as an assumption.">
      <form
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          const purchasePrice = parseRands(price);
          if (!purchasePrice) return;
          create.mutate({ name, suburb, assetType, purchasePrice, strPermitted, status: 'review' });
        }}
      >
        <Field label="Name">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} required placeholder="12 Merriman" />
        </Field>
        <Field label="Suburb">
          <TextInput value={suburb} onChange={(event) => setSuburb(event.target.value)} placeholder="Die Boord" />
        </Field>
        <Field label="Asset type">
          <Select value={assetType} onChange={(event) => setAssetType(event.target.value as typeof assetType)}>
            {ASSET_TYPES.map((type) => (
              <option key={type} value={type}>
                {ASSET_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Purchase price">
          <TextInput value={price} onChange={(event) => setPrice(event.target.value)} required placeholder="R3 500 000" />
        </Field>
        <Field label="Short-term letting permitted?" hint="Unknown blocks the verdict until it is resolved.">
          <Select value={strPermitted} onChange={(event) => setStrPermitted(event.target.value as typeof strPermitted)}>
            <option value="unknown">Not checked</option>
            <option value="yes">Yes, rules checked</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <div className="sm:col-span-2 lg:col-span-5">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create and open'}
          </Button>
          {create.error && <div className="mt-3"><ErrorNote error={create.error} /></div>}
        </div>
      </form>
    </Card>
  );
}
