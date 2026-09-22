import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Button, Card, ErrorNote, Field, Select, Spinner, Table, Td, TextInput, Th } from '../components/ui.js';
import { api } from '../lib/api.js';
import { dateLabel, parsePercent, percent, rands } from '../lib/format.js';

interface DirectorRow {
  id: string;
  name: string;
  email: string;
  sharePct: number;
  active: boolean;
  isAdmin: boolean;
}

interface DirectorStatement {
  director: { id: string; name: string; email: string; sharePct: number };
  totalDeployed: number;
  totalDistributed: number;
  netDeployed: number;
  shareOfNetEquity: number;
  entries: { id: string; date: string; amount: number; type: string; notes: string | null }[];
}

export default function DirectorsPage() {
  const directors = useQuery({ queryKey: ['directors'], queryFn: () => api.get<DirectorRow[]>('/api/directors') });
  const statements = useQuery({
    queryKey: ['director-statements'],
    queryFn: () => api.get<DirectorStatement[]>('/api/directors/statements'),
  });

  if (directors.isLoading) return <Spinner label="Loading directors" />;
  if (directors.error) return <ErrorNote error={directors.error} />;

  const shareTotal = (directors.data ?? []).filter((d) => d.active).reduce((sum, d) => sum + d.sharePct, 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Directors</h1>
        <p className="text-sm text-ink-soft">Five equal shareholders, their accounts and what each has deployed.</p>
      </header>

      {Math.abs(shareTotal - 1) > 0.001 && (
        <Card>
          <p className="text-sm text-fail">
            The active directors' shares sum to {percent(shareTotal)}, not 100 percent. Every per-director figure in this
            model assumes they add up.
          </p>
        </Card>
      )}

      <Card title="Accounts">
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th align="right">Share</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {(directors.data ?? []).map((director) => (
              <DirectorRowEditor key={director.id} director={director} />
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-ink-soft">
          There is no password reset flow. An administrator runs{' '}
          <code className="rounded bg-canvas px-1">npm run reset-password -w @fp/server -- &lt;email&gt;</code> on the
          server, which also ends every session that account had open.
        </p>
      </Card>

      <Card title="Statements" subtitle="Total capital deployed and current share of net equity.">
        {statements.isLoading ? (
          <Spinner />
        ) : (
          <div className="space-y-5">
            {(statements.data ?? []).map((statement) => (
              <div key={statement.director.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{statement.director.name}</p>
                    <p className="text-xs text-ink-soft">{statement.director.email}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase text-ink-soft">Deployed</p>
                      <p className="tabular font-semibold">{rands(statement.totalDeployed)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-ink-soft">Distributed</p>
                      <p className="tabular font-semibold">{rands(statement.totalDistributed)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-ink-soft">Net</p>
                      <p className="tabular font-semibold">{rands(statement.netDeployed)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-ink-soft">Share of net equity</p>
                      <p className="tabular font-semibold">{rands(statement.shareOfNetEquity)}</p>
                    </div>
                  </div>
                </div>

                {statement.entries.length > 0 && (
                  <Table className="mt-3">
                    <thead>
                      <tr>
                        <Th>Date</Th>
                        <Th>Type</Th>
                        <Th align="right">Amount</Th>
                        <Th>Note</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.entries.slice(0, 10).map((entry) => (
                        <tr key={entry.id}>
                          <Td>{dateLabel(entry.date)}</Td>
                          <Td>
                            <Badge tone={entry.type === 'distribution' ? 'pass' : 'neutral'}>{entry.type}</Badge>
                          </Td>
                          <Td align="right">{rands(entry.amount)}</Td>
                          <Td className="text-xs text-ink-soft">{entry.notes ?? '—'}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function DirectorRowEditor({ director }: { director: DirectorRow }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(director);

  const save = useMutation({
    mutationFn: (body: unknown) => api.patch(`/api/directors/${director.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setEditing(false);
    },
  });

  return (
    <tr>
      <Td>{editing ? <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /> : director.name}</Td>
      <Td>{editing ? <TextInput value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /> : director.email}</Td>
      <Td align="right">
        {editing ? (
          <TextInput
            value={(form.sharePct * 100).toFixed(1)}
            onChange={(event) => setForm({ ...form, sharePct: parsePercent(event.target.value) ?? form.sharePct })}
          />
        ) : (
          percent(director.sharePct, 0)
        )}
      </Td>
      <Td>
        {editing ? (
          <Select value={form.active ? 'yes' : 'no'} onChange={(event) => setForm({ ...form, active: event.target.value === 'yes' })}>
            <option value="yes">Active</option>
            <option value="no">Inactive</option>
          </Select>
        ) : (
          <Badge tone={director.active ? 'pass' : 'neutral'}>{director.active ? 'Active' : 'Inactive'}</Badge>
        )}
      </Td>
      <Td align="right">
        {editing ? (
          <div className="flex justify-end gap-2 text-xs">
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={() => save.mutate({ name: form.name, email: form.email, sharePct: form.sharePct, active: form.active })}
            >
              Save
            </button>
            <button type="button" className="text-ink-soft hover:underline" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </Td>
    </tr>
  );
}
