import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Button, Card, ErrorNote, Field, Spinner, Table, Td, TextInput, Th, Warning } from '../components/ui.js';
import { api } from '../lib/api.js';
import { parseRands, percent, rands, randsShort } from '../lib/format.js';
import type { AssetClassResult } from '../lib/types.js';

interface AssetClassResponse {
  threshold: number;
  results: (AssetClassResult & { referencePrice: number | null })[];
  benchmarks: {
    assetType: string;
    label: string;
    unitYears: number | null;
    medianAnnualGross: number;
    lowAnnualGross: number | null;
    highAnnualGross: number | null;
    observationYear: number;
    source: string | null;
    notes: string | null;
  }[];
  note: string;
}

/**
 * Arguably more valuable than any individual deal verdict: it asks whether the
 * group is shopping in the right segment at all.
 */
export default function AssetClassesPage() {
  const [threshold, setThreshold] = useState('');
  const applied = parseRands(threshold);

  const query = useQuery({
    queryKey: ['asset-classes', applied],
    queryFn: () => api.get<AssetClassResponse>(`/api/asset-classes${applied ? `?threshold=${applied}` : ''}`),
  });

  if (query.isLoading) return <Spinner label="Solving every asset type" />;
  if (query.error) return <ErrorNote error={query.error} />;
  if (!query.data) return null;

  const data = query.data;
  const chartData = data.results.map((row) => ({
    label: row.label,
    price: row.maximumPrice / 100,
    covers: row.coversItsOwnInterest,
  }));

  const noneCover = data.results.filter((row) => !row.coversItsOwnInterest && !row.assetType.startsWith('house'));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Asset class comparison</h1>
          <p className="max-w-3xl text-sm text-ink-soft">{data.note}</p>
        </div>
        <div className="flex items-end gap-2">
          <Field label="Shortfall ceiling per director">
            <TextInput
              value={threshold}
              placeholder={String(data.threshold / 100)}
              onChange={(event) => setThreshold(event.target.value)}
            />
          </Field>
          <Button variant="secondary" onClick={() => query.refetch()}>
            Apply
          </Button>
        </div>
      </header>

      {noneCover.length > 0 && (
        <Warning title="No apartment type covers its own interest.">
          On the seeded revenue benchmarks and cost stack, every apartment class earns a net operating yield below the
          cost of debt. Larger properties close the gap substantially. That bears directly on whether the group is
          shopping in the right segment at all.
        </Warning>
      )}

      <Card title="Maximum affordable price" subtitle={`At a per-director shortfall ceiling of ${rands(data.threshold)}.`}>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid stroke="#e7ebf2" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => randsShort(value * 100)} width={60} />
              <Tooltip formatter={(value: number) => randsShort(value * 100)} />
              <Bar dataKey="price" name="Maximum price">
                {chartData.map((entry) => (
                  <Cell key={entry.label} fill={entry.covers ? '#0f7b52' : '#1f4b99'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <Table className="mt-4 min-w-[48rem]">
          <thead>
            <tr>
              <Th>Asset type</Th>
              <Th align="right">Benchmark revenue</Th>
              <Th align="right">Reference price</Th>
              <Th align="right">Net operating yield</Th>
              <Th align="right">Cleaning share of gross</Th>
              <Th align="right">Cost of debt</Th>
              <Th align="right">Maximum price</Th>
              <Th>Covers its interest?</Th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((row) => (
              <tr key={row.assetType}>
                <Td>{row.label}</Td>
                <Td align="right">{rands(row.year1GrossRevenue)}</Td>
                <Td align="right">{rands(row.referencePrice)}</Td>
                <Td align="right" className={row.coversItsOwnInterest ? 'text-pass font-semibold' : 'text-fail font-semibold'}>
                  {percent(row.netOperatingYield)}
                </Td>
                <Td align="right" className={(row.year1CleaningPctOfGross ?? 0) > 0.15 ? 'text-fail' : ''}>
                  {percent(row.year1CleaningPctOfGross)}
                </Td>
                <Td align="right">{percent(row.costOfDebt)}</Td>
                <Td align="right">{row.converged ? rands(row.maximumPrice) : 'no answer'}</Td>
                <Td>
                  <Badge tone={row.coversItsOwnInterest ? 'pass' : 'fail'}>{row.coversItsOwnInterest ? 'Yes' : 'No'}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <p className="mt-3 text-sm text-ink-soft">
          Cleaning scales with guest departures rather than with revenue, so it falls hardest on the cheapest units. That
          single ratio explains most of the difference in net operating yield between a studio and a house.
        </p>
      </Card>

      <Card
        title="Where the revenue benchmarks come from"
        subtitle="Median of clean full calendar years from the managers' own records. Confidential."
      >
        <Table>
          <thead>
            <tr>
              <Th>Asset type</Th>
              <Th align="right">Unit years</Th>
              <Th align="right">Median annual gross</Th>
              <Th align="right">Range</Th>
              <Th align="right">Observed</Th>
            </tr>
          </thead>
          <tbody>
            {data.benchmarks.map((row) => (
              <tr key={row.assetType}>
                <Td>{row.label}</Td>
                <Td align="right">{row.unitYears ?? '—'}</Td>
                <Td align="right">{rands(row.medianAnnualGross)}</Td>
                <Td align="right">
                  {rands(row.lowAnnualGross)} – {rands(row.highAnnualGross)}
                </Td>
                <Td align="right">{row.observationYear}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-ink-soft">
          These pool unit-years from 2022 to 2025, and the earliest of those are covid suppressed. They are recorded at
          the pool midpoint and restated to current rands wherever they are compared. The studio and one-bedroom figures
          are statistically indistinguishable from each other.
        </p>
      </Card>
    </div>
  );
}
