import { ASSET_TYPES, ASSET_TYPE_LABELS, COST_BASES, COST_BASIS_LABELS, COST_CATEGORIES } from '@fp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StrGateWarning } from '../components/StrGate.js';
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  EvidenceMark,
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
import { monthShort, parsePercent, parseRands, percent, rands, yearsAndMonths } from '../lib/format.js';
import type {
  CostLineRow,
  OneOffCostRow,
  ProjectionResponse,
  Property,
  Scenario,
  ScenarioBundleResponse,
  SeasonalityRow,
} from '../lib/types.js';

type Tab = 'property' | 'purchase' | 'finance' | 'revenue' | 'costs' | 'growth' | 'refinance' | 'solvers';

const TABS: { key: Tab; label: string }[] = [
  { key: 'property', label: 'Property' },
  { key: 'purchase', label: 'Purchase' },
  { key: 'finance', label: 'Finance' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'costs', label: 'Costs' },
  { key: 'growth', label: 'Growth' },
  { key: 'refinance', label: 'Refinance' },
  { key: 'solvers', label: 'Solvers' },
];

export default function PropertyDetailPage() {
  const { propertyId } = useParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('property');
  const [scenarioId, setScenarioId] = useState<string | null>(null);

  const propertyQuery = useQuery({
    queryKey: ['property', propertyId],
    queryFn: () => api.get<{ property: Property; scenarios: Scenario[] }>(`/api/properties/${propertyId}`),
  });

  const activeScenario =
    scenarioId ?? propertyQuery.data?.scenarios.find((s) => s.isPrimary)?.id ?? propertyQuery.data?.scenarios[0]?.id;

  const bundle = useQuery({
    queryKey: ['scenario', activeScenario],
    queryFn: () => api.get<ScenarioBundleResponse>(`/api/scenarios/${activeScenario}`),
    enabled: Boolean(activeScenario),
  });

  const projection = useQuery({
    queryKey: ['projection', activeScenario],
    queryFn: () => api.get<ProjectionResponse>(`/api/scenarios/${activeScenario}/projection`),
    enabled: Boolean(activeScenario),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['scenario', activeScenario] });
    queryClient.invalidateQueries({ queryKey: ['projection', activeScenario] });
    queryClient.invalidateQueries({ queryKey: ['verdict', activeScenario] });
    queryClient.invalidateQueries({ queryKey: ['wealth', activeScenario] });
    queryClient.invalidateQueries({ queryKey: ['verdict-summaries'] });
    queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
  };

  if (propertyQuery.isLoading || bundle.isLoading) return <Spinner label="Loading the deal" />;
  if (propertyQuery.error) return <ErrorNote error={propertyQuery.error} />;
  if (!propertyQuery.data || !bundle.data) return null;

  const property = propertyQuery.data.property;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-soft">Inputs</p>
          <h1 className="text-xl font-semibold">{property.name}</h1>
          <p className="text-sm text-ink-soft">
            Every figure recalculates as you change it. Mark each one as evidenced or assumed; the verdict counts them.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Scenario">
            <div className="flex gap-2">
              <Select value={activeScenario} onChange={(event) => setScenarioId(event.target.value)}>
                {propertyQuery.data.scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                    {scenario.isPrimary ? ' (primary)' : ''}
                  </option>
                ))}
              </Select>
              <Button
                variant="secondary"
                onClick={async () => {
                  const name = window.prompt('Name for the new scenario', 'Bear');
                  if (!name) return;
                  const created = await api.post<{ id: string }>(`/api/properties/${propertyId}/scenarios`, { name });
                  setScenarioId(created.id);
                  invalidate();
                }}
              >
                New
              </Button>
            </div>
          </Field>
          <Link to={`/properties/${propertyId}/verdict`}>
            <Button>See the verdict</Button>
          </Link>
        </div>
      </header>

      <StrGateWarning property={property} />

      <LiveBar projection={projection.data} loading={projection.isFetching} error={projection.error} />

      <nav className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
              tab === item.key ? 'border-b-2 border-accent text-accent' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'property' && <PropertyTab property={property} onSaved={invalidate} />}
      {tab === 'purchase' && <PurchaseTab property={property} bundle={bundle.data} projection={projection.data} onSaved={invalidate} />}
      {tab === 'finance' && <FinanceTab bundle={bundle.data} onSaved={invalidate} />}
      {tab === 'revenue' && <RevenueTab bundle={bundle.data} onSaved={invalidate} />}
      {tab === 'costs' && <CostsTab bundle={bundle.data} onSaved={invalidate} />}
      {tab === 'growth' && <GrowthTab bundle={bundle.data} onSaved={invalidate} />}
      {tab === 'refinance' && <RefinanceTab bundle={bundle.data} projection={projection.data} onSaved={invalidate} />}
      {tab === 'solvers' && <SolversTab scenarioId={bundle.data.scenario.id} projection={projection.data} />}
    </div>
  );
}

