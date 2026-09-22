/**
 * Seeds the database.
 *
 * Safe to run repeatedly: it inserts only what is missing and never overwrites a
 * value a director has already corrected.
 *
 * Every assumption and every fee bracket is written with verified = false. The
 * calibration data, which is the only evidenced material here, is written
 * verified with its source recorded.
 */
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from './client.js';
import {
  assumptions,
  costLines,
  directors,
  feeScales,
  groupSettings,
  growthAssumptions,
  properties,
  ratePath,
  refinancePolicy,
  revenueBenchmarks,
  scenarioFinance,
  scenarioRevenue,
  scenarios,
  seasonality,
  seasonalityTemplates,
} from './schema.js';
import {
  APARTMENT_SEASONALITY,
  ASSUMPTIONS,
  CALIBRATED_ASSUMPTIONS,
  FEE_SCALES,
  R,
  REVENUE_BENCHMARKS,
  SEASONALITY_TEMPLATES,
} from './seed-data.js';
import { newId, newPassword } from '../lib/id.js';
import { isMainModule } from '../lib/is-main.js';
import { runMigrations } from './migrate.js';

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * The five director accounts.
 *
 * Names and addresses beyond the first are placeholders for the directors to
 * correct; the app never invents a person's details as fact.
 */
const SEED_DIRECTORS = [
  { name: 'Ruan de Jager', email: 'ruan@etse.co.za', isAdmin: true },
  { name: 'Director two', email: 'director2@fivepeaks.local', isAdmin: false },
  { name: 'Director three', email: 'director3@fivepeaks.local', isAdmin: false },
  { name: 'Director four', email: 'director4@fivepeaks.local', isAdmin: false },
  { name: 'Director five', email: 'director5@fivepeaks.local', isAdmin: false },
];

async function seedDirectors(): Promise<void> {
  const created: { email: string; password: string }[] = [];
  for (const seed of SEED_DIRECTORS) {
    const existing = db.select().from(directors).where(eq(directors.email, seed.email)).get();
    if (existing) continue;
    const password = process.env.SEED_PASSWORD ?? newPassword();
    await db.insert(directors).values({
      id: newId('dir'),
      name: seed.name,
      email: seed.email,
      passwordHash: await argon2.hash(password),
      sharePct: 0.2,
      active: true,
      isAdmin: seed.isAdmin,
    });
    created.push({ email: seed.email, password });
  }
  if (created.length > 0) {
    console.log('\nDirector accounts created. These passwords are shown once:');
    for (const account of created) console.log(`  ${account.email}  ${account.password}`);
    console.log('Reset any of them with: npm run reset-password -w @fp/server -- <email>\n');
  }
}

function seedAssumptions(): void {
  for (const assumption of ASSUMPTIONS) {
    const existing = db.select().from(assumptions).where(eq(assumptions.key, assumption.key)).get();
    if (existing) continue;
    db.insert(assumptions)
      .values({
        key: assumption.key,
        label: assumption.label,
        value: assumption.value,
        unit: assumption.unit,
        effectiveFrom: TODAY,
        source: null,
        // Unverified placeholders, supplied to make the app runnable. Not researched figures.
        verified: false,
        notes: assumption.notes ?? null,
      })
      .run();
  }

  for (const assumption of CALIBRATED_ASSUMPTIONS) {
    const existing = db.select().from(assumptions).where(eq(assumptions.key, assumption.key)).get();
    if (existing) continue;
    db.insert(assumptions)
      .values({
        key: assumption.key,
        label: assumption.label,
        value: assumption.value,
        unit: assumption.unit,
        effectiveFrom: TODAY,
        source: assumption.source,
        verified: true,
        verifiedDate: TODAY,
        notes: assumption.notes ?? null,
      })
      .run();
  }
}

function seedFeeScales(): void {
  const existing = db.select().from(feeScales).all();
  if (existing.length > 0) return;
  for (const bracket of FEE_SCALES) {
    db.insert(feeScales)
      .values({
        id: newId('fee'),
        kind: bracket.kind,
        effectiveFrom: bracket.effectiveFrom,
        lower: bracket.lower,
        upper: bracket.upper,
        baseAmount: bracket.baseAmount,
        marginalRate: bracket.marginalRate,
        verified: false,
        source: 'Approximate current scale, seeded to make the app runnable. Not checked against SARS or an attorney.',
      })
      .run();
  }
}

