import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Spinner,
  Table,
  Td,
  TextArea,
  TextInput,
  Th,
} from '../components/ui.js';
import { api } from '../lib/api.js';
import { dateLabel, monthShort, parseRands, percent, rands, randsShort } from '../lib/format.js';
import type { Property, Scenario } from '../lib/types.js';

interface VarianceRow {
  year: number;
  month: number;
  monthIndex: number;
  actual: {
    grossRevenue: number;
    operatingCosts: number;
    noi: number;
    bondPayment: number;
    shortfall: number;
    turnovers: number | null;
    nightsSold: number | null;
    bondBalance: number | null;
  };
  projected: {
    grossRevenue: number;
    operatingCosts: number;
    noi: number;
    bondPayment: number;
    shortfall: number;
    turnovers: number;
    bondBalance: number;
  } | null;
  variance: { grossRevenue: number; operatingCosts: number; noi: number; shortfall: number } | null;
}

export default function PropertyPortfolioPage() {
  const { propertyId } = useParams();
  const queryClient = useQueryClient();

  const property = useQuery({
    queryKey: ['property', propertyId],
    queryFn: () => api.get<{ property: Property; scenarios: Scenario[] }>(`/api/properties/${propertyId}`),
  });

  const variance = useQuery({
    queryKey: ['variance', propertyId],
    queryFn: () => api.get<{ property: Property; comparison: VarianceRow[] }>(`/api/properties/${propertyId}/variance`),
    retry: false,
  });

  const valuations = useQuery({
    queryKey: ['valuations', propertyId],
    queryFn: () => api.get<{ id: string; date: string; value: number; source: string | null }[]>(`/api/properties/${propertyId}/valuations`),
  });

  const maintenance = useQuery({
    queryKey: ['maintenance', propertyId],
    queryFn: () =>
      api.get<{ id: string; date: string; description: string; amount: number; isSpecialLevy: boolean }[]>(
        `/api/properties/${propertyId}/maintenance`,
      ),
  });

  if (property.isLoading) return <Spinner label="Loading the property" />;
  if (property.error) return <ErrorNote error={property.error} />;
  if (!property.data) return null;

  const rows = variance.data?.comparison ?? [];
  const chart = rows.map((row) => ({
    label: `${monthShort(row.month)} ${String(row.year).slice(2)}`,
    actual: row.actual.grossRevenue / 100,
    projected: (row.projected?.grossRevenue ?? 0) / 100,
  }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-soft">Portfolio</p>
          <h1 className="text-xl font-semibold">{property.data.property.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link to={`/properties/${propertyId}`}>
            <Button variant="secondary">Inputs</Button>
          </Link>
          <Link to={`/properties/${propertyId}/verdict`}>
            <Button variant="secondary">Verdict</Button>
          </Link>
        </div>
      </header>

      {variance.error && <ErrorNote error={variance.error} />}

      {rows.length > 0 && (
        <Card title="Actuals against projection" subtitle="Where the model and the manager's statement disagree, and by how much.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid stroke="#e7ebf2" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => randsShort(value * 100)} width={60} />
                <Tooltip formatter={(value: number) => randsShort(value * 100)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="projected" name="Projected" fill="#c9d6ef" />
                <Bar dataKey="actual" name="Actual" fill="#1f4b99" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <Table className="mt-4 min-w-[46rem]">
            <thead>
              <tr>
                <Th>Month</Th>
                <Th align="right">Actual gross</Th>
                <Th align="right">Projected</Th>
                <Th align="right">Variance</Th>
                <Th align="right">Actual NOI</Th>
                <Th align="right">Projected NOI</Th>
                <Th align="right">Shortfall variance</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.year}-${row.month}`}>
                  <Td>
                    {monthShort(row.month)} {row.year}
                  </Td>
                  <Td align="right">{rands(row.actual.grossRevenue)}</Td>
                  <Td align="right">{rands(row.projected?.grossRevenue ?? null)}</Td>
                  <Td align="right" className={(row.variance?.grossRevenue ?? 0) < 0 ? 'text-fail' : 'text-pass'}>
                    {rands(row.variance?.grossRevenue ?? null)}
                  </Td>
                  <Td align="right">{rands(row.actual.noi)}</Td>
                  <Td align="right">{rands(row.projected?.noi ?? null)}</Td>
                  <Td align="right" className={(row.variance?.shortfall ?? 0) < 0 ? 'text-fail' : 'text-pass'}>
                    {rands(row.variance?.shortfall ?? null)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <ActualsEntry propertyId={propertyId as string} onSaved={() => queryClient.invalidateQueries()} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Valuations" subtitle="Drives current loan to value and refinance capacity.">
          <ValuationForm propertyId={propertyId as string} />
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th align="right">Value</Th>
                <Th>Source</Th>
              </tr>
            </thead>
            <tbody>
              {(valuations.data ?? []).map((row) => (
                <tr key={row.id}>
                  <Td>{dateLabel(row.date)}</Td>
                  <Td align="right">{rands(row.value)}</Td>
                  <Td className="text-xs text-ink-soft">{row.source ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Levies, special levies and maintenance" subtitle="A special levy can be five figures with little notice.">
          <MaintenanceForm propertyId={propertyId as string} />
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>What</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {(maintenance.data ?? []).map((row) => (
                <tr key={row.id}>
                  <Td>{dateLabel(row.date)}</Td>
                  <Td>
                    {row.description} {row.isSpecialLevy && <Badge tone="caution">Special levy</Badge>}
                  </Td>
                  <Td align="right">{rands(row.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function ActualsEntry({ propertyId, onSaved }: { propertyId: string; onSaved: () => void }) {
  const [form, setForm] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    grossBookingRevenue: '',
    platformFees: '',
    managementFees: '',
    cleaning: '',
    levies: '',
    municipalRates: '',
    utilities: '',
    maintenance: '',
    other: '',
    bondPayment: '',
    bondInterest: '',
    bondBalance: '',
    turnovers: '',
    nightsSold: '',
  });
  const [csv, setCsv] = useState('');

  const save = useMutation({
    mutationFn: (rows: unknown[]) => api.put(`/api/properties/${propertyId}/actuals`, rows),
    onSuccess: onSaved,
  });

  const cents = (value: string) => parseRands(value) ?? 0;

  return (
    <Card
      title="Record actuals"
      subtitle="Quick entry for one month, or paste a manager statement as CSV. This is what makes the portfolio section worth having."
    >
      <form
        className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate([
            {
              year: Number(form.year),
              month: Number(form.month),
              grossBookingRevenue: cents(form.grossBookingRevenue),
              platformFees: cents(form.platformFees),
              managementFees: cents(form.managementFees),
              cleaning: cents(form.cleaning),
              levies: cents(form.levies),
              municipalRates: cents(form.municipalRates),
              utilities: cents(form.utilities),
              maintenance: cents(form.maintenance),
              other: cents(form.other),
              bondPayment: cents(form.bondPayment),
              bondInterest: cents(form.bondInterest),
              bondBalance: form.bondBalance ? cents(form.bondBalance) : null,
              turnovers: form.turnovers ? Number(form.turnovers) : null,
              nightsSold: form.nightsSold ? Number(form.nightsSold) : null,
            },
          ]);
        }}
      >
        <Field label="Year">
          <TextInput value={form.year} onChange={(event) => setForm({ ...form, year: Number(event.target.value) })} />
        </Field>
        <Field label="Month">
          <TextInput value={form.month} onChange={(event) => setForm({ ...form, month: Number(event.target.value) })} />
        </Field>
        {(
          [
            ['grossBookingRevenue', 'Gross revenue'],
            ['platformFees', 'Platform fees'],
            ['managementFees', 'Management'],
            ['cleaning', 'Cleaning'],
            ['levies', 'Levies'],
            ['municipalRates', 'Rates'],
            ['utilities', 'Utilities'],
            ['maintenance', 'Maintenance'],
            ['other', 'Other'],
            ['bondPayment', 'Bond payment'],
            ['bondInterest', 'Bond interest'],
            ['bondBalance', 'Bond balance'],
            ['turnovers', 'Turnovers'],
            ['nightsSold', 'Nights sold'],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <TextInput value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
          </Field>
        ))}
        <div className="sm:col-span-3 lg:col-span-5">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save the month'}
          </Button>
        </div>
      </form>

      <div className="mt-5 border-t border-line pt-4">
        <Field
          label="Or paste CSV"
          hint="Header row: year,month,gross,platform,management,cleaning,levies,rates,utilities,maintenance,other,bondPayment,bondInterest,bondBalance"
        >
          <TextArea rows={4} value={csv} onChange={(event) => setCsv(event.target.value)} />
        </Field>
        <Button
          variant="secondary"
          className="mt-2"
          onClick={() => {
            const lines = csv.trim().split(/\r?\n/).filter(Boolean);
            if (lines.length < 2) return;
            const rows = lines.slice(1).map((line) => {
              const parts = line.split(',').map((part) => part.trim());
              const value = (index: number) => parseRands(parts[index] ?? '0') ?? 0;
              return {
                year: Number(parts[0]),
                month: Number(parts[1]),
                grossBookingRevenue: value(2),
                platformFees: value(3),
                managementFees: value(4),
                cleaning: value(5),
                levies: value(6),
                municipalRates: value(7),
                utilities: value(8),
                maintenance: value(9),
                other: value(10),
                bondPayment: value(11),
                bondInterest: value(12),
                bondBalance: parts[13] ? value(13) : null,
              };
            });
            save.mutate(rows);
            setCsv('');
          }}
        >
          Import the rows
        </Button>
      </div>
      {save.error && <div className="mt-3"><ErrorNote error={save.error} /></div>}
    </Card>
  );
}

function ValuationForm({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [value, setValue] = useState('');
  const [source, setSource] = useState('');

  const add = useMutation({
    mutationFn: (body: unknown) => api.post(`/api/properties/${propertyId}/valuations`, body),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setValue('');
    },
  });

  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        const cents = parseRands(value);
        if (!cents) return;
        add.mutate({ date, value: cents, source });
      }}
    >
      <Field label="Date">
        <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </Field>
      <Field label="Value">
        <TextInput value={value} onChange={(event) => setValue(event.target.value)} />
      </Field>
      <Field label="Source">
        <TextInput value={source} onChange={(event) => setSource(event.target.value)} placeholder="Lightstone, bank, agent" />
      </Field>
      <div className="flex items-end">
        <Button type="submit">Add</Button>
      </div>
    </form>
  );
}

function MaintenanceForm({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [isSpecialLevy, setIsSpecialLevy] = useState(false);

  const add = useMutation({
    mutationFn: (body: unknown) => api.post(`/api/properties/${propertyId}/maintenance`, body),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setDescription('');
      setAmount('');
    },
  });

  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate({ date, description, amount: parseRands(amount) ?? 0, isSpecialLevy });
      }}
    >
      <Field label="Date">
        <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </Field>
      <Field label="What">
        <TextInput value={description} onChange={(event) => setDescription(event.target.value)} required />
      </Field>
      <Field label="Amount">
        <TextInput value={amount} onChange={(event) => setAmount(event.target.value)} />
      </Field>
      <div className="flex items-end gap-2">
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={isSpecialLevy} onChange={(event) => setIsSpecialLevy(event.target.checked)} />
          Special levy
        </label>
        <Button type="submit">Add</Button>
      </div>
    </form>
  );
}
