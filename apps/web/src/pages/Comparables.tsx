import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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
  TextArea,
  TextInput,
  Th,
  Warning,
} from '../components/ui.js';
import { api } from '../lib/api.js';
import { dateLabel, parseRands, percent, rands } from '../lib/format.js';
import type { Comparable } from '../lib/types.js';

interface Statistics {
  currentYear: number;
  cpi: number;
  undatedComparables: number;
  medianPricePerM2ByScheme: { scheme: string; medianPricePerM2: number | null; count: number }[];
  medianAdr: number | null;
  medianOccupancy: number | null;
  medianAnnualGross: number | null;
  note: string;
}

interface RepeatSale {
  address: string;
  firstDate: string;
  firstPrice: number;
  lastDate: string;
  lastPrice: number;
  years: number;
  impliedAnnualGrowth: number;
}

const FIELDS = [
  'schemeName',
  'address',
  'assetType',
  'bedrooms',
  'floorAreaM2',
  'transactionDate',
  'price',
  'adr',
  'occupancy',
  'annualGross',
  'observationYear',
  'notes',
] as const;

export default function ComparablesPage() {
  const queryClient = useQueryClient();
  const [scheme, setScheme] = useState('');

  const comparables = useQuery({
    queryKey: ['comparables', scheme],
    queryFn: () => api.get<Comparable[]>(`/api/comparables${scheme ? `?scheme=${encodeURIComponent(scheme)}` : ''}`),
  });
  const statistics = useQuery({ queryKey: ['comp-stats'], queryFn: () => api.get<Statistics>('/api/comparables/statistics') });
  const repeats = useQuery({ queryKey: ['repeat-sales'], queryFn: () => api.get<RepeatSale[]>('/api/comparables/repeat-sales') });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/comparables/${id}`),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  if (comparables.isLoading) return <Spinner label="Loading comparables" />;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Comparables</h1>
          <p className="text-sm text-ink-soft">
            Entered or imported, never scraped. Every figure carries the year it was observed, because a table that
            averages 2022 rands with 2025 rands is not evidence.
          </p>
        </div>
        <Field label="Filter by scheme">
          <TextInput value={scheme} onChange={(event) => setScheme(event.target.value)} placeholder="Scheme name" />
        </Field>
      </header>

      {statistics.data && (
        <Card title="Derived statistics" subtitle={statistics.data.note}>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-ink-soft">Median nightly rate</p>
              <p className="tabular text-xl font-semibold">{rands(statistics.data.medianAdr)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-ink-soft">Median occupancy</p>
              <p className="tabular text-xl font-semibold">
                {statistics.data.medianOccupancy === null ? '—' : percent(statistics.data.medianOccupancy / 10_000)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-ink-soft">Median annual gross</p>
              <p className="tabular text-xl font-semibold">{rands(statistics.data.medianAnnualGross)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-ink-soft">Undated comparables</p>
              <p className="tabular text-xl font-semibold">{statistics.data.undatedComparables}</p>
            </div>
          </div>

          {statistics.data.undatedComparables > 0 && (
            <div className="mt-4">
              <Warning tone="caution" title="Some comparables have no observation year.">
                They are left out of every median above rather than quietly folded in at today's value. Add the year they
                were observed and they will count.
              </Warning>
            </div>
          )}

          {statistics.data.medianPricePerM2ByScheme.length > 0 && (
            <Table className="mt-4">
              <thead>
                <tr>
                  <Th>Scheme</Th>
                  <Th align="right">Median price per m², in today's rands</Th>
                  <Th align="right">Comparables</Th>
                </tr>
              </thead>
              <tbody>
                {statistics.data.medianPricePerM2ByScheme.map((row) => (
                  <tr key={row.scheme}>
                    <Td>{row.scheme}</Td>
                    <Td align="right">{rands(row.medianPricePerM2)}</Td>
                    <Td align="right">{row.count}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {(repeats.data?.length ?? 0) > 0 && (
        <Card
          title="Repeat sales"
          subtitle="The same address transacting twice. The only growth evidence that comes from the market rather than from an assumption."
        >
          <Table>
            <thead>
              <tr>
                <Th>Address</Th>
                <Th align="right">First</Th>
                <Th align="right">Last</Th>
                <Th align="right">Years</Th>
                <Th align="right">Implied annual growth</Th>
              </tr>
            </thead>
            <tbody>
              {repeats.data?.map((row) => (
                <tr key={row.address}>
                  <Td>{row.address}</Td>
                  <Td align="right">
                    {rands(row.firstPrice)} <span className="text-xs text-ink-soft">{dateLabel(row.firstDate)}</span>
                  </Td>
                  <Td align="right">
                    {rands(row.lastPrice)} <span className="text-xs text-ink-soft">{dateLabel(row.lastDate)}</span>
                  </Td>
                  <Td align="right">{row.years}</Td>
                  <Td align="right" className="font-semibold">
                    {percent(row.impliedAnnualGrowth)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <NewComparable />
      <CsvImport />

      <Card title={`${comparables.data?.length ?? 0} comparables`}>
        <Table className="min-w-[56rem]">
          <thead>
            <tr>
              <Th>Scheme / address</Th>
              <Th>Type</Th>
              <Th align="right">m²</Th>
              <Th align="right">Price</Th>
              <Th align="right">Per m²</Th>
              <Th align="right">Nightly</Th>
              <Th align="right">Annual gross</Th>
              <Th align="right">Observed</Th>
              <Th>Confidence</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {(comparables.data ?? []).map((row) => (
              <tr key={row.id} className={row.excludedFromBenchmarks ? 'opacity-60' : undefined}>
                <Td>
                  {row.schemeName ?? '—'}
                  <div className="text-xs text-ink-soft">{row.address ?? ''}</div>
                  {row.excludedFromBenchmarks && (
                    <div className="mt-1">
                      <Badge tone="caution">Excluded</Badge>
                      <span className="ml-1 text-xs text-ink-soft">{row.exclusionReason}</span>
                    </div>
                  )}
                </Td>
                <Td>{row.assetType ?? '—'}</Td>
                <Td align="right">{row.floorAreaM2 ?? '—'}</Td>
                <Td align="right">{rands(row.price)}</Td>
                <Td align="right">{rands(row.pricePerM2)}</Td>
                <Td align="right">{rands(row.adr)}</Td>
                <Td align="right">{rands(row.annualGross)}</Td>
                <Td align="right" className={row.observationYear ? '' : 'text-fail'}>
                  {row.observationYear ?? 'undated'}
                </Td>
                <Td>
                  <Badge tone={row.confidence === 'high' ? 'pass' : row.confidence === 'medium' ? 'caution' : 'fail'}>
                    {row.confidence}
                  </Badge>
                </Td>
                <Td align="right">
                  <button
                    type="button"
                    className="text-xs text-fail hover:underline"
                    onClick={() => {
                      if (window.confirm('Delete this comparable? This cannot be undone.')) remove.mutate(row.id);
                    }}
                  >
                    Delete
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="A future data feed" subtitle="The adapter interface exists and is deliberately unimplemented.">
        <p className="text-sm text-ink-soft">
          Property24, Private Property, Airbnb and the deeds office are not scraped. It is against their terms, it breaks
          constantly, and it produces data the directors cannot defend. When a licensed feed is bought, it plugs in here.
        </p>
      </Card>
    </div>
  );
}

function NewComparable() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: (body: unknown) => api.post('/api/comparables', body),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setForm({});
    },
  });

  return (
    <Card title="Add a comparable">
      <form
        className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({
            source: form.source ?? 'manual',
            schemeName: form.schemeName || null,
            address: form.address || null,
            assetType: form.assetType || null,
            bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
            floorAreaM2: form.floorAreaM2 ? Number(form.floorAreaM2) : null,
            transactionDate: form.transactionDate || null,
            price: form.price ? parseRands(form.price) : null,
            adr: form.adr ? parseRands(form.adr) : null,
            occupancy: form.occupancy ? Number(form.occupancy) / 100 : null,
            annualGross: form.annualGross ? parseRands(form.annualGross) : null,
            observationYear: form.observationYear ? Number(form.observationYear) : null,
            confidence: (form.confidence as 'high' | 'medium' | 'low') ?? 'medium',
            notes: form.notes || null,
          });
        }}
      >
        <Field label="Source">
          <Select value={form.source ?? 'manual'} onChange={(event) => setForm({ ...form, source: event.target.value })}>
            <option value="manual">Manual</option>
            <option value="deeds">Deeds office</option>
            <option value="lightstone">Lightstone</option>
            <option value="agent">Agent</option>
            <option value="listing">Listing</option>
            <option value="airbnb">Airbnb</option>
          </Select>
        </Field>
        {FIELDS.map((field) => (
          <Field key={field} label={field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}>
            <TextInput value={form[field] ?? ''} onChange={(event) => setForm({ ...form, [field]: event.target.value })} />
          </Field>
        ))}
        <Field label="Confidence">
          <Select value={form.confidence ?? 'medium'} onChange={(event) => setForm({ ...form, confidence: event.target.value })}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </Field>
        <div className="sm:col-span-3 lg:col-span-6">
          <Button type="submit" disabled={create.isPending}>
            Add it
          </Button>
          {create.error && <div className="mt-3"><ErrorNote error={create.error} /></div>}
        </div>
      </form>
    </Card>
  );
}

/**
 * Column mapping on upload, because every provider's CSV is different.
 */
function CsvImport() {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const parsed = useMemo(() => {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return null;
    const headers = (lines[0] as string).split(',').map((part) => part.trim());
    const rows = lines.slice(1).map((line) => {
      const values = line.split(',').map((part) => part.trim());
      const row: Record<string, string> = {};
      headers.forEach((header, index) => (row[header] = values[index] ?? ''));
      return row;
    });
    return { headers, rows };
  }, [text]);

  const load = useMutation({
    mutationFn: (rows: unknown[]) => api.post<{ imported: number; flagged: { index: number; reason: string }[] }>(
      '/api/comparables/import',
      { rows },
    ),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setText('');
    },
  });

  return (
    <Card title="Import from CSV" subtitle="Map the provider's columns onto ours. Nothing is guessed.">
      <Field label="Paste the CSV">
        <TextArea rows={5} value={text} onChange={(event) => setText(event.target.value)} />
      </Field>

      {parsed && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {FIELDS.map((field) => (
              <Field key={field} label={field}>
                <Select value={mapping[field] ?? ''} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}>
                  <option value="">Not in this file</option>
                  {parsed.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>

          <Button
            className="mt-3"
            disabled={load.isPending}
            onClick={() => {
              const rows = parsed.rows.map((row) => {
                const pick = (field: string) => (mapping[field] ? row[mapping[field] as string] : undefined);
                const money = (field: string) => {
                  const value = pick(field);
                  return value ? parseRands(value) : null;
                };
                return {
                  source: 'manual' as const,
                  schemeName: pick('schemeName') || null,
                  address: pick('address') || null,
                  assetType: pick('assetType') || null,
                  bedrooms: pick('bedrooms') ? Number(pick('bedrooms')) : null,
                  floorAreaM2: pick('floorAreaM2') ? Number(pick('floorAreaM2')) : null,
                  transactionDate: pick('transactionDate') || null,
                  price: money('price'),
                  adr: money('adr'),
                  occupancy: pick('occupancy') ? Number(pick('occupancy')) / 100 : null,
                  annualGross: money('annualGross'),
                  observationYear: pick('observationYear') ? Number(pick('observationYear')) : null,
                  notes: pick('notes') || null,
                };
              });
              load.mutate(rows);
            }}
          >
            {load.isPending ? 'Importing…' : `Import ${parsed.rows.length} rows`}
          </Button>
        </>
      )}

      {load.data && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-pass">Imported {load.data.imported} rows.</p>
          {load.data.flagged.length > 0 && (
            <Warning tone="caution" title={`${load.data.flagged.length} rows were flagged and excluded from benchmarks.`}>
              {load.data.flagged.map((flag) => (
                <p key={flag.index}>
                  Row {flag.index + 1}: {flag.reason}
                </p>
              ))}
            </Warning>
          )}
        </div>
      )}
      {load.error && <div className="mt-3"><ErrorNote error={load.error} /></div>}
    </Card>
  );
}
