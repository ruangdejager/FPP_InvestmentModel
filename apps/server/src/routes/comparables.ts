import { detectFlatMonthlySeries, restateToCurrentRands } from '@fp/engine';
import { comparableSchema } from '@fp/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { assumptions, comparables, propertyComparables } from '../db/schema.js';
import { newId } from '../lib/id.js';

/**
 * A forgiving CSV parser.
 *
 * Every provider's export differs, so the client maps columns on upload and
 * sends rows already keyed to our own field names. This only has to cope with
 * quoted fields and embedded commas.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const split = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i] as string;
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === ',' && !quoted) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const headers = split(lines[0] as string);
  const rows = lines.slice(1).map((line) => {
    const values = split(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });
  return { headers, rows };
}

/** Median of a numeric list, or null when there is nothing to take one of. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return Math.round((((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2));
}

export async function comparableRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/comparables', async (request) => {
    const query = z
      .object({ scheme: z.string().optional(), assetType: z.string().optional(), propertyId: z.string().optional() })
      .parse(request.query);

    let rows = db.select().from(comparables).all();
    if (query.scheme) rows = rows.filter((row) => row.schemeName?.toLowerCase().includes(query.scheme!.toLowerCase()));
    if (query.assetType) rows = rows.filter((row) => row.assetType === query.assetType);
    if (query.propertyId) {
      const links = db
        .select()
        .from(propertyComparables)
        .where(eq(propertyComparables.propertyId, query.propertyId))
        .all();
      const linked = new Set(links.map((link) => link.comparableId));
      rows = rows.filter((row) => linked.has(row.id));
    }
    return rows;
  });

  app.post('/api/comparables', async (request, reply) => {
    const parsed = comparableSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const id = newId('comp');
    const pricePerM2 =
      parsed.data.price && parsed.data.floorAreaM2 ? Math.round(parsed.data.price / parsed.data.floorAreaM2) : null;

    db.insert(comparables)
      .values({
        id,
        source: parsed.data.source,
        schemeName: parsed.data.schemeName ?? null,
        address: parsed.data.address ?? null,
        assetType: parsed.data.assetType ?? null,
        bedrooms: parsed.data.bedrooms ?? null,
        floorAreaM2: parsed.data.floorAreaM2 ?? null,
        transactionDate: parsed.data.transactionDate ?? null,
        price: parsed.data.price ?? null,
        pricePerM2,
        adr: parsed.data.adr ?? null,
        occupancy: parsed.data.occupancy ?? null,
        annualGross: parsed.data.annualGross ?? null,
        revenuePeriod: parsed.data.revenuePeriod ?? null,
        observationYear: parsed.data.observationYear ?? null,
        evidenceUrl: parsed.data.evidenceUrl ?? null,
        confidence: parsed.data.confidence,
        excludedFromBenchmarks: parsed.data.excludedFromBenchmarks,
        exclusionReason: parsed.data.exclusionReason ?? null,
        notes: parsed.data.notes ?? null,
      })
      .run();
    return reply.status(201).send(db.select().from(comparables).where(eq(comparables.id, id)).get());
  });

  app.patch('/api/comparables/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = comparableSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    db.update(comparables).set(parsed.data).where(eq(comparables.id, id)).run();
    return db.select().from(comparables).where(eq(comparables.id, id)).get();
  });

  app.delete('/api/comparables/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    db.delete(comparables).where(eq(comparables.id, id)).run();
    return reply.status(204).send();
  });

  /**
   * Bulk import.
   *
   * Rows arrive already mapped to our field names by the column mapper in the
   * browser. Any row whose monthly figures are identical month after month is
   * flagged as a likely guaranteed rent and excluded from benchmark derivation
   * until someone confirms otherwise.
   */
  app.post('/api/comparables/import', async (request, reply) => {
    const body = z
      .object({
        rows: z.array(comparableSchema.partial().extend({ monthlySeries: z.array(z.number()).optional() })),
      })
      .safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const imported: string[] = [];
    const flagged: { index: number; reason: string }[] = [];

    body.data.rows.forEach((row, index) => {
      const flatSeries = row.monthlySeries ? detectFlatMonthlySeries(row.monthlySeries) : null;
      const excluded = row.excludedFromBenchmarks || Boolean(flatSeries?.flagged);
      if (flatSeries?.flagged) flagged.push({ index, reason: flatSeries.reason as string });

      const id = newId('comp');
      db.insert(comparables)
        .values({
          id,
          source: row.source ?? 'manual',
          schemeName: row.schemeName ?? null,
          address: row.address ?? null,
          assetType: row.assetType ?? null,
          bedrooms: row.bedrooms ?? null,
          floorAreaM2: row.floorAreaM2 ?? null,
          transactionDate: row.transactionDate ?? null,
          price: row.price ?? null,
          pricePerM2: row.price && row.floorAreaM2 ? Math.round(row.price / row.floorAreaM2) : null,
          adr: row.adr ?? null,
          occupancy: row.occupancy ?? null,
          annualGross: row.annualGross ?? null,
          revenuePeriod: row.revenuePeriod ?? null,
          observationYear: row.observationYear ?? null,
          evidenceUrl: row.evidenceUrl ?? null,
          confidence: row.confidence ?? 'medium',
          excludedFromBenchmarks: excluded,
          exclusionReason: flatSeries?.reason ?? row.exclusionReason ?? null,
          notes: row.notes ?? null,
        })
        .run();
      imported.push(id);
    });

    return { imported: imported.length, flagged };
  });

  app.post('/api/properties/:propertyId/comparables/:comparableId', async (request, reply) => {
    const { propertyId, comparableId } = request.params as { propertyId: string; comparableId: string };
    db.insert(propertyComparables).values({ propertyId, comparableId }).onConflictDoNothing().run();
    return reply.status(204).send();
  });

  app.delete('/api/properties/:propertyId/comparables/:comparableId', async (request, reply) => {
    const { propertyId, comparableId } = request.params as { propertyId: string; comparableId: string };
    db.delete(propertyComparables)
      .where(and(eq(propertyComparables.propertyId, propertyId), eq(propertyComparables.comparableId, comparableId)))
      .run();
    return reply.status(204).send();
  });

  /**
   * Derived statistics.
   *
   * Every figure is restated to current rands before it is compared against
   * another, because a table that averages 2022 rands with 2025 rands is not
   * evidence. A comparable with no observation year is reported separately
   * rather than quietly included.
   */
  app.get('/api/comparables/statistics', async () => {
    const cpi = db.select().from(assumptions).where(eq(assumptions.key, 'cpi')).get()?.value ?? 0.045;
    const currentYear = new Date().getUTCFullYear();
    const rows = db.select().from(comparables).all();
    const usable = rows.filter((row) => !row.excludedFromBenchmarks);
    const undated = usable.filter((row) => !row.observationYear).length;

    const restate = (amount: number | null, year: number | null): number | null => {
      if (amount === null || year === null) return null;
      if (year > currentYear) return amount;
      return restateToCurrentRands(amount, year, currentYear, cpi);
    };

    const byScheme = new Map<string, number[]>();
    for (const row of usable) {
      if (!row.schemeName || !row.pricePerM2 || !row.observationYear) continue;
      const restated = restate(row.pricePerM2, row.observationYear) as number;
      const list = byScheme.get(row.schemeName) ?? [];
      list.push(restated);
      byScheme.set(row.schemeName, list);
    }

    const adrValues = usable
      .map((row) => restate(row.adr, row.observationYear))
      .filter((value): value is number => value !== null);
    const occupancyValues = usable
      .map((row) => row.occupancy)
      .filter((value): value is number => value !== null && value !== undefined);
    const grossValues = usable
      .map((row) => restate(row.annualGross, row.observationYear))
      .filter((value): value is number => value !== null);

    return {
      currentYear,
      cpi,
      undatedComparables: undated,
      medianPricePerM2ByScheme: [...byScheme.entries()].map(([scheme, values]) => ({
        scheme,
        medianPricePerM2: median(values),
        count: values.length,
      })),
      medianAdr: median(adrValues),
      medianOccupancy: occupancyValues.length > 0 ? median(occupancyValues.map((v) => Math.round(v * 10_000))) : null,
      medianAnnualGross: median(grossValues),
      note:
        'All money figures restated to ' +
        `${currentYear} rands at ${(cpi * 100).toFixed(1)} percent CPI. Comparables with no observation year are ` +
        'excluded from these medians and counted separately.',
    };
  });

  /**
   * Repeat sales: the same address transacting twice gives an implied annual
   * growth rate, which is the only growth evidence that comes from the market
   * rather than from an assumption.
   */
  app.get('/api/comparables/repeat-sales', async () => {
    const rows = db
      .select()
      .from(comparables)
      .all()
      .filter((row) => row.address && row.price && row.transactionDate);

    const byAddress = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = (row.address as string).trim().toLowerCase();
      byAddress.set(key, [...(byAddress.get(key) ?? []), row]);
    }

    const results = [];
    for (const [address, sales] of byAddress) {
      if (sales.length < 2) continue;
      const ordered = [...sales].sort((a, b) => (a.transactionDate as string).localeCompare(b.transactionDate as string));
      const first = ordered[0] as (typeof rows)[number];
      const last = ordered[ordered.length - 1] as (typeof rows)[number];
      const years =
        (new Date(last.transactionDate as string).getTime() - new Date(first.transactionDate as string).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000);
      if (years <= 0) continue;
      const growth = Math.pow((last.price as number) / (first.price as number), 1 / years) - 1;
      results.push({
        address,
        firstDate: first.transactionDate,
        firstPrice: first.price,
        lastDate: last.transactionDate,
        lastPrice: last.price,
        years: Number(years.toFixed(2)),
        impliedAnnualGrowth: growth,
      });
    }
    return results.sort((a, b) => b.impliedAnnualGrowth - a.impliedAnnualGrowth);
  });
}