function seedTemplatesAndBenchmarks(): void {
  for (const template of SEASONALITY_TEMPLATES) {
    const existing = db.select().from(seasonalityTemplates).where(eq(seasonalityTemplates.id, template.id)).get();
    if (existing) continue;
    db.insert(seasonalityTemplates)
      .values({
        id: template.id,
        name: template.name,
        kind: template.kind,
        monthlyIndex: JSON.stringify(template.monthlyIndex),
        verified: template.verified,
        source: template.source,
        notes: template.notes,
      })
      .run();
  }

  const existingBenchmarks = db.select().from(revenueBenchmarks).all();
  if (existingBenchmarks.length > 0) return;
  for (const benchmark of REVENUE_BENCHMARKS) {
    db.insert(revenueBenchmarks)
      .values({
        id: newId('bench'),
        assetType: benchmark.assetType,
        label: benchmark.label,
        unitYears: benchmark.unitYears,
        medianAnnualGross: benchmark.median,
        lowAnnualGross: benchmark.low,
        highAnnualGross: benchmark.high,
        observationYear: benchmark.observationYear,
        verified: benchmark.verified,
        source: benchmark.source,
        notes: benchmark.notes,
      })
      .run();
  }
}

function seedGroupSettings(): void {
  const existing = db.select().from(groupSettings).where(eq(groupSettings.id, 'group')).get();
  if (existing) return;
  db.insert(groupSettings)
    .values({
      id: 'group',
      vatRegistered: false,
      vatPricingMode: 'absorbed',
      monthlyCapacity: R(25_000),
      growthBandLow: 0.05,
      growthBandHigh: 0.08,
      growthBandSource: 'Not yet entered. Fill this in from Lightstone or agent data before trusting any verdict.',
    })
    .run();
}

/** Standard short-term letting cost stack for a new scenario. */
export function defaultCostLines(scenarioId: string, assetType: string): typeof costLines.$inferInsert[] {
  const cleaningFee = db.select().from(assumptions).where(eq(assumptions.key, 'cleaning_fee')).get()?.value ?? R(650);
  const isHouse = assetType.startsWith('house');
  return [
    { id: newId('cost'), scenarioId, label: 'Platform fee', category: 'platform_fee', basis: 'pct_of_gross', rate: 0.03, escalationPct: 0, vatInputClaimable: false, sortOrder: 1, strategy: 'str' },
    { id: newId('cost'), scenarioId, label: 'Management fee', category: 'management', basis: 'pct_of_gross', rate: 0.15, escalationPct: 0, vatInputClaimable: true, sortOrder: 2, strategy: 'str' },
    { id: newId('cost'), scenarioId, label: 'Cleaning', category: 'cleaning', basis: 'per_turnover', amount: Math.round(cleaningFee), escalationPct: 0.06, vatInputClaimable: true, sortOrder: 3, strategy: 'str' },
    { id: newId('cost'), scenarioId, label: 'Levies', category: 'levies', basis: 'fixed_monthly', amount: isHouse ? 0 : R(2_500), escalationPct: 0.08, vatInputClaimable: true, sortOrder: 4, strategy: 'str' },
    { id: newId('cost'), scenarioId, label: 'Municipal rates', category: 'municipal_rates', basis: 'fixed_monthly', amount: R(900), escalationPct: 0.06, vatInputClaimable: false, sortOrder: 5, strategy: 'str' },
    { id: newId('cost'), scenarioId, label: 'Utilities and Wi-Fi', category: 'utilities', basis: 'fixed_monthly', amount: R(1_200), escalationPct: 0.08, vatInputClaimable: true, sortOrder: 6, strategy: 'str' },
    { id: newId('cost'), scenarioId, label: 'Insurance', category: 'insurance', basis: 'fixed_monthly', amount: R(350), escalationPct: 0.06, vatInputClaimable: true, sortOrder: 7, strategy: 'str' },
    { id: newId('cost'), scenarioId, label: 'Maintenance reserve', category: 'maintenance', basis: 'pct_of_revenue_reserve', rate: 0.05, escalationPct: 0, vatInputClaimable: true, sortOrder: 8, strategy: 'str' },
    { id: newId('cost'), scenarioId, label: 'Admin', category: 'admin', basis: 'fixed_monthly', amount: R(250), escalationPct: 0.06, vatInputClaimable: false, sortOrder: 9, strategy: 'str' },

    { id: newId('cost'), scenarioId, label: 'Letting agent', category: 'management', basis: 'pct_of_gross', rate: 0.08, escalationPct: 0, vatInputClaimable: true, sortOrder: 1, strategy: 'ltr' },
    { id: newId('cost'), scenarioId, label: 'Levies', category: 'levies', basis: 'fixed_monthly', amount: isHouse ? 0 : R(2_500), escalationPct: 0.08, vatInputClaimable: true, sortOrder: 2, strategy: 'ltr' },
    { id: newId('cost'), scenarioId, label: 'Municipal rates', category: 'municipal_rates', basis: 'fixed_monthly', amount: R(900), escalationPct: 0.06, vatInputClaimable: false, sortOrder: 3, strategy: 'ltr' },
    { id: newId('cost'), scenarioId, label: 'Insurance', category: 'insurance', basis: 'fixed_monthly', amount: R(350), escalationPct: 0.06, vatInputClaimable: true, sortOrder: 4, strategy: 'ltr' },
    { id: newId('cost'), scenarioId, label: 'Maintenance reserve', category: 'maintenance', basis: 'pct_of_revenue_reserve', rate: 0.05, escalationPct: 0, vatInputClaimable: true, sortOrder: 5, strategy: 'ltr' },
  ];
}

