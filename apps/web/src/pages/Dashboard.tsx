import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StrGateBadge } from '../components/StrGate.js';
import { Card, ErrorNote, Spinner, Stat, Table, Td, Th, Warning } from '../components/ui.js';
import { api } from '../lib/api.js';
import { percent, rands, randsShort } from '../lib/format.js';
import type { DashboardResponse, VatTracker } from '../lib/types.js';

export default function DashboardPage() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardResponse>('/api/dashboard') });
  const vat = useQuery({ queryKey: ['vat'], queryFn: () => api.get<VatTracker>('/api/dashboard/vat') });

  if (dashboard.isLoading) return <Spinner label="Adding up the group" />;
  if (dashboard.error) return <ErrorNote error={dashboard.error} />;
  if (!dashboard.data) return null;

  const data = dashboard.data;
  const draw = data.currentShortfall < 0 ? -data.currentShortfall : 0;
  const capacityUsed = data.capacity.monthlyCapacity > 0 ? draw / data.capacity.monthlyCapacity : 0;

  const next12 = data.next12Months.map((value, index) => ({
    month: index + 1,
    shortfall: value / 100,
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Group dashboard</h1>
        <p className="text-sm text-ink-soft">What the five directors are carrying this month, and what is coming.</p>
      </header>

      {data.unverifiedAssumptions > 0 && (
        <Warning tone="caution" title={`${data.unverifiedAssumptions} assumptions have not been checked by anyone.`}>
          <Link className="underline" to="/assumptions">
            Every rate, bracket and fee in this model is a placeholder until a director verifies it.
          </Link>
        </Warning>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Stat
            label="This month, across the group"
            value={rands(data.currentShortfall)}
            tone={data.currentShortfall < 0 ? 'fail' : 'pass'}
            hint={`${rands(data.currentShortfallPerDirector)} per director`}
          />
        </Card>
        <Card>
          <Stat label="Portfolio value" value={rands(data.portfolioValue)} hint={`${data.properties.length} owned properties`} />
        </Card>
        <Card>
          <Stat label="Total debt" value={rands(data.totalDebt)} hint={`Blended LTV ${percent(data.blendedLtv)}`} />
        </Card>
        <Card>
          <Stat
            label="Headroom before the next purchase"
            value={rands(data.capacity.headroom)}
            tone={data.capacity.headroom <= 0 ? 'fail' : capacityUsed > 0.7 ? 'caution' : 'pass'}
            hint={`${rands(data.capacity.headroomPerDirector)} per director · ${percent(capacityUsed, 0)} of stated capacity used`}
          />
        </Card>
      </div>

      <Card title="The next twelve months" subtitle="Projected group shortfall, month by month. Winter is the month that decides how much cash must be available.">
        {data.properties.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing is owned yet, so there is nothing to project.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={next12} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid stroke="#e7ebf2" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => randsShort(value * 100)} width={60} />
                <Tooltip formatter={(value: number) => randsShort(value * 100)} labelFormatter={(label) => `Month +${label}`} />
                <ReferenceLine y={0} stroke="#46536b" />
                <Bar dataKey="shortfall" name="Shortfall">
                  {next12.map((entry) => (
                    <Cell key={entry.month} fill={entry.shortfall < 0 ? '#b42318' : '#0f7b52'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Cash calls this month, by director" subtitle="Split equally five ways.">
        <p className="tabular text-2xl font-semibold">{rands(data.currentShortfallPerDirector)}</p>
        <p className="text-sm text-ink-soft">Each of the {data.directorCount} directors, for this month.</p>
      </Card>

      {vat.data && <VatCard tracker={vat.data} />}

      <Card title="Owned properties">
        {data.properties.length === 0 ? (
          <p className="text-sm text-ink-soft">No properties are marked as owned yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Property</Th>
                <Th>Gate</Th>
                <Th align="right">Shortfall</Th>
                <Th align="right">Per director</Th>
                <Th align="right">Value</Th>
                <Th align="right">Debt</Th>
                <Th align="right">LTV</Th>
              </tr>
            </thead>
            <tbody>
              {data.properties.map((row) => (
                <tr key={row.property.id}>
                  <Td>
                    <Link className="text-accent hover:underline" to={`/properties/${row.property.id}/portfolio`}>
                      {row.property.name}
                    </Link>
                  </Td>
                  <Td>
                    <StrGateBadge status={row.property.strPermitted} />
                  </Td>
                  <Td align="right">{rands(row.currentShortfall)}</Td>
                  <Td align="right">{rands(row.currentShortfallPerDirector)}</Td>
                  <Td align="right">{rands(row.value)}</Td>
                  <Td align="right">{rands(row.debt)}</Td>
                  <Td align="right">{percent(row.ltv)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function VatCard({ tracker }: { tracker: VatTracker }) {
  const proportion = tracker.proportionOfThreshold;
  const tone = tracker.registered ? 'accent' : proportion > 0.8 ? 'fail' : proportion > 0.6 ? 'caution' : 'pass';

  return (
    <Card title="VAT turnover tracker" subtitle={tracker.note}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Rolling twelve months"
          value={rands(tracker.latestRolling12)}
          tone={tone === 'accent' ? 'neutral' : tone}
          hint={`${percent(proportion, 0)} of the ${rands(tracker.threshold)} threshold`}
        />
        <Stat label="Registered" value={tracker.registered ? `Yes, from ${tracker.registeredFrom ?? 'unknown'}` : 'No'} />
        <Stat label="Pricing decision" value={tracker.pricingMode === 'absorbed' ? 'Absorbed into the rate' : 'Added to the rate'} />
      </div>

      {!tracker.registered && proportion > 0.6 && (
        <div className="mt-4">
          <Warning tone="caution" title="Registration is coming.">
            Registration is a group event on rolling twelve month turnover, not a per-property one, and it arrives around
            the third or fourth unit. Decide now whether VAT will be absorbed into the nightly rate or added to it: that
            is a pricing decision, not an accounting one.
          </Warning>
        </div>
      )}

      {tracker.series.length > 0 && (
        <div className="mt-4 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tracker.series.map((point) => ({ ...point, rolling: point.rolling12 / 100 }))}>
              <CartesianGrid stroke="#e7ebf2" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => randsShort(value * 100)} width={60} />
              <Tooltip formatter={(value: number) => randsShort(value * 100)} />
              <ReferenceLine
                y={tracker.threshold / 100}
                stroke="#b42318"
                strokeDasharray="4 3"
                label={{ value: 'threshold', fontSize: 11, fill: '#b42318', position: 'insideTopLeft' }}
              />
              <Bar dataKey="rolling" name="Rolling twelve months" fill="#1f4b99" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