function LiveBar({
  projection,
  loading,
  error,
}: {
  projection: ProjectionResponse | undefined;
  loading: boolean;
  error: unknown;
}) {
  if (error) return <ErrorNote error={error} />;
  if (!projection) return <Spinner label="Projecting" />;

  const summary = projection.summary;
  const thresholds = projection.thresholds;
  const worst = summary.worstMonthYearOnePerDirector;
  const magnitude = worst < 0 ? -worst : 0;
  const tone =
    magnitude <= thresholds.target ? 'text-pass' : magnitude <= thresholds.acceptable ? 'text-caution' : 'text-fail';

  return (
    <div className="sticky top-[57px] z-10 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <p className="text-xs uppercase text-ink-soft">Month 1 / director</p>
          <p className="tabular font-semibold">{rands(summary.monthOneShortfallPerDirector)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-soft">Worst month / director</p>
          <p className={`tabular font-semibold ${tone}`}>{rands(worst)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-soft">Cash at transfer</p>
          <p className="tabular font-semibold">{rands(summary.initialCashIn)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-soft">Peak / director</p>
          <p className="tabular font-semibold">{rands(summary.peakCumulativeOutflowPerDirector)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-soft">Breakeven</p>
          <p className="tabular font-semibold">
            {summary.breakevenMonth === null ? 'never' : yearsAndMonths(summary.breakevenMonth)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-soft">Net yield</p>
          <p className="tabular font-semibold">{percent(summary.netOperatingYield)}</p>
        </div>
      </div>
      {loading && <p className="mt-1 text-xs text-ink-soft">Recalculating…</p>}
    </div>
  );
}

/** Saves a form on change, after a short pause, so nobody has to press Calculate. */
function useAutoSave<T>(save: (value: T) => Promise<unknown>, onSaved: () => void, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<unknown>(null);

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  return {
    status,
    error,
    queue(value: T) {
      if (timer.current) clearTimeout(timer.current);
      setStatus('saving');
      timer.current = setTimeout(async () => {
        try {
          await save(value);
          setStatus('saved');
          setError(null);
          onSaved();
        } catch (cause) {
          setStatus('error');
          setError(cause);
        }
      }, delay);
    },
  };
}

function SaveState({ status, error }: { status: string; error: unknown }) {
  if (status === 'error') return <span className="text-xs text-fail">{error instanceof Error ? error.message : 'Not saved'}</span>;
  if (status === 'saving') return <span className="text-xs text-ink-soft">Saving…</span>;
  if (status === 'saved') return <span className="text-xs text-pass">Saved</span>;
  return null;
}

function PropertyTab({ property, onSaved }: { property: Property; onSaved: () => void }) {
  const [form, setForm] = useState(property);
  const saver = useAutoSave<Partial<Property>>((value) => api.patch(`/api/properties/${property.id}`, value), onSaved);

  const update = <K extends keyof Property>(key: K, value: Property[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    saver.queue({ [key]: value } as Partial<Property>);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="The unit" actions={<SaveState status={saver.status} error={saver.error} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <TextInput value={form.name} onChange={(event) => update('name', event.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(event) => update('status', event.target.value as Property['status'])}>
              <option value="review">Under review</option>
              <option value="owned">Owned</option>
              <option value="rejected">Rejected</option>
              <option value="sold">Sold</option>
            </Select>
          </Field>
          <Field label="Street address">
            <TextInput value={form.streetAddress ?? ''} onChange={(event) => update('streetAddress', event.target.value)} />
          </Field>
          <Field label="Suburb">
            <TextInput value={form.suburb ?? ''} onChange={(event) => update('suburb', event.target.value)} />
          </Field>
          <Field label="Scheme">
            <TextInput value={form.schemeName ?? ''} onChange={(event) => update('schemeName', event.target.value)} />
          </Field>
          <Field label="Unit number">
            <TextInput value={form.unitNumber ?? ''} onChange={(event) => update('unitNumber', event.target.value)} />
          </Field>
          <Field label="Asset type" hint="Drives the seasonality curve, cleaning intensity and furnishing default.">
            <Select value={form.assetType} onChange={(event) => update('assetType', event.target.value)}>
              {ASSET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ASSET_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Floor area (m²)">
            <TextInput
              inputMode="decimal"
              value={form.floorAreaM2 ?? ''}
              onChange={(event) => update('floorAreaM2', Number(event.target.value) || null)}
            />
          </Field>
          <Field label="Bedrooms">
            <TextInput
              inputMode="numeric"
              value={form.bedrooms ?? ''}
              onChange={(event) => update('bedrooms', Number(event.target.value) || null)}
            />
          </Field>
          <Field label="Bathrooms">
            <TextInput
              inputMode="decimal"
              value={form.bathrooms ?? ''}
              onChange={(event) => update('bathrooms', Number(event.target.value) || null)}
            />
          </Field>
          <Field label="Parking bays">
            <TextInput
              inputMode="numeric"
              value={form.parkingBays ?? ''}
              onChange={(event) => update('parkingBays', Number(event.target.value) || null)}
            />
          </Field>
          <Field label="Transfer date" hint="Leave empty while under review; the model assumes the first of next month.">
            <TextInput type="date" value={form.transferDate ?? ''} onChange={(event) => update('transferDate', event.target.value || null)} />
          </Field>
          <Field label="Listing URL">
            <TextInput value={form.listingUrl ?? ''} onChange={(event) => update('listingUrl', event.target.value)} />
          </Field>
          <Field label="Agent contact">
            <TextInput value={form.agentContact ?? ''} onChange={(event) => update('agentContact', event.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Notes">
            <TextArea rows={3} value={form.notes ?? ''} onChange={(event) => update('notes', event.target.value)} />
          </Field>
        </div>
      </Card>

      <Card
        title="Short-term letting gate"
        subtitle="A body corporate can restrict or ban short-term letting, and can change its rules after purchase. Nothing passes until this is settled."
      >
        <div className="grid gap-4">
          <Field label="Does the scheme permit short-term letting?">
            <Select value={form.strPermitted} onChange={(event) => update('strPermitted', event.target.value as Property['strPermitted'])}>
              <option value="unknown">Not checked</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Date the conduct rules were read">
            <TextInput
              type="date"
              value={form.strRulesCheckedDate ?? ''}
              onChange={(event) => update('strRulesCheckedDate', event.target.value || null)}
            />
          </Field>
          <Field label="What the rules say" hint="Quote the clause. A summary from an agent is not the rules.">
            <TextArea
              rows={4}
              value={form.strRestrictionNotes ?? ''}
              onChange={(event) => update('strRestrictionNotes', event.target.value)}
            />
          </Field>
          <DocumentUploader ownerType="property" ownerId={property.id} kind="str_rules" />
        </div>
      </Card>
    </div>
  );
}

function DocumentUploader({ ownerType, ownerId, kind }: { ownerType: 'property' | 'comparable'; ownerId: string; kind?: string }) {
  const queryClient = useQueryClient();
  const documents = useQuery({
    queryKey: ['documents', ownerType, ownerId],
    queryFn: () => api.get<{ id: string; originalFilename: string; kind: string | null }[]>(
      `/api/documents?ownerType=${ownerType}&ownerId=${ownerId}`,
    ),
  });

  return (
    <div>
      <p className="text-sm font-medium">Documents</p>
      <input
        type="file"
        className="mt-1 block w-full text-sm"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const form = new FormData();
          form.append('file', file);
          form.append('ownerType', ownerType);
          form.append('ownerId', ownerId);
          if (kind) form.append('kind', kind);
          await api.upload('/api/documents', form);
          queryClient.invalidateQueries();
          event.target.value = '';
        }}
      />
      <ul className="mt-2 space-y-1 text-sm">
        {(documents.data ?? []).map((document) => (
          <li key={document.id} className="flex items-center justify-between gap-2">
            <a className="text-accent hover:underline" href={`/api/documents/${document.id}/download`}>
              {document.originalFilename}
            </a>
            <button
              type="button"
              className="text-xs text-fail hover:underline"
              onClick={async () => {
                if (!window.confirm(`Delete ${document.originalFilename}? This cannot be undone.`)) return;
                await api.delete(`/api/documents/${document.id}`);
                queryClient.invalidateQueries();
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PurchaseTab({
  property,
  bundle,
  projection,
  onSaved,
}: {
  property: Property;
  bundle: ScenarioBundleResponse;
  projection: ProjectionResponse | undefined;
  onSaved: () => void;
}) {
  const [price, setPrice] = useState(String(property.purchasePrice / 100));
  const [finance, setFinance] = useState(bundle.finance);
  const priceSaver = useAutoSave<number>((value) => api.patch(`/api/properties/${property.id}`, { purchasePrice: value }), onSaved);
  const financeSaver = useAutoSave((value: typeof finance) => api.put(`/api/scenarios/${bundle.scenario.id}/finance`, value), onSaved);

  const updateFinance = <K extends keyof typeof finance>(key: K, value: (typeof finance)[K]) => {
    const next = { ...finance, [key]: value };
    setFinance(next);
    financeSaver.queue(next);
  };

  const summary = projection?.summary;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Purchase" actions={<SaveState status={priceSaver.status} error={priceSaver.error} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Purchase price">
            <TextInput
              value={price}
              onChange={(event) => {
                setPrice(event.target.value);
                const cents = parseRands(event.target.value);
                if (cents) priceSaver.queue(cents);
              }}
            />
          </Field>
          <Field label="Deposit" hint="Ten percent is the target. The solvers will tell you what this deal actually needs.">
            <TextInput
              value={(finance.depositPct * 100).toFixed(2)}
              onChange={(event) => {
                const rate = parsePercent(event.target.value);
                if (rate !== null) updateFinance('depositPct', rate);
              }}
            />
          </Field>
          <Field label="Transfer duty applies">
            <Select
              value={finance.transferDutyApplies ? 'yes' : 'no'}
              onChange={(event) => updateFinance('transferDutyApplies', event.target.value === 'yes')}
            >
              <option value="yes">Yes, second-hand stock</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="VAT inclusive purchase" hint="New stock from a VAT-registered developer. No transfer duty is payable.">
            <Select
              value={finance.vatInclusivePurchase ? 'yes' : 'no'}
              onChange={(event) => updateFinance('vatInclusivePurchase', event.target.value === 'yes')}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="Furnishing">
            <TextInput
              value={finance.furnishingCost / 100}
              onChange={(event) => {
                const cents = parseRands(event.target.value);
                if (cents !== null) updateFinance('furnishingCost', cents);
              }}
            />
          </Field>
          <Field label="Other setup costs">
            <TextInput
              value={finance.otherSetupCosts / 100}
              onChange={(event) => {
                const cents = parseRands(event.target.value);
                if (cents !== null) updateFinance('otherSetupCosts', cents);
              }}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Cash at transfer"
        subtitle="The gap between a ten percent deposit and what actually leaves the bank account is the most commonly underestimated number in this business."
      >
        {!summary ? (
          <Spinner />
        ) : (
          <Table>
            <tbody>
              <tr>
                <Td>Deposit</Td>
                <Td align="right">{rands(summary.deposit)}</Td>
              </tr>
              <tr>
                <Td>Transfer duty</Td>
                <Td align="right">{rands(summary.transferDuty)}</Td>
              </tr>
              <tr>
                <Td>Transfer attorney and deeds office</Td>
                <Td align="right">{rands(summary.transferAttorneyFees)}</Td>
              </tr>
              <tr>
                <Td>Bond registration and initiation</Td>
                <Td align="right">{rands(summary.bondRegistrationFees)}</Td>
              </tr>
              <tr>
                <Td>Furnishing</Td>
                <Td align="right">{rands(summary.furnishingCost)}</Td>
              </tr>
              <tr>
                <Td>Other setup</Td>
                <Td align="right">{rands(summary.otherSetupCosts)}</Td>
              </tr>
              <tr className="font-semibold">
                <Td>Total cash at transfer</Td>
                <Td align="right">{rands(summary.initialCashIn)}</Td>
              </tr>
              <tr>
                <Td>As a share of the purchase price</Td>
                <Td align="right">{percent(summary.initialCashInPctOfPrice)}</Td>
              </tr>
              <tr className="font-semibold">
                <Td>Per director</Td>
                <Td align="right">{rands(summary.initialCashInPerDirector)}</Td>
              </tr>
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function FinanceTab({ bundle, onSaved }: { bundle: ScenarioBundleResponse; onSaved: () => void }) {
  const [finance, setFinance] = useState(bundle.finance);
  const [rates, setRates] = useState(bundle.ratePath.map((row) => ({ fromMonth: row.fromMonth, primeRate: row.primeRate })));
  const financeSaver = useAutoSave((value: typeof finance) => api.put(`/api/scenarios/${bundle.scenario.id}/finance`, value), onSaved);
  const rateSaver = useAutoSave((value: typeof rates) => api.put(`/api/scenarios/${bundle.scenario.id}/rate-path`, value), onSaved);

  const updateFinance = <K extends keyof typeof finance>(key: K, value: (typeof finance)[K]) => {
    const next = { ...finance, [key]: value };
    setFinance(next);
    financeSaver.queue(next);
  };

  const updateRates = (next: typeof rates) => {
    setRates(next);
    rateSaver.queue(next);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="The bond" actions={<SaveState status={financeSaver.status} error={financeSaver.error} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Term (months)">
            <TextInput
              inputMode="numeric"
              value={finance.bondTermMonths}
              onChange={(event) => updateFinance('bondTermMonths', Number(event.target.value) || 240)}
            />
          </Field>
          <Field label="Rate basis">
            <Select value={finance.rateBasis} onChange={(event) => updateFinance('rateBasis', event.target.value as 'prime_linked' | 'fixed')}>
              <option value="prime_linked">Linked to prime</option>
              <option value="fixed">Fixed</option>
            </Select>
          </Field>
          {finance.rateBasis === 'prime_linked' ? (
            <Field label="Margin against prime" hint="Minus one percent is the Five Peaks facility.">
              <TextInput
                value={(finance.rateMargin * 100).toFixed(2)}
                onChange={(event) => {
                  const rate = parsePercent(event.target.value);
                  if (rate !== null) updateFinance('rateMargin', rate);
                }}
              />
            </Field>
          ) : (
            <Field label="Fixed rate">
              <TextInput
                value={((finance.fixedRate ?? 0) * 100).toFixed(2)}
                onChange={(event) => {
                  const rate = parsePercent(event.target.value);
                  if (rate !== null) updateFinance('fixedRate', rate);
                }}
              />
            </Field>
          )}
          <Field label="Projection horizon (months)">
            <TextInput
              inputMode="numeric"
              value={finance.projectionMonths}
              onChange={(event) => updateFinance('projectionMonths', Number(event.target.value) || 240)}
            />
          </Field>
          <Field label="Surplus reinvestment rate" hint="What cash the property throws off is assumed to earn.">
            <TextInput
              value={(finance.surplusReinvestmentRate * 100).toFixed(2)}
              onChange={(event) => {
                const rate = parsePercent(event.target.value);
                if (rate !== null) updateFinance('surplusReinvestmentRate', rate);
              }}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Rate path"
        subtitle="A list of changes rather than one rate forever, so a rate shock from a given month is a row and not a separate scenario."
        actions={<SaveState status={rateSaver.status} error={rateSaver.error} />}
      >
        <Table>
          <thead>
            <tr>
              <Th>From month</Th>
              <Th align="right">Prime</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rates.map((row, index) => (
              <tr key={index}>
                <Td>
                  <TextInput
                    inputMode="numeric"
                    value={row.fromMonth}
                    onChange={(event) => {
                      const next = [...rates];
                      next[index] = { ...row, fromMonth: Number(event.target.value) || 0 };
                      updateRates(next);
                    }}
                  />
                </Td>
                <Td align="right">
                  <TextInput
                    value={(row.primeRate * 100).toFixed(2)}
                    onChange={(event) => {
                      const rate = parsePercent(event.target.value);
                      if (rate === null) return;
                      const next = [...rates];
                      next[index] = { ...row, primeRate: rate };
                      updateRates(next);
                    }}
                  />
                </Td>
                <Td align="right">
                  {rates.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-fail hover:underline"
                      onClick={() => updateRates(rates.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            const last = rates[rates.length - 1];
            updateRates([...rates, { fromMonth: (last?.fromMonth ?? 0) + 12, primeRate: last?.primeRate ?? 0.105 }]);
          }}
        >
          Add a rate change
        </Button>
      </Card>
    </div>
  );
}

function RevenueTab({ bundle, onSaved }: { bundle: ScenarioBundleResponse; onSaved: () => void }) {
  const [revenue, setRevenue] = useState({
    ...bundle.revenue,
    ltrVacantMonths: JSON.parse(bundle.revenue.ltrVacantMonths) as number[],
  });
  const [rows, setRows] = useState<SeasonalityRow[]>(bundle.seasonality);
  const [bulk, setBulk] = useState('');

  const revenueSaver = useAutoSave(
    (value: typeof revenue) => api.put(`/api/scenarios/${bundle.scenario.id}/revenue`, value),
    onSaved,
  );
  const seasonSaver = useAutoSave(
    (value: SeasonalityRow[]) =>
      api.put(
        `/api/scenarios/${bundle.scenario.id}/seasonality`,
        value.map((row) => ({
          monthOfYear: row.monthOfYear,
          seasonIndex: row.seasonIndex,
          adr: row.adr,
          occupancy: row.occupancy,
          avgLos: row.avgLos,
          turnovers: row.turnovers,
        })),
      ),
    onSaved,
  );

  const templates = useQuery({
    queryKey: ['seasonality-templates'],
    queryFn: () => api.get<{ id: string; name: string; kind: string; monthlyIndex: number[]; notes: string }[]>('/api/seasonality-templates'),
  });

  const updateRevenue = <K extends keyof typeof revenue>(key: K, value: (typeof revenue)[K]) => {
    const next = { ...revenue, [key]: value };
    setRevenue(next);
    revenueSaver.queue(next);
  };

  const updateRow = (monthOfYear: number, patch: Partial<SeasonalityRow>) => {
    const next = rows.map((row) => (row.monthOfYear === monthOfYear ? { ...row, ...patch } : row));
    setRows(next);
    seasonSaver.queue(next);
  };

  const curveSum = useMemo(() => rows.reduce((sum, row) => sum + row.seasonIndex, 0), [rows]);

  return (
    <div className="space-y-4">
      <Card
        title="Revenue"
        subtitle="Annual gross is the primary input, because that is the figure the managers actually keep. Nightly rate and occupancy are the optional decomposition, used to work out how many cleans there are."
        actions={<SaveState status={revenueSaver.status} error={revenueSaver.error} />}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Letting strategy">
            <Select value={revenue.strategy} onChange={(event) => updateRevenue('strategy', event.target.value as 'str' | 'ltr')}>
              <option value="str">Short-term letting</option>
              <option value="ltr">Long-term lease</option>
            </Select>
          </Field>
          <Field label="Revenue entered as">
            <Select
              value={revenue.revenueMode}
              onChange={(event) => updateRevenue('revenueMode', event.target.value as 'annual_gross' | 'adr_occupancy')}
            >
              <option value="annual_gross">Annual gross, spread by the curve</option>
              <option value="adr_occupancy">Nightly rate and occupancy</option>
            </Select>
          </Field>
          <Field label="Turnover count from">
            <Select
              value={revenue.turnoverMode}
              onChange={(event) => updateRevenue('turnoverMode', event.target.value as typeof revenue.turnoverMode)}
            >
              <option value="occupancy_los">Occupancy and length of stay</option>
              <option value="adr_los">Nightly rate and length of stay</option>
              <option value="explicit">Entered directly</option>
            </Select>
          </Field>
          <Field label="Annual gross revenue">
            <TextInput
              value={revenue.annualGross / 100}
              onChange={(event) => {
                const cents = parseRands(event.target.value);
                if (cents !== null) updateRevenue('annualGross', cents);
              }}
            />
          </Field>
          <Field label="Long-term monthly rent" hint="Used for the side-by-side comparison and the letting ban stress test.">
            <TextInput
              value={revenue.ltrMonthlyRent / 100}
              onChange={(event) => {
                const cents = parseRands(event.target.value);
                if (cents !== null) updateRevenue('ltrMonthlyRent', cents);
              }}
            />
          </Field>
          <Field label="Lease months" hint="An eleven month student lease leaves one structurally vacant month a year.">
            <TextInput
              inputMode="numeric"
              value={revenue.ltrLeaseMonths}
              onChange={(event) => updateRevenue('ltrLeaseMonths', Number(event.target.value) || 11)}
            />
          </Field>
          <Field label="Vacant calendar months" hint="Comma separated, e.g. 12 for December.">
            <TextInput
              value={revenue.ltrVacantMonths.join(', ')}
              onChange={(event) =>
                updateRevenue(
                  'ltrVacantMonths',
                  event.target.value
                    .split(',')
                    .map((part) => Number(part.trim()))
                    .filter((value) => value >= 1 && value <= 12),
                )
              }
            />
          </Field>
          <Field label="Evidence">
            <Select value={revenue.evidenced ? 'yes' : 'no'} onChange={(event) => updateRevenue('evidenced', event.target.value === 'yes')}>
              <option value="no">Assumed</option>
              <option value="yes">Evidenced</option>
            </Select>
          </Field>
          <Field label="Where this figure came from">
            <TextInput value={revenue.evidenceNote ?? ''} onChange={(event) => updateRevenue('evidenceNote', event.target.value)} />
          </Field>
        </div>
      </Card>

      <Card
        title="Twelve months"
        subtitle="Seasonality is never averaged away. An annual average flatters cashflow and hides the worst month, which is the month that decides how much cash the directors need available."
        actions={
          <div className="flex items-center gap-2">
            <SaveState status={seasonSaver.status} error={seasonSaver.error} />
            <Select
              className="!mt-0"
              defaultValue=""
              onChange={async (event) => {
                if (!event.target.value) return;
                await api.post(`/api/scenarios/${bundle.scenario.id}/seasonality/template`, { templateId: event.target.value });
                onSaved();
                event.target.value = '';
              }}
            >
              <option value="">Apply a curve…</option>
              {(templates.data ?? []).map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="Paste twelve values" hint="Comma or tab separated. Fills the seasonality column.">
            <TextInput value={bulk} onChange={(event) => setBulk(event.target.value)} placeholder="1.20, 1.34, 1.14, …" />
          </Field>
          <Button
            variant="secondary"
            onClick={() => {
              const values = bulk
                .split(/[\t,\s]+/)
                .map((part) => Number(part.trim()))
                .filter((value) => !Number.isNaN(value));
              if (values.length !== 12) {
                window.alert('Paste exactly twelve values.');
                return;
              }
              const next = rows.map((row) => ({ ...row, seasonIndex: values[row.monthOfYear - 1] as number }));
              setRows(next);
              seasonSaver.queue(next);
              setBulk('');
            }}
          >
            Fill
          </Button>
          <span className="text-xs text-ink-soft">
            The twelve multipliers currently sum to {curveSum.toFixed(2)}; they are normalised to an average of one, so
            the annual gross you entered is what the year produces.
          </span>
        </div>

        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th align="right">Seasonality</Th>
              <Th align="right">Nightly rate</Th>
              <Th align="right">Occupancy</Th>
              <Th align="right">Length of stay</Th>
              <Th align="right">Turnovers</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.monthOfYear}>
                <Td>{monthShort(row.monthOfYear)}</Td>
                <Td align="right">
                  <TextInput
                    value={row.seasonIndex}
                    onChange={(event) => updateRow(row.monthOfYear, { seasonIndex: Number(event.target.value) || 0 })}
                  />
                </Td>
                <Td align="right">
                  <TextInput
                    value={row.adr === null ? '' : row.adr / 100}
                    onChange={(event) => updateRow(row.monthOfYear, { adr: parseRands(event.target.value) })}
                  />
                </Td>
                <Td align="right">
                  <TextInput
                    value={row.occupancy === null ? '' : (row.occupancy * 100).toFixed(0)}
                    onChange={(event) => updateRow(row.monthOfYear, { occupancy: parsePercent(event.target.value) })}
                  />
                </Td>
                <Td align="right">
                  <TextInput
                    value={row.avgLos ?? ''}
                    onChange={(event) => updateRow(row.monthOfYear, { avgLos: Number(event.target.value) || null })}
                  />
                </Td>
                <Td align="right">
                  <TextInput
                    value={row.turnovers ?? ''}
                    onChange={(event) => updateRow(row.monthOfYear, { turnovers: Number(event.target.value) || null })}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-ink-soft">
          Length of stay drives the number of cleans, and nothing else does. Halve it and the cleaning bill doubles on
          identical revenue.
        </p>
      </Card>
    </div>
  );
}

function CostsTab({ bundle, onSaved }: { bundle: ScenarioBundleResponse; onSaved: () => void }) {
  const [lines, setLines] = useState<CostLineRow[]>(bundle.costLines);
  const [oneOffs, setOneOffs] = useState<OneOffCostRow[]>(bundle.oneOffCosts);

  const lineSaver = useAutoSave(
    (value: CostLineRow[]) =>
      api.put(
        `/api/scenarios/${bundle.scenario.id}/cost-lines`,
        value.map((line) => ({
          id: line.id,
          label: line.label,
          category: line.category,
          basis: line.basis,
          rate: line.rate,
          amount: line.amount,
          escalationPct: line.escalationPct,
          vatInputClaimable: line.vatInputClaimable,
          evidenced: line.evidenced,
          evidenceNote: line.evidenceNote,
          sortOrder: line.sortOrder,
          strategy: line.strategy,
        })),
      ),
    onSaved,
  );

  const oneOffSaver = useAutoSave(
    (value: OneOffCostRow[]) =>
      api.put(
        `/api/scenarios/${bundle.scenario.id}/one-off-costs`,
        value.map((cost) => ({
          id: cost.id,
          label: cost.label,
          monthIndex: cost.monthIndex,
          amount: cost.amount,
          recurringEveryMonths: cost.recurringEveryMonths,
          vatInputClaimable: cost.vatInputClaimable,
        })),
      ),
    onSaved,
  );

  const update = (id: string, patch: Partial<CostLineRow>) => {
    const next = lines.map((line) => (line.id === id ? { ...line, ...patch } : line));
    setLines(next);
    lineSaver.queue(next);
  };

  const isRateBasis = (basis: CostLineRow['basis']) => basis === 'pct_of_gross' || basis === 'pct_of_revenue_reserve';

  return (
    <div className="space-y-4">
      {(['str', 'ltr'] as const).map((strategy) => (
        <Card
          key={strategy}
          title={strategy === 'str' ? 'Short-term letting costs' : 'Long-term letting costs'}
          subtitle={
            strategy === 'str'
              ? 'Costs are rows, not fields, because levies and maintenance escalate at different rates and you will want lines this model never anticipated.'
              : 'Used for the side-by-side comparison and for the forced conversion stress test.'
          }
          actions={<SaveState status={lineSaver.status} error={lineSaver.error} />}
        >
          <Table className="min-w-[52rem]">
            <thead>
              <tr>
                <Th>Label</Th>
                <Th>Category</Th>
                <Th>Basis</Th>
                <Th align="right">Value</Th>
                <Th align="right">Escalation</Th>
                <Th align="center">VAT input</Th>
                <Th align="center">Evidence</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {lines
                .filter((line) => line.strategy === strategy)
                .map((line) => (
                  <tr key={line.id}>
                    <Td>
                      <TextInput value={line.label} onChange={(event) => update(line.id, { label: event.target.value })} />
                    </Td>
                    <Td>
                      <Select value={line.category} onChange={(event) => update(line.id, { category: event.target.value })}>
                        {COST_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td>
                      <Select
                        value={line.basis}
                        onChange={(event) => update(line.id, { basis: event.target.value as CostLineRow['basis'] })}
                      >
                        {COST_BASES.map((basis) => (
                          <option key={basis} value={basis}>
                            {COST_BASIS_LABELS[basis]}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td align="right">
                      {isRateBasis(line.basis) ? (
                        <TextInput
                          value={((line.rate ?? 0) * 100).toFixed(2)}
                          onChange={(event) => {
                            const rate = parsePercent(event.target.value);
                            if (rate !== null) update(line.id, { rate, amount: null });
                          }}
                        />
                      ) : (
                        <TextInput
                          value={(line.amount ?? 0) / 100}
                          onChange={(event) => {
                            const cents = parseRands(event.target.value);
                            if (cents !== null) update(line.id, { amount: cents, rate: null });
                          }}
                        />
                      )}
                    </Td>
                    <Td align="right">
                      <TextInput
                        value={(line.escalationPct * 100).toFixed(1)}
                        onChange={(event) => {
                          const rate = parsePercent(event.target.value);
                          if (rate !== null) update(line.id, { escalationPct: rate });
                        }}
                      />
                    </Td>
                    <Td align="center">
                      <input
                        type="checkbox"
                        checked={line.vatInputClaimable}
                        onChange={(event) => update(line.id, { vatInputClaimable: event.target.checked })}
                      />
                    </Td>
                    <Td align="center">
                      <button type="button" onClick={() => update(line.id, { evidenced: !line.evidenced })}>
                        <EvidenceMark evidenced={line.evidenced} note={line.evidenceNote} />
                      </button>
                    </Td>
                    <Td align="right">
                      <button
                        type="button"
                        className="text-xs text-fail hover:underline"
                        onClick={() => {
                          const next = lines.filter((candidate) => candidate.id !== line.id);
                          setLines(next);
                          lineSaver.queue(next);
                        }}
                      >
                        Remove
                      </button>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </Table>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => {
              const next = [
                ...lines,
                {
                  id: `new-${Date.now()}`,
                  scenarioId: bundle.scenario.id,
                  label: 'New cost',
                  category: 'other',
                  basis: 'fixed_monthly' as const,
                  rate: null,
                  amount: 0,
                  escalationPct: 0.06,
                  vatInputClaimable: false,
                  evidenced: false,
                  evidenceNote: null,
                  sortOrder: lines.length + 1,
                  strategy,
                },
              ];
              setLines(next);
              lineSaver.queue(next);
            }}
          >
            Add a cost line
          </Button>
        </Card>
      ))}

      <Card
        title="One-off and recurring costs"
        subtitle="Special levies, furniture replacement cycles, a new geyser. A special levy can be five figures with little notice."
        actions={<SaveState status={oneOffSaver.status} error={oneOffSaver.error} />}
      >
        <Table>
          <thead>
            <tr>
              <Th>Label</Th>
              <Th align="right">Month</Th>
              <Th align="right">Amount</Th>
              <Th align="right">Repeats every</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {oneOffs.map((cost, index) => (
              <tr key={cost.id}>
                <Td>
                  <TextInput
                    value={cost.label}
                    onChange={(event) => {
                      const next = [...oneOffs];
                      next[index] = { ...cost, label: event.target.value };
                      setOneOffs(next);
                      oneOffSaver.queue(next);
                    }}
                  />
                </Td>
                <Td align="right">
                  <TextInput
                    inputMode="numeric"
                    value={cost.monthIndex}
                    onChange={(event) => {
                      const next = [...oneOffs];
                      next[index] = { ...cost, monthIndex: Number(event.target.value) || 0 };
                      setOneOffs(next);
                      oneOffSaver.queue(next);
                    }}
                  />
                </Td>
                <Td align="right">
                  <TextInput
                    value={cost.amount / 100}
                    onChange={(event) => {
                      const cents = parseRands(event.target.value);
                      if (cents === null) return;
                      const next = [...oneOffs];
                      next[index] = { ...cost, amount: cents };
                      setOneOffs(next);
                      oneOffSaver.queue(next);
                    }}
                  />
                </Td>
                <Td align="right">
                  <TextInput
                    inputMode="numeric"
                    value={cost.recurringEveryMonths ?? ''}
                    placeholder="never"
                    onChange={(event) => {
                      const next = [...oneOffs];
                      next[index] = { ...cost, recurringEveryMonths: Number(event.target.value) || null };
                      setOneOffs(next);
                      oneOffSaver.queue(next);
                    }}
                  />
                </Td>
                <Td align="right">
                  <button
                    type="button"
                    className="text-xs text-fail hover:underline"
                    onClick={() => {
                      const next = oneOffs.filter((_, i) => i !== index);
                      setOneOffs(next);
                      oneOffSaver.queue(next);
                    }}
                  >
                    Remove
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            const next = [
              ...oneOffs,
              {
                id: `new-${Date.now()}`,
                scenarioId: bundle.scenario.id,
                label: 'Special levy',
                monthIndex: 24,
                amount: 0,
                recurringEveryMonths: null,
                vatInputClaimable: false,
              },
            ];
            setOneOffs(next);
            oneOffSaver.queue(next);
          }}
        >
          Add a one-off cost
        </Button>
      </Card>
    </div>
  );
}

function GrowthTab({ bundle, onSaved }: { bundle: ScenarioBundleResponse; onSaved: () => void }) {
  const [growth, setGrowth] = useState(bundle.growth);
  const saver = useAutoSave(
    (value: typeof growth) =>
      api.put(`/api/scenarios/${bundle.scenario.id}/growth`, {
        capitalGrowthPct: value.capitalGrowthPct,
        capitalGrowthPerYear: value.capitalGrowthPerYear ? JSON.parse(value.capitalGrowthPerYear) : null,
        revenueEscalationPct: value.revenueEscalationPct,
        evidenced: value.evidenced,
        evidenceNote: value.evidenceNote,
      }),
    onSaved,
  );

  const update = <K extends keyof typeof growth>(key: K, value: (typeof growth)[K]) => {
    const next = { ...growth, [key]: value };
    setGrowth(next);
    saver.queue(next);
  };

  return (
    <Card title="Growth and escalation" actions={<SaveState status={saver.status} error={saver.error} />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Capital growth" hint="Replace the seeded figure with Stellenbosch evidence.">
          <TextInput
            value={(growth.capitalGrowthPct * 100).toFixed(2)}
            onChange={(event) => {
              const rate = parsePercent(event.target.value);
              if (rate !== null) update('capitalGrowthPct', rate);
            }}
          />
        </Field>
        <Field
          label="Revenue escalation"
          hint="Seeded at four percent. The managers' own records show 3.3 percent in 2025 and minus 0.1 percent in 2026."
        >
          <TextInput
            value={(growth.revenueEscalationPct * 100).toFixed(2)}
            onChange={(event) => {
              const rate = parsePercent(event.target.value);
              if (rate !== null) update('revenueEscalationPct', rate);
            }}
          />
        </Field>
        <Field label="Evidence">
          <Select value={growth.evidenced ? 'yes' : 'no'} onChange={(event) => update('evidenced', event.target.value === 'yes')}>
            <option value="no">Assumed</option>
            <option value="yes">Evidenced</option>
          </Select>
        </Field>
        <Field label="Where these figures came from">
          <TextInput value={growth.evidenceNote ?? ''} onChange={(event) => update('evidenceNote', event.target.value)} />
        </Field>
      </div>
      <div className="mt-4">
        <Warning tone="caution" title="Escalation is the assumption that decides whether this deal ever works.">
          Revenue must outrun costs by a meaningful margin for the shortfall to close. The verdict page runs this deal at
          zero, three, five and seven percent so you can see where it stops working.
        </Warning>
      </div>
    </Card>
  );
}

function RefinanceTab({
  bundle,
  projection,
  onSaved,
}: {
  bundle: ScenarioBundleResponse;
  projection: ProjectionResponse | undefined;
  onSaved: () => void;
}) {
  const [policy, setPolicy] = useState(bundle.refinance);
  const saver = useAutoSave((value: typeof policy) => api.put(`/api/scenarios/${bundle.scenario.id}/refinance`, value), onSaved);

  const update = <K extends keyof typeof policy>(key: K, value: (typeof policy)[K]) => {
    const next = { ...policy, [key]: value };
    setPolicy(next);
    saver.queue(next);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Refinance policy" actions={<SaveState status={saver.status} error={saver.error} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Enabled">
            <Select value={policy.enabled ? 'yes' : 'no'} onChange={(event) => update('enabled', event.target.value === 'yes')}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="Target loan to value">
            <TextInput
              value={(policy.targetLtv * 100).toFixed(1)}
              onChange={(event) => {
                const rate = parsePercent(event.target.value);
                if (rate !== null) update('targetLtv', rate);
              }}
            />
          </Field>
          <Field label="Minimum months between releases">
            <TextInput
              inputMode="numeric"
              value={policy.minMonthsBetween}
              onChange={(event) => update('minMonthsBetween', Number(event.target.value) || 0)}
            />
          </Field>
          <Field label="Minimum release">
            <TextInput
              value={policy.minRelease / 100}
              onChange={(event) => {
                const cents = parseRands(event.target.value);
                if (cents !== null) update('minRelease', cents);
              }}
            />
          </Field>
          <Field label="Re-registration cost" hint="As a percentage of the new bond.">
            <TextInput
              value={(policy.recostPct * 100).toFixed(2)}
              onChange={(event) => {
                const rate = parsePercent(event.target.value);
                if (rate !== null) update('recostPct', rate);
              }}
            />
          </Field>
        </div>
      </Card>

      <Card title="Releases in this projection" subtitle="Refinancing is not free. It should visibly push breakeven out.">
        {!projection ? (
          <Spinner />
        ) : projection.summary.refinanceEvents.length === 0 ? (
          <p className="text-sm text-ink-soft">No release qualifies under this policy inside the projection.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th align="right">Released</Th>
                <Th align="right">Cost</Th>
                <Th align="right">Net</Th>
                <Th align="right">Payment after</Th>
              </tr>
            </thead>
            <tbody>
              {projection.summary.refinanceEvents.map((event) => (
                <tr key={event.monthIndex}>
                  <Td>{event.monthIndex}</Td>
                  <Td align="right">{rands(event.releaseGross)}</Td>
                  <Td align="right">{rands(event.recostAmount)}</Td>
                  <Td align="right">{rands(event.releaseNet)}</Td>
                  <Td align="right">
                    {rands(event.paymentAfter)}{' '}
                    <span className="text-xs text-fail">+{rands(event.paymentAfter - event.paymentBefore)}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function SolversTab({ scenarioId, projection }: { scenarioId: string; projection: ProjectionResponse | undefined }) {
  const [threshold, setThreshold] = useState('');
  const thresholds = projection?.thresholds;
  const chosen = parseRands(threshold) ?? thresholds?.ceiling ?? 400_000;

  const solve = useMutation({
    mutationFn: () => api.post<SolverResponse>(`/api/scenarios/${scenarioId}/solvers`, { thresholdPerDirector: chosen, months: 12 }),
  });

  return (
    <div className="space-y-4">
      <Card
        title="Solvers"
        subtitle="Three questions the model can answer directly instead of by trial and error."
        actions={
          <div className="flex items-end gap-2">
            <Field label="Shortfall ceiling per director">
              <TextInput
                value={threshold}
                placeholder={thresholds ? String(thresholds.ceiling / 100) : '4000'}
                onChange={(event) => setThreshold(event.target.value)}
              />
            </Field>
            <Button onClick={() => solve.mutate()} disabled={solve.isPending}>
              {solve.isPending ? 'Solving…' : 'Solve'}
            </Button>
          </div>
        }
      >
        {solve.error && <ErrorNote error={solve.error} />}
        {!solve.data ? (
          <p className="text-sm text-ink-soft">
            Set a ceiling and solve. Each answer is checked by feeding it back through the projection.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <SolverResult
              title="Minimum deposit"
              question="This deal fails at ten percent down. What would it take?"
              converged={solve.data.minimumDeposit.converged}
              value={percent(solve.data.minimumDeposit.depositPct)}
              detail={`${rands(solve.data.minimumDeposit.depositAmount)} of deposit`}
            />
            <SolverResult
              title="Maximum price"
              question="What can we actually shop for on this deposit?"
              converged={solve.data.maximumPrice.converged}
              value={rands(solve.data.maximumPrice.purchasePrice)}
              detail={`On ${rands(solve.data.availableDeposit)} of deposit cash`}
            />
            <SolverResult
              title="Required revenue"
              question="Can this unit achieve this?"
              converged={solve.data.requiredRevenue.converged}
              value={rands(solve.data.requiredRevenue.requiredAnnualGross)}
              detail={
                solve.data.requiredRevenue.impliedAdr
                  ? `${rands(solve.data.requiredRevenue.impliedAdr)} a night, against ${rands(solve.data.requiredRevenue.modelledAdr)} modelled`
                  : `Against ${rands(solve.data.requiredRevenue.modelledAnnualGross)} modelled`
              }
            />
          </div>
        )}
      </Card>
    </div>
  );
}

interface SolverResponse {
  minimumDeposit: { converged: boolean; depositPct: number; depositAmount: number };
  maximumPrice: { converged: boolean; purchasePrice: number };
  requiredRevenue: {
    converged: boolean;
    requiredAnnualGross: number;
    modelledAnnualGross: number;
    impliedAdr: number | null;
    modelledAdr: number | null;
  };
  availableDeposit: number;
  thresholds: { target: number; acceptable: number; ceiling: number };
}

function SolverResult({
  title,
  question,
  converged,
  value,
  detail,
}: {
  title: string;
  question: string;
  converged: boolean;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-xs uppercase tracking-wide text-ink-soft">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{question}</p>
      {converged ? (
        <>
          <p className="tabular mt-2 text-2xl font-semibold">{value}</p>
          <p className="text-xs text-ink-soft">{detail}</p>
        </>
      ) : (
        <div className="mt-2">
          <Badge tone="fail">No answer inside the search range</Badge>
          <p className="mt-1 text-xs text-ink-soft">
            Nothing in a plausible range clears the ceiling, so the model will not offer a figure that would not hold.
          </p>
        </div>
      )}
    </div>
  );
}
