import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StrGateWarning } from '../components/StrGate.js';
import { Abbr, Badge, Button, Card, ErrorNote, Field, Select, Spinner, Stat, Table, Td, Th, Warning } from '../components/ui.js';
import { api } from '../lib/api.js';
import { monthLabel, percent, rands, randsShort, ratio, yearsAndMonths } from '../lib/format.js';
import type { Property, Scenario, VerdictResponse } from '../lib/types.js';

interface WealthResponse {
  series: {
    monthIndex: number;
    propertyValue: number;
    bondBalance: number;
    cumulativeCashIn: number;
    realDeflator: number;
    byHurdle: { hurdleRate: number; etfNetValue: number; propertyNetEquity: number }[];
  }[];
  hurdleRates: number[];
  primaryHurdleRate: number;
}

const OUTCOME_COPY = {
  pass: { tone: 'pass', label: 'Pass' },
  acceptable: { tone: 'caution', label: 'Acceptable' },
  fail: { tone: 'fail', label: 'Fail' },
  blocked: { tone: 'fail', label: 'Blocked' },
  never_breaks_even: { tone: 'fail', label: 'Never breaks even' },
} as const;

const GROWTH_COPY = {
  defensible: {
    tone: 'pass' as const,
    text: 'Below the growth band the directors entered, so the deal does not need an unusual market to work.',
  },
  marginal: {
    tone: 'caution' as const,
    text: 'Inside the growth band. It needs the market to keep doing what it has done, with nothing to spare.',
  },
  bet: {
    tone: 'fail' as const,
    text: 'Above the growth band the directors entered. This deal is a bet on growth the market has not shown.',
  },
  unsolved: {
    tone: 'fail' as const,
    text: 'No growth rate inside a plausible range makes this deal match the ETF.',
  },
};

