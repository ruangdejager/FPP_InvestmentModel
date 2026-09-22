/**
 * Builds an engine input for an asset type straight from the assumptions
 * register and the seeded benchmarks, without touching the property tables.
 *
 * The asset class comparison is a question about the shape of the market, not
 * about any particular deal, so it must not create or mutate stored properties
 * to answer it.
 */
import type { AssetType, CostLine, ProjectionInput, RevenueInput } from '@fp/engine';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { groupSettings, seasonalityTemplates } from '../db/schema.js';
import { loadAssumptions, loadFeeScales, defaultTransferDate } from './build-input.js';

function seasonalityCurve(assetType: string): number[] {
  const kind = assetType.startsWith('house') ? 'house' : 'apartment';
  const template = db.select().from(seasonalityTemplates).where(eq(seasonalityTemplates.kind, kind)).get();
  if (!template) return Array.from({ length: 12 }, () => 1);
  return JSON.parse(template.monthlyIndex) as number[];
}

/**
 * The standard cost stack.
 *
 * Levies apply to sectional title and not to a freestanding house, and a house
 * carries longer average stays, which is most of why cleaning falls so much
 * harder on a studio.
 */
function benchmarkCostLines(assetType: string, register: ReturnType<typeof loadAssumptions>): CostLine[] {
  const isHouse = assetType.startsWith('house');
  return [
    { id: 'platform', label: 'Platform fee', category: 'platform_fee', basis: 'pct_of_gross', value: register.get('platform_fee'), escalationPct: 0, vatInputClaimable: false },
    { id: 'management', label: 'Management fee', category: 'management', basis: 'pct_of_gross', value: register.get('management_fee'), escalationPct: 0, vatInputClaimable: true },
    { id: 'cleaning', label: 'Cleaning', category: 'cleaning', basis: 'per_turnover', value: register.get('cleaning_fee'), escalationPct: register.optional('cost_escalation_default', 0.06), vatInputClaimable: true },
    { id: 'levies', label: 'Levies', category: 'levies', basis: 'fixed_monthly', value: isHouse ? 0 : 2_500_00, escalationPct: register.get('levy_escalation'), vatInputClaimable: true },
    { id: 'rates', label: 'Municipal rates', category: 'municipal_rates', basis: 'fixed_monthly', value: isHouse ? 2_200_00 : 900_00, escalationPct: register.optional('cost_escalation_default', 0.06), vatInputClaimable: false },
    { id: 'utilities', label: 'Utilities and Wi-Fi', category: 'utilities', basis: 'fixed_monthly', value: isHouse ? 2_500_00 : 1_200_00, escalationPct: register.get('levy_escalation'), vatInputClaimable: true },
    { id: 'insurance', label: 'Insurance', category: 'insurance', basis: 'fixed_monthly', value: isHouse ? 900_00 : 350_00, escalationPct: register.optional('cost_escalation_default', 0.06), vatInputClaimable: true },
    { id: 'maintenance', label: 'Maintenance reserve', category: 'maintenance', basis: 'pct_of_revenue_reserve', value: register.get('maintenance_reserve'), escalationPct: 0, vatInputClaimable: true },
  ];
}

/**
 * `purchasePrice` defaults to the reference price for the asset type, which is a
 * plausible asking price rather than evidence. It exists so net operating yield
 * means the same thing across asset types; the screen lets a director change it.
 */
export function buildBenchmarkInput(assetType: string, annualGross: number, purchasePrice?: number): ProjectionInput {
  const register = loadAssumptions();
  const price =
    purchasePrice ?? Math.round(register.optional(`reference_price_${assetType}`, 3_500_000_00));
  const group = db.select().from(groupSettings).where(eq(groupSettings.id, 'group')).get();
  const transferIso = defaultTransferDate();
  const [year, month] = transferIso.slice(0, 7).split('-').map(Number) as [number, number];
  const isHouse = assetType.startsWith('house');

  const revenue: RevenueInput = {
    strategy: 'str',
    str: {
      kind: 'annual_gross',
      annualGross,
      seasonality: { index: seasonalityCurve(assetType) },
      turnovers: {
        kind: 'occupancy_los',
        occupancyByMonth: Array.from({ length: 12 }, () => 0.65),
        // Houses let in longer blocks, which is why their cleaning bill is a far
        // smaller share of gross than a studio's.
        avgLosByMonth: Array.from({ length: 12 }, () => (isHouse ? 4 : 3)),
      },
    },
  };

  return {
    transferDate: { year, month },
    purchasePrice: price,
    assetType: assetType as AssetType,
    finance: {
      depositPct: register.get('default_deposit_pct'),
      bondTermMonths: Math.round(register.get('bond_term_months')),
      rateBasis: 'prime_linked',
      rateMargin: register.get('rate_margin'),
      transferDutyApplies: true,
      vatInclusivePurchase: false,
      furnishingCost: Math.round(register.optional(`furnishing_${assetType}`, register.get('furnishing_apt_1bed'))),
      otherSetupCosts: 0,
      // Two years is enough for a solver that scores the first twelve months,
      // and keeps the comparison quick enough to recompute on the screen.
      projectionMonths: 24,
    },
    ratePath: [{ fromMonth: 0, primeRate: register.get('prime_rate') }],
    revenue,
    conversion: null,
    costLines: benchmarkCostLines(assetType, register),
    oneOffCosts: [],
    growth: {
      capitalGrowth: { kind: 'flat', annualRate: register.get('capital_growth') },
      revenueEscalationPct: register.get('revenue_escalation'),
    },
    refinance: { enabled: false, targetLtv: 0.8, minMonthsBetween: 24, minRelease: 0, recostPct: 0 },
    tax: {
      companyRate: register.get('company_income_tax'),
      cgtInclusionRate: register.get('cgt_inclusion_rate'),
      assessedLossUtilisationCap: register.get('assessed_loss_cap'),
      dividendsTaxRate: register.get('dividends_tax'),
      openingAssessedLoss: 0,
    },
    vat: {
      rate: register.get('vat_rate'),
      registered: Boolean(group?.vatRegistered),
      registeredFromMonth: null,
      pricingMode: group?.vatPricingMode ?? 'absorbed',
    },
    exit: {
      agentCommissionPct: register.get('agent_commission_pct'),
      agentCommissionVatApplies: register.optional('agent_commission_vat_applies', 1) === 1,
      vatRate: register.get('vat_rate'),
    },
    feeScales: loadFeeScales(),
    cpi: { annualRate: register.get('cpi') },
    directorCount: Math.max(1, Math.round(register.get('director_count'))),
    surplusReinvestmentRate: register.get('surplus_reinvestment_rate'),
  };
}
