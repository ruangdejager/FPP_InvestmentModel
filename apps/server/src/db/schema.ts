/**
 * The database schema.
 *
 * All money is stored as integer cents. All rates and percentages are stored as
 * decimals (0.0925, not 9.25). Dates are ISO strings, because SQLite has no date
 * type and a string sorts correctly.
 *
 * Cost lines carry their value in one of two columns rather than one loosely
 * typed column, so a rate can never be mistaken for an amount of money.
 */
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const directors = sqliteTable('directors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  sharePct: real('share_pct').notNull().default(0.2),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(now),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    directorId: text('director_id')
      .notNull()
      .references(() => directors.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [index('sessions_director_idx').on(table.directorId)],
);

export const properties = sqliteTable(
  'properties',
  {
    id: text('id').primaryKey(),
    status: text('status', { enum: ['review', 'owned', 'rejected', 'sold'] })
      .notNull()
      .default('review'),
    name: text('name').notNull(),
    streetAddress: text('street_address'),
    suburb: text('suburb'),
    schemeName: text('scheme_name'),
    unitNumber: text('unit_number'),
    assetType: text('asset_type', {
      enum: ['studio', 'apt_1bed', 'apt_2bed', 'apt_3bed', 'house_3bed', 'house_4bed', 'house_5plus'],
    })
      .notNull()
      .default('apt_1bed'),
    bedrooms: integer('bedrooms'),
    bathrooms: real('bathrooms'),
    floorAreaM2: real('floor_area_m2'),
    parkingBays: integer('parking_bays'),
    /** Integer cents. */
    purchasePrice: integer('purchase_price').notNull(),
    listingUrl: text('listing_url'),
    agentContact: text('agent_contact'),
    dateAdded: text('date_added').notNull(),
    /** Null while the property is under review. */
    transferDate: text('transfer_date'),
    notes: text('notes'),

    // The hard gate. A property that is not a clear yes carries a loud warning
    // on every screen it appears on, and its verdict cannot pass.
    strPermitted: text('str_permitted', { enum: ['yes', 'no', 'unknown'] })
      .notNull()
      .default('unknown'),
    strRulesCheckedDate: text('str_rules_checked_date'),
    strRulesDocumentId: text('str_rules_document_id'),
    strRestrictionNotes: text('str_restriction_notes'),

    isDemo: integer('is_demo', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [index('properties_status_idx').on(table.status)],
);

export const scenarios = sqliteTable(
  'scenarios',
  {
    id: text('id').primaryKey(),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [index('scenarios_property_idx').on(table.propertyId)],
);

export const scenarioFinance = sqliteTable('scenario_finance', {
  scenarioId: text('scenario_id')
    .primaryKey()
    .references(() => scenarios.id, { onDelete: 'cascade' }),
  depositPct: real('deposit_pct').notNull(),
  bondTermMonths: integer('bond_term_months').notNull(),
  rateBasis: text('rate_basis', { enum: ['prime_linked', 'fixed'] })
    .notNull()
    .default('prime_linked'),
  /** Minus 0.01 for prime less one percent. */
  rateMargin: real('rate_margin').notNull().default(-0.01),
  fixedRate: real('fixed_rate'),
  transferDutyApplies: integer('transfer_duty_applies', { mode: 'boolean' }).notNull().default(true),
  vatInclusivePurchase: integer('vat_inclusive_purchase', { mode: 'boolean' }).notNull().default(false),
  furnishingCost: integer('furnishing_cost').notNull().default(0),
  otherSetupCosts: integer('other_setup_costs').notNull().default(0),
  projectionMonths: integer('projection_months').notNull().default(240),
  surplusReinvestmentRate: real('surplus_reinvestment_rate').notNull().default(0.1),
});

export const ratePath = sqliteTable(
  'rate_path',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    fromMonth: integer('from_month').notNull(),
    primeRate: real('prime_rate').notNull(),
  },
  (table) => [unique('rate_path_scenario_month').on(table.scenarioId, table.fromMonth)],
);

/**
 * Revenue for a scenario.
 *
 * The primary input is annual gross, spread across months by the seasonality
 * curve, because that is the figure the managers actually keep. ADR, occupancy
 * and length of stay are the optional decomposition, used to derive the turnover
 * count that drives cleaning.
 */
export const scenarioRevenue = sqliteTable('scenario_revenue', {
  scenarioId: text('scenario_id')
    .primaryKey()
    .references(() => scenarios.id, { onDelete: 'cascade' }),
  strategy: text('strategy', { enum: ['str', 'ltr'] })
    .notNull()
    .default('str'),
  revenueMode: text('revenue_mode', { enum: ['annual_gross', 'adr_occupancy'] })
    .notNull()
    .default('annual_gross'),
  /** Integer cents, before escalation. */
  annualGross: integer('annual_gross').notNull().default(0),
  turnoverMode: text('turnover_mode', { enum: ['explicit', 'adr_los', 'occupancy_los'] })
    .notNull()
    .default('occupancy_los'),
  ltrMonthlyRent: integer('ltr_monthly_rent').notNull().default(0),
  ltrLeaseMonths: integer('ltr_lease_months').notNull().default(11),
  /** JSON array of calendar months that are structurally vacant, e.g. [12]. */
  ltrVacantMonths: text('ltr_vacant_months').notNull().default('[12]'),
  /** Where these figures came from, and whether anyone has checked them. */
  evidenceNote: text('evidence_note'),
  evidenced: integer('evidenced', { mode: 'boolean' }).notNull().default(false),
});

export const seasonality = sqliteTable(
  'seasonality',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    monthOfYear: integer('month_of_year').notNull(),
    strategy: text('strategy', { enum: ['str', 'ltr'] })
      .notNull()
      .default('str'),
    /** Multiple of the average month. Normalised to a mean of one on use. */
    seasonIndex: real('season_index').notNull().default(1),
    /** Integer cents. Optional: only used by the ADR decomposition. */
    adr: integer('adr'),
    occupancy: real('occupancy'),
    avgLos: real('avg_los'),
    /** Turnovers entered directly, where the manager supplies the count. */
    turnovers: real('turnovers'),
  },
  (table) => [unique('seasonality_scenario_month').on(table.scenarioId, table.strategy, table.monthOfYear)],
);

export const costLines = sqliteTable(
  'cost_lines',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    category: text('category', {
      enum: [
        'platform_fee',
        'management',
        'cleaning',
        'levies',
        'municipal_rates',
        'utilities',
        'insurance',
        'maintenance',
        'admin',
        'other',
      ],
    }).notNull(),
    basis: text('basis', {
      enum: ['pct_of_gross', 'per_turnover', 'fixed_monthly', 'pct_of_revenue_reserve'],
    }).notNull(),
    /** Used by the percentage bases. Decimal, so 0.15 for fifteen percent. */
    rate: real('rate'),
    /** Used by the per-turnover and fixed-monthly bases. Integer cents. */
    amount: integer('amount'),
    escalationPct: real('escalation_pct').notNull().default(0),
    vatInputClaimable: integer('vat_input_claimable', { mode: 'boolean' }).notNull().default(false),
    evidenced: integer('evidenced', { mode: 'boolean' }).notNull().default(false),
    evidenceNote: text('evidence_note'),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Which letting strategy this line applies to. */
    strategy: text('strategy', { enum: ['str', 'ltr'] })
      .notNull()
      .default('str'),
  },
  (table) => [index('cost_lines_scenario_idx').on(table.scenarioId)],
);

export const oneOffCosts = sqliteTable(
  'one_off_costs',
  {
    id: text('id').primaryKey(),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    monthIndex: integer('month_index').notNull(),
    amount: integer('amount').notNull(),
    recurringEveryMonths: integer('recurring_every_months'),
    vatInputClaimable: integer('vat_input_claimable', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [index('one_off_costs_scenario_idx').on(table.scenarioId)],
);

export const growthAssumptions = sqliteTable('growth_assumptions', {
  scenarioId: text('scenario_id')
    .primaryKey()
    .references(() => scenarios.id, { onDelete: 'cascade' }),
  capitalGrowthPct: real('capital_growth_pct').notNull(),
  /** Optional JSON array of per-year rates; the last entry carries forward. */
  capitalGrowthPerYear: text('capital_growth_per_year'),
  revenueEscalationPct: real('revenue_escalation_pct').notNull(),
  evidenced: integer('evidenced', { mode: 'boolean' }).notNull().default(false),
  evidenceNote: text('evidence_note'),
});

export const refinancePolicy = sqliteTable('refinance_policy', {
  scenarioId: text('scenario_id')
    .primaryKey()
    .references(() => scenarios.id, { onDelete: 'cascade' }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  targetLtv: real('target_ltv').notNull().default(0.8),
  minMonthsBetween: integer('min_months_between').notNull().default(24),
  minRelease: integer('min_release').notNull().default(0),
  recostPct: real('recost_pct').notNull().default(0.015),
});

export const comparables = sqliteTable(
  'comparables',
  {
    id: text('id').primaryKey(),
    source: text('source', { enum: ['manual', 'deeds', 'lightstone', 'agent', 'listing', 'airbnb'] })
      .notNull()
      .default('manual'),
    schemeName: text('scheme_name'),
    address: text('address'),
    assetType: text('asset_type'),
    bedrooms: integer('bedrooms'),
    floorAreaM2: real('floor_area_m2'),
    transactionDate: text('transaction_date'),
    /** Integer cents. */
    price: integer('price'),
    pricePerM2: integer('price_per_m2'),
    adr: integer('adr'),
    occupancy: real('occupancy'),
    annualGross: integer('annual_gross'),
    revenuePeriod: text('revenue_period'),
    /**
     * The year the figure was observed. Required before a figure can be used as
     * a benchmark: a comps table that cannot say what year a figure is from is
     * not usable evidence.
     */
    observationYear: integer('observation_year'),
    evidenceUrl: text('evidence_url'),
    confidence: text('confidence', { enum: ['high', 'medium', 'low'] })
      .notNull()
      .default('medium'),
    excludedFromBenchmarks: integer('excluded_from_benchmarks', { mode: 'boolean' }).notNull().default(false),
    exclusionReason: text('exclusion_reason'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(now),
  },
  (table) => [index('comparables_scheme_idx').on(table.schemeName)],
);

export const propertyComparables = sqliteTable(
  'property_comparables',
  {
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    comparableId: text('comparable_id')
      .notNull()
      .references(() => comparables.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.propertyId, table.comparableId] })],
);

export const actuals = sqliteTable(
  'actuals',
  {
    id: text('id').primaryKey(),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    grossBookingRevenue: integer('gross_booking_revenue').notNull().default(0),
    nightsSold: real('nights_sold'),
    turnovers: real('turnovers'),
    platformFees: integer('platform_fees').notNull().default(0),
    managementFees: integer('management_fees').notNull().default(0),
    cleaning: integer('cleaning').notNull().default(0),
    levies: integer('levies').notNull().default(0),
    municipalRates: integer('municipal_rates').notNull().default(0),
    utilities: integer('utilities').notNull().default(0),
    maintenance: integer('maintenance').notNull().default(0),
    other: integer('other').notNull().default(0),
    bondPayment: integer('bond_payment').notNull().default(0),
    bondInterest: integer('bond_interest').notNull().default(0),
    bondBalance: integer('bond_balance'),
    notes: text('notes'),
  },
  (table) => [unique('actuals_property_period').on(table.propertyId, table.year, table.month)],
);

export const valuations = sqliteTable(
  'valuations',
  {
    id: text('id').primaryKey(),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    value: integer('value').notNull(),
    source: text('source'),
    notes: text('notes'),
  },
  (table) => [index('valuations_property_idx').on(table.propertyId)],
);

export const contributions = sqliteTable(
  'contributions',
  {
    id: text('id').primaryKey(),
    /** Null for a group-level contribution. */
    propertyId: text('property_id').references(() => properties.id, { onDelete: 'cascade' }),
    directorId: text('director_id')
      .notNull()
      .references(() => directors.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    amount: integer('amount').notNull(),
    type: text('type', { enum: ['deposit', 'shortfall', 'capex', 'distribution'] }).notNull(),
    notes: text('notes'),
  },
  (table) => [index('contributions_director_idx').on(table.directorId)],
);

/**
 * The global assumptions register.
 *
 * Nothing in this table may be duplicated as a constant in code. Everything
 * seeded here starts unverified, and the app nags until a director has checked
 * it against the real source.
 */
export const assumptions = sqliteTable('assumptions', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  /** Numeric value. Money is in cents; percentages are decimals. */
  value: real('value').notNull(),
  unit: text('unit', { enum: ['rate', 'cents', 'months', 'count', 'years'] }).notNull(),
  effectiveFrom: text('effective_from').notNull(),
  source: text('source'),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  verifiedDate: text('verified_date'),
  notes: text('notes'),
  updatedAt: text('updated_at').notNull().default(now),
});

export const assumptionHistory = sqliteTable(
  'assumption_history',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    value: real('value').notNull(),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    source: text('source'),
    note: text('note'),
    changedBy: text('changed_by'),
    changedAt: text('changed_at').notNull().default(now),
  },
  (table) => [index('assumption_history_key_idx').on(table.key)],
);

/**
 * Dated sliding scales: transfer duty, transfer attorney fees and bond
 * registration fees. Dated because they change most Februaries, and a deal
 * transferred last year must still reprice against the set in force then.
 */
export const feeScales = sqliteTable(
  'fee_scales',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['transfer_duty', 'transfer_attorney', 'bond_registration'] }).notNull(),
    effectiveFrom: text('effective_from').notNull(),
    lower: integer('lower').notNull(),
    upper: integer('upper'),
    baseAmount: integer('base_amount').notNull(),
    marginalRate: real('marginal_rate').notNull(),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    source: text('source'),
  },
  (table) => [index('fee_scales_kind_idx').on(table.kind, table.effectiveFrom)],
);