/** The worked example, so the app has something to show on first boot. */
function seedDemoProperty(): void {
  const existing = db.select().from(properties).where(eq(properties.id, 'demo-property')).get();
  if (existing) return;

  db.insert(properties)
    .values({
      id: 'demo-property',
      status: 'review',
      name: 'DEMO: Two-bedroom, Die Boord',
      streetAddress: '1 Example Street',
      suburb: 'Die Boord',
      schemeName: 'Example Scheme',
      unitNumber: '12',
      assetType: 'apt_2bed',
      bedrooms: 2,
      bathrooms: 1,
      floorAreaM2: 68,
      parkingBays: 1,
      purchasePrice: R(3_500_000),
      dateAdded: TODAY,
      strPermitted: 'unknown',
      strRestrictionNotes: 'Demo data. The conduct rules have not been checked, which is why this verdict cannot pass.',
      isDemo: true,
      notes: 'Seeded demo property. Delete it in one click from the property list once you have entered a real deal.',
    })
    .run();

  const scenarioId = 'demo-scenario';
  db.insert(scenarios).values({ id: scenarioId, propertyId: 'demo-property', name: 'Base', isPrimary: true }).run();

  db.insert(scenarioFinance)
    .values({
      scenarioId,
      depositPct: 0.1,
      bondTermMonths: 240,
      rateBasis: 'prime_linked',
      rateMargin: -0.01,
      transferDutyApplies: true,
      vatInclusivePurchase: false,
      furnishingCost: R(150_000),
      otherSetupCosts: R(15_000),
      projectionMonths: 240,
      surplusReinvestmentRate: 0.1,
    })
    .run();

  db.insert(ratePath).values({ id: newId('rate'), scenarioId, fromMonth: 0, primeRate: 0.105 }).run();

  db.insert(scenarioRevenue)
    .values({
      scenarioId,
      strategy: 'str',
      revenueMode: 'annual_gross',
      annualGross: R(405_300),
      turnoverMode: 'occupancy_los',
      ltrMonthlyRent: R(14_000),
      ltrLeaseMonths: 11,
      ltrVacantMonths: '[12]',
      evidenced: false,
      evidenceNote: 'Demo figure taken from the two-bedroom benchmark. Not a manager quote for this unit.',
    })
    .run();

  for (let month = 1; month <= 12; month += 1) {
    db.insert(seasonality)
      .values({
        id: newId('seas'),
        scenarioId,
        monthOfYear: month,
        strategy: 'str',
        seasonIndex: APARTMENT_SEASONALITY[month - 1] as number,
        occupancy: 0.65,
        avgLos: 3,
      })
      .run();
  }

  for (const line of defaultCostLines(scenarioId, 'apt_2bed')) {
    db.insert(costLines).values(line).run();
  }

  db.insert(growthAssumptions)
    .values({ scenarioId, capitalGrowthPct: 0.06, revenueEscalationPct: 0.04, evidenced: false })
    .run();

  db.insert(refinancePolicy)
    .values({ scenarioId, enabled: false, targetLtv: 0.8, minMonthsBetween: 24, minRelease: R(300_000), recostPct: 0.015 })
    .run();
}

export async function seed(): Promise<void> {
  runMigrations();
  seedAssumptions();
  seedFeeScales();
  seedTemplatesAndBenchmarks();
  seedGroupSettings();
  await seedDirectors();
  seedDemoProperty();

  const unverified = db.select().from(assumptions).where(eq(assumptions.verified, false)).all().length;
  console.log(`Seed complete. ${unverified} assumptions are unverified and need a director to check them.`);
}

if (isMainModule(import.meta.url)) {
  await seed();
}
