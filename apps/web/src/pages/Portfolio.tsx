import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
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
import type { DashboardResponse, Property } from '../lib/types.js';

interface DirectorStatement {
  director: { id: string; name: string; email: string; sharePct: number };
  totalDeployed: number;
  totalDistributed: number;
  netDeployed: number;
  shareOfNetEquity: number;
  entries: { id: string; date: string; amount: number; type: string; propertyId: string | null; notes: string | null }[];
}

interface RefinancePlan {
  results: {
    property: Property;
    value: number;
    currentBalance: number;
    currentLtv: number | null;
    targetBalance: number;
    releaseGross: number;
    recost: number;
    releaseNet: number;
    monthlyPaymentIncrease: number;
    breakevenMonthBefore: number | null;
    breakevenMonthAfter: number | null;
  }[];
  totalReleaseNet: number;
  extraMonthlyPayment: number;
  extraMonthlyPaymentPerDirector: number;
  note: string;
}

export default function PortfolioPage() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardResponse>('/api/dashboard') });
  const statements = useQuery({
    queryKey: ['director-statements'],
    queryFn: () => api.get<DirectorStatement[]>('/api/directors/statements'),
  });

  if (dashboard.isLoading) return <Spinner label="Loading the portfolio" />;
  if (dashboard.error) return <ErrorNote error={dashboard.error} />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Portfolio</h1>
        <p className="text-sm text-ink-soft">What the group owns, what it has cost, and what releasing equity would do.</p>
      </header>

      <Card title="Owned properties">
        {(dashboard.data?.properties.length ?? 0) === 0 ? (
          <p className="text-sm text-ink-soft">
            Nothing is marked as owned. Change a property's status to Owned once it has transferred, and record its
            transfer date so actuals can be lined up against the projection.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Property</Th>
                <Th align="right">Value</Th>
                <Th align="right">Debt</Th>
                <Th align="right">LTV</Th>
                <Th align="right">This month</Th>
                <Th>Valuation source</Th>
              </tr>
            </thead>
            <tbody>
              {dashboard.data?.properties.map((row) => (
                <tr key={row.property.id}>
                  <Td>
                    <Link className="text-accent hover:underline" to={`/properties/${row.property.id}/portfolio`}>
                      {row.property.name}
                    </Link>
                  </Td>
                  <Td align="right">{rands(row.value)}</Td>
                  <Td align="right">{rands(row.debt)}</Td>
                  <Td align="right">{percent(row.ltv)}</Td>
                  <Td align="right">{rands(row.currentShortfall)}</Td>
                  <Td className="text-xs text-ink-soft">{row.valuationSource}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <RefinancePlanner />

      <CapitalAccounts statements={statements.data ?? []} loading={statements.isLoading} />
    </div>
  );
}

function RefinancePlanner() {
  const [targetLtv, setTargetLtv] = useState('80');
  const [recost, setRecost] = useState('1.5');

  const plan = useMutation({
    mutationFn: () =>
      api.post<RefinancePlan>('/api/dashboard/refinance-planner', {
        targetLtv: parsePercent(targetLtv) ?? 0.8,
        recostPct: parsePercent(recost) ?? 0.015,
      }),
  });

  return (
    <Card
      title="Refinance planner"
      subtitle="Model releasing equity from what the group already owns to fund the next deposit, before committing to it."
      actions={
        <div className="flex items-end gap-2">
          <Field label="Target LTV">
            <TextInput value={targetLtv} onChange={(event) => setTargetLtv(event.target.value)} className="w-24" />
          </Field>
          <Field label="Re-registration cost">
            <TextInput value={recost} onChange={(event) => setRecost(event.target.value)} className="w-24" />
          </Field>
          <Button onClick={() => plan.mutate()} disabled={plan.isPending}>
            {plan.isPending ? 'Modelling…' : 'Model it'}
          </Button>
        </div>
      }
    >
      {plan.error && <ErrorNote error={plan.error} />}
      {!plan.data ? (
        <p className="text-sm text-ink-soft">
          Refinancing resets the balance upward, raises the payment and pushes breakeven out. This shows the price of
          scaling before anyone commits to it.
        </p>
      ) : plan.data.results.length === 0 ? (
        <p className="text-sm text-ink-soft">No owned property has room to release at that loan to value.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase text-ink-soft">Released, net of costs</p>
              <p className="tabular text-2xl font-semibold text-pass">{rands(plan.data.totalReleaseNet)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-ink-soft">Extra monthly payment</p>
              <p className="tabular text-2xl font-semibold text-fail">{rands(plan.data.extraMonthlyPayment)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-ink-soft">Per director, per month</p>
              <p className="tabular text-2xl font-semibold text-fail">{rands(plan.data.extraMonthlyPaymentPerDirector)}</p>
            </div>
          </div>

          <Table className="mt-4 min-w-[48rem]">
            <thead>
              <tr>
                <Th>Property</Th>
                <Th align="right">Value</Th>
                <Th align="right">Balance</Th>
                <Th align="right">Current LTV</Th>
                <Th align="right">Release</Th>
                <Th align="right">Cost</Th>
                <Th align="right">Net</Th>
                <Th align="right">Payment increase</Th>
                <Th align="right">Breakeven moves</Th>
              </tr>
            </thead>
            <tbody>
              {plan.data.results.map((row) => (
                <tr key={row.property.id}>
                  <Td>{row.property.name}</Td>
                  <Td align="right">{rands(row.value)}</Td>
                  <Td align="right">{rands(row.currentBalance)}</Td>
                  <Td align="right">{percent(row.currentLtv)}</Td>
                  <Td align="right">{rands(row.releaseGross)}</Td>
                  <Td align="right">{rands(row.recost)}</Td>
                  <Td align="right" className="font-semibold">
                    {rands(row.releaseNet)}
                  </Td>
                  <Td align="right" className="text-fail">
                    {rands(row.monthlyPaymentIncrease)}
                  </Td>
                  <Td align="right">
                    {row.breakevenMonthBefore ?? 'never'} → {row.breakevenMonthAfter ?? 'never'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-3">
            <Warning tone="caution" title="Refinancing is not free.">
              {plan.data.note}
            </Warning>
          </div>
        </>
      )}
    </Card>
  );
}

function CapitalAccounts({ statements, loading }: { statements: DirectorStatement[]; loading: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ directorId: '', date: new Date().toISOString().slice(0, 10), amount: '', type: 'shortfall' });

  const add = useMutation({
    mutationFn: (body: unknown) => api.post('/api/contributions', body),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  if (loading) return <Spinner label="Loading capital accounts" />;

  return (
    <Card title="Capital accounts" subtitle="Every contribution and distribution, per director.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Table>
          <thead>
            <tr>
              <Th>Director</Th>
              <Th align="right">Deployed</Th>
              <Th align="right">Distributed</Th>
              <Th align="right">Net</Th>
              <Th align="right">Share of net equity</Th>
            </tr>
          </thead>
          <tbody>
            {statements.map((statement) => (
              <tr key={statement.director.id}>
                <Td>
                  {statement.director.name}
                  <div className="text-xs text-ink-soft">{percent(statement.director.sharePct, 0)}</div>
                </Td>
                <Td align="right">{rands(statement.totalDeployed)}</Td>
                <Td align="right">{rands(statement.totalDistributed)}</Td>
                <Td align="right" className="font-semibold">
                  {rands(statement.netDeployed)}
                </Td>
                <Td align="right">{rands(statement.shareOfNetEquity)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>

        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const amount = parseRands(form.amount);
            if (!amount || !form.directorId) return;
            add.mutate({ directorId: form.directorId, date: form.date, amount, type: form.type });
            setForm({ ...form, amount: '' });
          }}
        >
          <Field label="Director">
            <Select value={form.directorId} onChange={(event) => setForm({ ...form, directorId: event.target.value })}>
              <option value="">Choose…</option>
              {statements.map((statement) => (
                <option key={statement.director.id} value={statement.director.id}>
                  {statement.director.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <TextInput type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </Field>
          <Field label="Amount">
            <TextInput value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              <option value="deposit">Deposit</option>
              <option value="shortfall">Shortfall</option>
              <option value="capex">Capital expenditure</option>
              <option value="distribution">Distribution</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={add.isPending}>
              Record it
            </Button>
          </div>
        </form>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold">Recent entries</h3>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Director</Th>
              <Th>Type</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {statements
              .flatMap((statement) => statement.entries.map((entry) => ({ entry, name: statement.director.name })))
              .sort((a, b) => b.entry.date.localeCompare(a.entry.date))
              .slice(0, 20)
              .map(({ entry, name }) => (
                <tr key={entry.id}>
                  <Td>{dateLabel(entry.date)}</Td>
                  <Td>{name}</Td>
                  <Td>
                    <Badge tone={entry.type === 'distribution' ? 'pass' : 'neutral'}>{entry.type}</Badge>
                  </Td>
                  <Td align="right">{rands(entry.amount)}</Td>
                </tr>
              ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}