export default function VerdictPage() {
  const { propertyId } = useParams();
  const [scenarioId, setScenarioId] = useState<string | null>(null);

  const property = useQuery({
    queryKey: ['property', propertyId],
    queryFn: () => api.get<{ property: Property; scenarios: Scenario[] }>(`/api/properties/${propertyId}`),
  });

  const activeScenario = scenarioId ?? property.data?.scenarios.find((s) => s.isPrimary)?.id ?? property.data?.scenarios[0]?.id;

  const verdict = useQuery({
    queryKey: ['verdict', activeScenario],
    queryFn: () => api.get<VerdictResponse>(`/api/scenarios/${activeScenario}/verdict`),
    enabled: Boolean(activeScenario),
  });

  const wealth = useQuery({
    queryKey: ['wealth', activeScenario],
    queryFn: () => api.get<WealthResponse>(`/api/scenarios/${activeScenario}/wealth`),
    enabled: Boolean(activeScenario),
  });

  if (property.isLoading || verdict.isLoading) return <Spinner label="Running the deal" />;
  if (property.error) return <ErrorNote error={property.error} />;
  if (verdict.error) return <ErrorNote error={verdict.error} />;
  if (!verdict.data || !property.data) return null;

  const { verdict: v, summary, months, confidence } = verdict.data;
  const outcome = OUTCOME_COPY[v.outcome];
  const growth = GROWTH_COPY[v.growthVerdict];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-soft">Verdict</p>
          <h1 className="text-xl font-semibold">{verdict.data.property.name}</h1>
          <p className="text-sm text-ink-soft">
            {rands(verdict.data.property.purchasePrice)} · {verdict.data.property.suburb ?? 'Stellenbosch'} ·{' '}
            {verdict.data.property.transferDate
              ? `transfers ${verdict.data.property.transferDate}`
              : 'no transfer date yet, modelled from the first of next month'}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-end gap-2">
          {property.data.scenarios.length > 1 && (
            <Field label="Scenario">
              <Select value={activeScenario} onChange={(event) => setScenarioId(event.target.value)}>
                {property.data.scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                    {scenario.isPrimary ? ' (primary)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Link to={`/properties/${propertyId}`}>
            <Button variant="secondary">Edit inputs</Button>
          </Link>
          <Button variant="secondary" onClick={() => window.print()}>
            Export to PDF
          </Button>
        </div>
      </header>

      <StrGateWarning property={verdict.data.property} />

      {v.outcome === 'never_breaks_even' && (
        <Warning title="This deal never breaks even inside the projection.">
          Revenue escalates at {percent(summary.revenueEscalation)} against costs escalating at{' '}
          {percent(summary.weightedCostEscalation)}, a real spread of {percent(v.realEscalationSpread)}. The mechanism the
          strategy relies on — revenue outrunning a fixed bond payment — is not operating here, so the shortfall does not
          close. It widens.
        </Warning>
      )}

      {/* The headline. Everything else on this page supports it. */}
      <Card
        title="Breakeven capital growth rate"
        subtitle={`The annual growth this unit must achieve to match an exchange traded fund at ${percent(v.breakevenGrowth.hurdleRate)} over ${v.breakevenGrowth.years} years.`}
        actions={<Badge tone={outcome.tone}>{outcome.label}</Badge>}
      >
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Stat
              label="Required annual growth"
              value={v.breakevenGrowth.converged ? percent(v.breakevenGrowth.growthRate, 2) : 'unsolved'}
              tone={growth.tone}
              size="large"
              hint={`Reference band ${percent(v.growthBand.low)} to ${percent(v.growthBand.high)} · ${v.growthBand.source}`}
            />
          </div>
          <div className="lg:col-span-2 space-y-3">
            <Warning tone={growth.tone} title={growth.text} />
            {v.blockedReason && <Warning title="The verdict is blocked">{v.blockedReason}</Warning>}
            <Table>
              <thead>
                <tr>
                  <Th>Hurdle rate</Th>
                  <Th align="right">Growth needed to match it</Th>
                </tr>
              </thead>
              <tbody>
                {v.breakevenGrowthByHurdle.map((row) => (
                  <tr key={row.hurdleRate}>
                    <Td>
                      {percent(row.hurdleRate)} <span className="text-xs text-ink-soft">assumed return, not guaranteed</span>
                    </Td>
                    <Td align="right" className="font-semibold">
                      {row.converged ? percent(row.growthRate, 2) : 'unsolved'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      </Card>

      <AffordabilityCard verdict={v} summary={summary} />

      <CashflowCard months={months} summary={summary} />

      {wealth.data && <WealthCard wealth={wealth.data} verdict={v} />}

      <CumulativeCashCard months={months} summary={summary} />

      <LeverageCard verdict={v} />

      <CleaningCard verdict={v} summary={summary} />

      <EscalationCard verdict={v} />

      <TornadoCard verdict={v} />

      <StressCard verdict={v} />

      <StrLtrCard verdict={v} />

      <DscrCard verdict={v} />

      <ConfidenceCard confidence={confidence} />
    </div>
  );
}

function AffordabilityCard({ verdict, summary }: { verdict: VerdictResponse['verdict']; summary: VerdictResponse['summary'] }) {
  const score = verdict.affordability;
  const tone = (grade: 'pass' | 'acceptable' | 'fail') =>
    grade === 'pass' ? 'pass' : grade === 'acceptable' ? 'caution' : 'fail';

  return (
    <Card
      title="Affordability, per director per month"
      subtitle={`Scored against ${rands(score.thresholds.target)} target, ${rands(score.thresholds.acceptable)} acceptable, ${rands(score.thresholds.ceiling)} ceiling.`}
      actions={<Badge tone={tone(score.grade)}>{score.grade}</Badge>}
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Month one"
          value={rands(score.monthOne.amount)}
          tone={tone(score.monthOne.grade)}
          hint={`Graded ${score.monthOne.grade}`}
        />
        <Stat
          label="Worst month of year one"
          value={rands(score.worstYearOne.amount)}
          tone={tone(score.worstYearOne.grade)}
          hint={`${monthLabel(score.worstYearOne.monthIndex)} · the winter draw, not the average`}
        />
        <Stat label="Average over year one" value={rands(score.average12)} hint="The figure people anchor on." />
        <Stat
          label="Peak cumulative outflow"
          value={rands(score.peakCumulativeOutflowPerDirector)}
          hint={`Reached at ${monthLabel(score.peakCumulativeOutflowMonth)}. This is what a director actually commits to.`}
        />
      </div>

      {score.ceilingBreached && (
        <div className="mt-4">
          <Warning title={`The worst month of year one is past the ${rands(score.thresholds.ceiling)} ceiling.`}>
            This is not a marginal miss to be rounded away. At this price and these assumptions the deal asks more of each
            director than the rule allows.
          </Warning>
        </div>
      )}

      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cash at transfer" value={rands(summary.initialCashIn)} hint={`${percent(summary.initialCashInPctOfPrice)} of the purchase price`} />
        <Stat label="Cash at transfer, per director" value={rands(summary.initialCashInPerDirector)} />
        <Stat
          label="Breakeven"
          value={summary.breakevenMonth === null ? 'never' : yearsAndMonths(summary.breakevenMonth)}
          tone={summary.breakevenMonth === null ? 'fail' : 'neutral'}
          hint={
            summary.breakevenMonth === null
              ? 'The rolling year never covers the bond.'
              : `First single positive month: ${summary.firstCashPositiveMonth ?? '—'}`
          }
        />
        <Stat
          label="Real escalation spread"
          value={percent(summary.realEscalationSpread, 2)}
          tone={summary.realEscalationSpread > 0 ? 'pass' : 'fail'}
          hint={`Revenue ${percent(summary.revenueEscalation)} less costs ${percent(summary.weightedCostEscalation)}`}
        />
      </div>
    </Card>
  );
}

function CashflowCard({ months, summary }: { months: VerdictResponse['months']; summary: VerdictResponse['summary'] }) {
  const data = useMemo(
    () =>
      months.map((month) => ({
        monthIndex: month.monthIndex,
        shortfall: month.shortfall / 100,
        noi: month.noi / 100,
        bond: month.bondPayment / 100,
      })),
    [months],
  );

  return (
    <Card
      title="Monthly cashflow"
      subtitle="Net operating income against the bond payment. Below zero, the directors are funding the difference."
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid stroke="#e7ebf2" vertical={false} />
            <XAxis dataKey="monthIndex" tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 12)}y`} interval={11} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => randsShort(value * 100)} width={60} />
            <Tooltip
              formatter={(value: number, name) => [randsShort(value * 100), name]}
              labelFormatter={(label) => `Month ${label}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#46536b" />
            {summary.breakevenMonth !== null && (
              <ReferenceLine
                x={summary.breakevenMonth}
                stroke="#0f7b52"
                strokeDasharray="4 3"
                label={{ value: 'breakeven', fontSize: 11, fill: '#0f7b52', position: 'top' }}
              />
            )}
            <Area type="monotone" dataKey="shortfall" name="Shortfall" fill="#eaf0fb" stroke="#1f4b99" />
            <Line type="monotone" dataKey="noi" name="Net operating income" stroke="#0f7b52" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="bond" name="Bond payment" stroke="#b42318" dot={false} strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function WealthCard({ wealth, verdict }: { wealth: WealthResponse; verdict: VerdictResponse['verdict'] }) {
  const [real, setReal] = useState(false);

  const data = useMemo(
    () =>
      wealth.series
        .filter((point) => point.monthIndex % 3 === 0)
        .map((point) => {
          const deflate = (value: number) => (real ? value / point.realDeflator : value) / 100;
          const row: Record<string, number> = { monthIndex: point.monthIndex };
          row.property = deflate(point.byHurdle[0]?.propertyNetEquity ?? 0);
          for (const leg of point.byHurdle) row[`etf_${Math.round(leg.hurdleRate * 100)}`] = deflate(leg.etfNetValue);
          return row;
        }),
    [wealth, real],
  );

  const colours = ['#a16207', '#1f4b99', '#0f7b52'];

  return (
    <Card
      title="Net equity against the ETF"
      subtitle="Both legs receive the same money on the same dates, both reinvest what they earn, and both pay capital gains tax on the way out."
      actions={
        <label className="no-print flex items-center gap-2 text-sm">
          <input type="checkbox" checked={real} onChange={(event) => setReal(event.target.checked)} />
          Show in today's rands
        </label>
      }
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid stroke="#e7ebf2" vertical={false} />
            <XAxis dataKey="monthIndex" tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 12)}y`} interval={7} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => randsShort(value * 100)} width={60} />
            <Tooltip formatter={(value: number, name) => [randsShort(value * 100), name]} labelFormatter={(label) => `Month ${label}`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#46536b" />
            <Line type="monotone" dataKey="property" name="Property, net of exit costs" stroke="#10192b" strokeWidth={2.5} dot={false} />
            {wealth.hurdleRates.map((rate, index) => (
              <Line
                key={rate}
                type="monotone"
                dataKey={`etf_${Math.round(rate * 100)}`}
                name={`ETF at ${percent(rate, 0)}`}
                stroke={colours[index % colours.length]}
                strokeDasharray="5 3"
                dot={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 space-y-4">
        {verdict.comparisons.map((comparison) => (
          <div key={comparison.years}>
            <h3 className="text-sm font-semibold">At {comparison.years} years</h3>
            <Table>
              <thead>
                <tr>
                  <Th>Hurdle</Th>
                  <Th align="right">Property net equity</Th>
                  <Th align="right">ETF after tax</Th>
                  <Th align="right">Difference</Th>
                </tr>
              </thead>
              <tbody>
                {comparison.property.map((leg, index) => {
                  const etf = comparison.etf[index];
                  const advantage = comparison.advantage[index];
                  return (
                    <tr key={leg.hurdleRate}>
                      <Td>{percent(leg.hurdleRate, 0)}</Td>
                      <Td align="right">{rands(leg.netValue)}</Td>
                      <Td align="right">{rands(etf?.netValue ?? 0)}</Td>
                      <Td align="right" className={(advantage?.amount ?? 0) >= 0 ? 'text-pass font-semibold' : 'text-fail font-semibold'}>
                        {rands(advantage?.amount ?? 0)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <p className="mt-1 text-xs text-ink-soft">
              Property net equity deducts agent commission of {rands(comparison.property[0]?.agentCommission ?? 0)}, the
              outstanding bond of {rands(comparison.property[0]?.bondBalance ?? 0)} and an unrealised capital gains
              provision of {rands(comparison.property[0]?.capitalGainsTaxProvision ?? 0)}. Five Peaks does not sell, so
              that provision is a marking exercise, not a bill.
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CumulativeCashCard({ months, summary }: { months: VerdictResponse['months']; summary: VerdictResponse['summary'] }) {
  const data = useMemo(
    () =>
      months
        .filter((month) => month.monthIndex % 2 === 0)
        .map((month) => ({
          monthIndex: month.monthIndex,
          cashIn: month.cumulativeCashIn / 100,
          netSunk: (month.cumulativeCashIn - month.cumulativeCashOut) / 100,
        })),
    [months],
  );

  return (
    <Card
      title="Cumulative cash in"
      subtitle="The monthly shortfall is what people anchor on. This is what they actually commit to."
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid stroke="#e7ebf2" vertical={false} />
            <XAxis dataKey="monthIndex" tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(value / 12)}y`} interval={11} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => randsShort(value * 100)} width={60} />
            <Tooltip formatter={(value: number, name) => [randsShort(value * 100), name]} labelFormatter={(label) => `Month ${label}`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine
              x={summary.peakCumulativeOutflowMonth}
              stroke="#b42318"
              strokeDasharray="4 3"
              label={{ value: 'peak', fontSize: 11, fill: '#b42318', position: 'top' }}
            />
            <Area type="monotone" dataKey="cashIn" name="Total cash in" fill="#fdeceb" stroke="#b42318" />
            <Line type="monotone" dataKey="netSunk" name="Net cash sunk" stroke="#10192b" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-sm text-ink-soft">
        Peak of {rands(summary.peakCumulativeOutflow)} across the five directors, {rands(summary.peakCumulativeOutflowPerDirector)}{' '}
        each, at {monthLabel(summary.peakCumulativeOutflowMonth)}.
      </p>
    </Card>
  );
}

function LeverageCard({ verdict }: { verdict: VerdictResponse['verdict'] }) {
  const tenYear = verdict.comparisons.find((comparison) => comparison.years === 10) ?? verdict.comparisons[0];
  if (!tenYear) return null;

  return (
    <Card title="The leverage effect" subtitle="Stated plainly rather than buried inside a rate of return.">
      <div className="grid gap-5 sm:grid-cols-3">
        <Stat label={`Growth on the full value, ${tenYear.years} years`} value={rands(tenYear.leverage.capitalGrowth)} />
        <Stat label="Funded by the directors" value={rands(tenYear.leverage.equityFunded)} />
        <Stat
          label="Growth per rand of equity"
          value={tenYear.leverage.multiple === null ? '—' : `${ratio(tenYear.leverage.multiple)}×`}
          hint="This ratio is the entire reason the strategy exists."
        />
      </div>
      <p className="mt-3 text-sm text-ink-soft">
        <Abbr term="IRR" expansion="Internal rate of return: the annualised return implied by the cash flows" /> on the
        property's own cash flows: <strong>{verdict.irr === null ? 'no rate exists for these flows' : percent(verdict.irr, 2)}</strong>.
      </p>
    </Card>
  );
}

function CleaningCard({ verdict, summary }: { verdict: VerdictResponse['verdict']; summary: VerdictResponse['summary'] }) {
  const pct = verdict.cleaning.pctOfGross ?? 0;
  const tone = pct > 0.15 ? 'fail' : pct > 0.09 ? 'caution' : 'pass';
  return (
    <Card title="Cleaning as a share of gross" subtitle={verdict.cleaning.note}>
      <div className="grid gap-5 sm:grid-cols-3">
        <Stat label="Year one cleaning" value={rands(verdict.cleaning.year1Cost)} tone={tone} />
        <Stat label="Share of gross revenue" value={percent(pct)} tone={tone} />
        <Stat
          label="Net operating yield"
          value={percent(summary.netOperatingYield)}
          hint="Year one net operating income over the purchase price."
        />
      </div>
      {pct > 0.15 && (
        <div className="mt-4">
          <Warning tone="caution" title="Cleaning is eating this unit.">
            Cleaning scales with guest departures, not with revenue, so it falls hardest on the cheapest units. Raising
            the minimum stay is the single lever that moves it: at twice the length of stay, this bill halves.
          </Warning>
        </div>
      )}
    </Card>
  );
}

function EscalationCard({ verdict }: { verdict: VerdictResponse['verdict'] }) {
  return (
    <Card
      title="Revenue escalation ladder"
      subtitle="The strategy rests on revenue outrunning a fixed bond payment. Every deal is run at zero, three, five and seven percent."
    >
      <Table>
        <thead>
          <tr>
            <Th>Revenue escalation</Th>
            <Th align="right">Breakeven</Th>
            <Th align="right">Peak cash, per director</Th>
            <Th align="right">Net equity at the horizon</Th>
          </tr>
        </thead>
        <tbody>
          {verdict.escalationLadder.map((row) => (
            <tr key={row.revenueEscalation}>
              <Td>{percent(row.revenueEscalation, 0)}</Td>
              <Td align="right" className={row.breakevenMonth === null ? 'font-semibold text-fail' : ''}>
                {row.breakevenMonth === null ? 'never' : yearsAndMonths(row.breakevenMonth)}
              </Td>
              <Td align="right">{rands(row.peakCumulativeOutflowPerDirector)}</Td>
              <Td align="right">{rands(row.netEquityAtHorizon)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="mt-3 text-sm text-ink-soft">
        The last two years of the managers' own records delivered 3.3 percent and then minus 0.1 percent. A deal that only
        works at seven percent is a bet on a return to the recovery-era number.
      </p>
    </Card>
  );
}

function TornadoCard({ verdict }: { verdict: VerdictResponse['verdict'] }) {
  const data = useMemo(
    () =>
      verdict.tornado.map((bar) => ({
        label: bar.label,
        down: (bar.low - bar.base) / 100,
        up: (bar.high - bar.base) / 100,
      })),
    [verdict.tornado],
  );

  return (
    <Card
      title="Sensitivity"
      subtitle="Each input moved twenty percent either way, ranked by its effect on net position at ten years, after the cash the directors put in."
    >
      <div style={{ height: Math.max(240, data.length * 34) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid stroke="#e7ebf2" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(value) => randsShort(value * 100)} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={130} />
            <Tooltip formatter={(value: number, name) => [randsShort(value * 100), name === 'down' ? 'Twenty percent lower' : 'Twenty percent higher']} />
            <ReferenceLine x={0} stroke="#46536b" />
            <Bar dataKey="down" name="down" fill="#b42318" />
            <Bar dataKey="up" name="up" fill="#0f7b52" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function StressCard({ verdict }: { verdict: VerdictResponse['verdict'] }) {
  return (
    <Card title="Stress tests" subtitle="Run on every deal, whether or not anyone asks for them.">
      <Table>
        <thead>
          <tr>
            <Th>Test</Th>
            <Th align="right">Breakeven</Th>
            <Th align="right">Worst month, per director</Th>
            <Th align="right">Peak cash, per director</Th>
            <Th align="right">Net equity change</Th>
          </tr>
        </thead>
        <tbody>
          {verdict.stressTests.map((test) => (
            <tr key={test.key}>
              <Td>{test.label}</Td>
              <Td align="right">{test.breakevenMonth === null ? 'never' : yearsAndMonths(test.breakevenMonth)}</Td>
              <Td align="right">{rands(test.worstMonthPerDirector)}</Td>
              <Td align="right">{rands(test.peakCumulativeOutflowPerDirector)}</Td>
              <Td align="right" className={test.netEquityDelta < 0 ? 'text-fail font-semibold' : 'text-pass font-semibold'}>
                {rands(test.netEquityDelta)}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="mt-3 text-sm text-ink-soft">
        A body corporate can change its conduct rules by special resolution after purchase, so the short-term letting ban
        is not a hypothetical. The number above is what it would cost this deal.
      </p>
    </Card>
  );
}

function StrLtrCard({ verdict }: { verdict: VerdictResponse['verdict'] }) {
  const { str, ltr } = verdict.strVersusLtr;
  return (
    <Card
      title="Short-term against long-term letting"
      subtitle="Shown on every deal, so the strategy stays evidenced rather than assumed. It is also the fallback if the rules change."
    >
      {!ltr ? (
        <p className="text-sm text-ink-soft">
          No long-term rent has been entered for this unit, so there is nothing to compare against. Enter one on the
          Revenue tab.
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Measure</Th>
              <Th align="right">{str.label}</Th>
              <Th align="right">{ltr.label}</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>Year one gross revenue</Td>
              <Td align="right">{rands(str.year1GrossRevenue)}</Td>
              <Td align="right">{rands(ltr.year1GrossRevenue)}</Td>
            </tr>
            <tr>
              <Td>Year one net operating income</Td>
              <Td align="right">{rands(str.year1Noi)}</Td>
              <Td align="right">{rands(ltr.year1Noi)}</Td>
            </tr>
            <tr>
              <Td>Net operating yield</Td>
              <Td align="right">{percent(str.netOperatingYield)}</Td>
              <Td align="right">{percent(ltr.netOperatingYield)}</Td>
            </tr>
            <tr>
              <Td>Worst month of year one, per director</Td>
              <Td align="right">{rands(str.worstMonthYearOnePerDirector)}</Td>
              <Td align="right">{rands(ltr.worstMonthYearOnePerDirector)}</Td>
            </tr>
            <tr>
              <Td>Breakeven</Td>
              <Td align="right">{str.breakevenMonth === null ? 'never' : yearsAndMonths(str.breakevenMonth)}</Td>
              <Td align="right">{ltr.breakevenMonth === null ? 'never' : yearsAndMonths(ltr.breakevenMonth)}</Td>
            </tr>
            <tr>
              <Td>Peak cash, per director</Td>
              <Td align="right">{rands(str.peakCumulativeOutflowPerDirector)}</Td>
              <Td align="right">{rands(ltr.peakCumulativeOutflowPerDirector)}</Td>
            </tr>
            <tr>
              <Td>Net equity at the horizon</Td>
              <Td align="right">{rands(str.netEquityAtHorizon)}</Td>
              <Td align="right">{rands(ltr.netEquityAtHorizon)}</Td>
            </tr>
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function DscrCard({ verdict }: { verdict: VerdictResponse['verdict'] }) {
  const years = verdict.dscrByYear.filter((row) => row.year <= 20);
  return (
    <Card
      title={
        <span>
          <Abbr term="DSCR" expansion="Debt service coverage ratio: net operating income divided by the bond payment" /> by year
        </span>
      }
      subtitle="Below 1.0 the property does not pay for itself."
    >
      <Table className="min-w-[40rem]">
        <thead>
          <tr>
            <Th>Year</Th>
            {years.slice(0, 20).map((row) => (
              <Th key={row.year} align="right">
                {row.year}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>Ratio</Td>
            {years.slice(0, 20).map((row) => (
              <Td key={row.year} align="right" className={(row.dscr ?? 0) < 1 ? 'text-fail' : 'text-pass'}>
                {ratio(row.dscr)}
              </Td>
            ))}
          </tr>
        </tbody>
      </Table>
    </Card>
  );
}

function ConfidenceCard({ confidence }: { confidence: VerdictResponse['confidence'] }) {
  const proportion = confidence.proportion;
  const tone = proportion >= 0.7 ? 'pass' : proportion >= 0.3 ? 'caution' : 'fail';

  return (
    <Card
      title="What this verdict rests on"
      subtitle="A verdict built on a guessed nightly rate should not read like one built on twelve months of manager data."
    >
      <div className="grid gap-5 sm:grid-cols-3">
        <Stat
          label="Inputs backed by evidence"
          value={`${confidence.evidencedCount} of ${confidence.totalCount}`}
          tone={tone}
          hint={percent(proportion, 0)}
        />
        <Stat
          label="Unverified global assumptions"
          value={confidence.unverifiedAssumptions}
          tone={confidence.unverifiedAssumptions > 0 ? 'caution' : 'pass'}
          hint="Tax rates, brackets and fee scales nobody has checked."
        />
        <div className="sm:col-span-1">
          <p className="text-sm text-ink-soft">
            This model produces confident-looking numbers from unverified assumptions. Settle the transfer duty brackets,
            the VAT position and the assessed-loss treatment with the accountant before anyone relies on it.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <Table>
          <thead>
            <tr>
              <Th>Input</Th>
              <Th>Status</Th>
              <Th>Note</Th>
            </tr>
          </thead>
          <tbody>
            {confidence.items.map((item) => (
              <tr key={item.key}>
                <Td>{item.label}</Td>
                <Td>
                  <Badge tone={item.evidenced ? 'pass' : 'caution'}>{item.evidenced ? 'Evidenced' : 'Assumed'}</Badge>
                </Td>
                <Td className="text-ink-soft">{item.note ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <p className="mt-4 text-xs text-ink-soft">This is not financial, tax or legal advice.</p>
    </Card>
  );
}