export const seasonalityTemplates = sqliteTable('seasonality_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['apartment', 'house'] }).notNull(),
  /** JSON array of twelve multipliers, January to December. */
  monthlyIndex: text('monthly_index').notNull(),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  source: text('source'),
  notes: text('notes'),
});

/**
 * Revenue benchmarks by asset type, each carrying the year it was observed so it
 * can be restated to current rands before it is used as a default.
 */
export const revenueBenchmarks = sqliteTable('revenue_benchmarks', {
  id: text('id').primaryKey(),
  assetType: text('asset_type').notNull(),
  label: text('label').notNull(),
  unitYears: integer('unit_years'),
  medianAnnualGross: integer('median_annual_gross').notNull(),
  lowAnnualGross: integer('low_annual_gross'),
  highAnnualGross: integer('high_annual_gross'),
  observationYear: integer('observation_year').notNull(),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  source: text('source'),
  notes: text('notes'),
});

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    ownerType: text('owner_type', { enum: ['property', 'comparable'] }).notNull(),
    ownerId: text('owner_id').notNull(),
    kind: text('kind'),
    originalFilename: text('original_filename').notNull(),
    storedFilename: text('stored_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    uploadedBy: text('uploaded_by'),
    uploadedAt: text('uploaded_at').notNull().default(now),
  },
  (table) => [index('documents_owner_idx').on(table.ownerType, table.ownerId)],
);

/** Group-level settings. One row, id 'group'. */
export const groupSettings = sqliteTable('group_settings', {
  id: text('id').primaryKey().default('group'),
  vatRegistered: integer('vat_registered', { mode: 'boolean' }).notNull().default(false),
  vatRegisteredFromDate: text('vat_registered_from_date'),
  vatPricingMode: text('vat_pricing_mode', { enum: ['absorbed', 'added'] })
    .notNull()
    .default('absorbed'),
  /** What the five directors can carry between them each month, in cents. */
  monthlyCapacity: integer('monthly_capacity').notNull().default(0),
  growthBandLow: real('growth_band_low').notNull().default(0.05),
  growthBandHigh: real('growth_band_high').notNull().default(0.08),
  growthBandSource: text('growth_band_source'),
  updatedAt: text('updated_at').notNull().default(now),
});

export const maintenanceLog = sqliteTable(
  'maintenance_log',
  {
    id: text('id').primaryKey(),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    description: text('description').notNull(),
    amount: integer('amount').notNull().default(0),
    category: text('category'),
    isSpecialLevy: integer('is_special_levy', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
  },
  (table) => [index('maintenance_property_idx').on(table.propertyId)],
);
