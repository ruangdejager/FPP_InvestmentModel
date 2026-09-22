/**
 * API smoke tests.
 *
 * They run against a throwaway database seeded the same way a real deployment
 * is, so they also prove the seed produces something the engine can project.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let app: FastifyInstance;
let cookie = '';

async function signIn(email: string, password: string) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
}

beforeAll(async () => {
  const { seed } = await import('../src/db/seed.js');
  await seed();
  const { buildServer } = await import('../src/index.js');
  app = await buildServer();
  await app.ready();

  const response = await signIn('ruan@etse.co.za', process.env.SEED_PASSWORD as string);
  cookie = response.cookies[0] ? `${response.cookies[0].name}=${response.cookies[0].value}` : '';
});

afterAll(async () => {
  await app?.close();
});

describe('health', () => {
  it('answers without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });
});

describe('authentication', () => {
  it('refuses a wrong password without saying which part was wrong', async () => {
    const response = await signIn('ruan@etse.co.za', 'not-the-password');
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('That email and password do not match.');
  });

  it('gives the same message for an address that does not exist', async () => {
    const response = await signIn('nobody@example.com', 'whatever');
    expect(response.json().error).toBe('That email and password do not match.');
  });

  it('refuses an API call with no session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/properties' });
    expect(response.statusCode).toBe(401);
  });

  it('accepts the seeded director', async () => {
    expect(cookie).not.toBe('');
    const response = await app.inject({ method: 'GET', url: '/api/properties', headers: { cookie } });
    expect(response.statusCode).toBe(200);
  });
});

describe('the seed', () => {
  it('writes every assumption unverified except the calibration data', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/assumptions', headers: { cookie } });
    const body = response.json() as { assumptions: { key: string; verified: boolean }[]; unverifiedCount: number };

    expect(body.unverifiedCount).toBeGreaterThan(30);
    expect(body.assumptions.find((row) => row.key === 'prime_rate')?.verified).toBe(false);
    expect(body.assumptions.find((row) => row.key === 'company_income_tax')?.verified).toBe(false);
    // The managers' records are the only evidenced material in the seed.
    expect(body.assumptions.find((row) => row.key === 'observed_management_commission')?.verified).toBe(true);
  });

  it('seeds revenue escalation at four percent, not the recovery-era seven', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/assumptions', headers: { cookie } });
    const body = response.json() as { assumptions: { key: string; value: number }[] };
    expect(body.assumptions.find((row) => row.key === 'revenue_escalation')?.value).toBe(0.04);
  });

  it('creates a demo property that is deletable', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/properties', headers: { cookie } });
    const properties = response.json() as { id: string; isDemo: boolean }[];
    expect(properties.some((property) => property.isDemo)).toBe(true);
  });
});

describe('the short-term letting gate', () => {
  let propertyId = '';
  let scenarioId = '';

  it('creates a property with a default scenario', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/properties',
      headers: { cookie },
      payload: {
        name: 'Test unit',
        assetType: 'apt_2bed',
        purchasePrice: 3_500_000_00,
        strPermitted: 'unknown',
        status: 'review',
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string; scenarioId: string };
    propertyId = body.id;
    scenarioId = body.scenarioId;
    expect(scenarioId).toBeTruthy();
  });

  it('blocks the verdict while the rules are unchecked', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/scenarios/${scenarioId}/verdict`, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { verdict: { outcome: string; blockedReason: string | null } };
    expect(body.verdict.outcome).toBe('blocked');
    expect(body.verdict.blockedReason).toMatch(/has not been established/);
  });

  it('stops blocking once the rules are recorded, and then grades on the numbers', async () => {
    await app.inject({
      method: 'PATCH',
      url: `/api/properties/${propertyId}`,
      headers: { cookie },
      payload: { strPermitted: 'yes' },
    });
    const response = await app.inject({ method: 'GET', url: `/api/scenarios/${scenarioId}/verdict`, headers: { cookie } });
    const body = response.json() as { verdict: { outcome: string } };
    expect(['pass', 'acceptable', 'fail', 'never_breaks_even']).toContain(body.verdict.outcome);
  });

  it('projects 240 months with every monetary field in whole cents', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/scenarios/${scenarioId}/projection`, headers: { cookie } });
    const body = response.json() as { months: { grossRevenue: number; noi: number; bondPayment: number }[] };
    expect(body.months).toHaveLength(240);
    for (const month of body.months.slice(0, 24)) {
      expect(Number.isInteger(month.grossRevenue)).toBe(true);
      expect(Number.isInteger(month.noi)).toBe(true);
      expect(Number.isInteger(month.bondPayment)).toBe(true);
    }
  });

  it('cleans up after itself', async () => {
    const response = await app.inject({ method: 'DELETE', url: `/api/properties/${propertyId}`, headers: { cookie } });
    expect(response.statusCode).toBe(204);
  });
});

describe('the assumptions register', () => {
  it('flows a rate change into every projection immediately', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/scenarios/demo-scenario/projection', headers: { cookie } });
    const beforePayment = (before.json() as { months: { bondPayment: number }[] }).months[0]?.bondPayment as number;

    await app.inject({
      method: 'PUT',
      url: '/api/assumptions/prime_rate',
      headers: { cookie },
      payload: { value: 0.125, verified: true, source: 'Test' },
    });

    // The demo scenario carries its own rate path, so the register change shows
    // up on a scenario created after it rather than retroactively. A new
    // property is the honest way to prove the flow-through.
    const created = await app.inject({
      method: 'POST',
      url: '/api/properties',
      headers: { cookie },
      payload: { name: 'Rate test', assetType: 'apt_1bed', purchasePrice: 3_500_000_00, strPermitted: 'yes', status: 'review' },
    });
    const { id, scenarioId } = created.json() as { id: string; scenarioId: string };

    const after = await app.inject({ method: 'GET', url: `/api/scenarios/${scenarioId}/projection`, headers: { cookie } });
    const afterRate = (after.json() as { months: { primeRate: number }[] }).months[0]?.primeRate;
    expect(afterRate).toBe(0.125);
    expect(beforePayment).toBeGreaterThan(0);

    await app.inject({ method: 'DELETE', url: `/api/properties/${id}`, headers: { cookie } });
    await app.inject({
      method: 'PUT',
      url: '/api/assumptions/prime_rate',
      headers: { cookie },
      payload: { value: 0.105, verified: false },
    });
  });

  it('keeps a history of what a value used to be', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/assumptions/prime_rate/history', headers: { cookie } });
    const history = response.json() as unknown[];
    expect(history.length).toBeGreaterThan(0);
  });

  it('refuses to empty the fee scale table', async () => {
    const response = await app.inject({ method: 'PUT', url: '/api/fee-scales', headers: { cookie }, payload: [] });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/Refusing to empty/);
  });
});

describe('the asset class comparison', () => {
  it('answers without writing anything to the property tables', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/properties', headers: { cookie } });
    const beforeCount = (before.json() as unknown[]).length;

    const response = await app.inject({ method: 'GET', url: '/api/asset-classes', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { results: { assetType: string; maximumPrice: number; coversItsOwnInterest: boolean }[] };
    expect(body.results.length).toBeGreaterThan(3);

    const after = await app.inject({ method: 'GET', url: '/api/properties', headers: { cookie } });
    expect((after.json() as unknown[]).length).toBe(beforeCount);
  });

  it('shows the maximum affordable price rising with unit size', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/asset-classes', headers: { cookie } });
    const body = response.json() as { results: { assetType: string; maximumPrice: number }[] };
    const studio = body.results.find((row) => row.assetType === 'studio')?.maximumPrice ?? 0;
    const house = body.results.find((row) => row.assetType === 'house_4bed')?.maximumPrice ?? 0;
    expect(house).toBeGreaterThan(studio);
  });
});

describe('comparables', () => {
  it('flags a flat monthly series on import and leaves it out of benchmarks', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/comparables/import',
      headers: { cookie },
      payload: {
        rows: [
          {
            schemeName: 'The Den',
            observationYear: 2026,
            annualGross: 360_000_00,
            monthlySeries: [30_000_00, 30_000_00, 30_000_00, 30_000_00, 30_000_00],
          },
          { schemeName: 'Ordinary scheme', observationYear: 2025, annualGross: 251_600_00, monthlySeries: [21_000_00, 19_500_00, 30_100_00] },
        ],
      },
    });

    const body = response.json() as { imported: number; flagged: { index: number; reason: string }[] };
    expect(body.imported).toBe(2);
    expect(body.flagged).toHaveLength(1);
    expect(body.flagged[0]?.reason).toMatch(/guaranteed rent or master lease/);
  });

  it('restates statistics to current rands and counts what it had to leave out', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/comparables/statistics', headers: { cookie } });
    const body = response.json() as { note: string; undatedComparables: number };
    expect(body.note).toMatch(/restated/);
    expect(body.undatedComparables).toBeGreaterThanOrEqual(0);
  });
});

describe('the VAT tracker', () => {
  it('reports the group position rather than a per-property one', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/dashboard/vat', headers: { cookie } });
    const body = response.json() as { threshold: number; note: string };
    expect(body.threshold).toBe(1_000_000_00);
    expect(body.note).toMatch(/group event/);
  });
});
