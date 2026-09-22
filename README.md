# Five Peaks Property Model

Investment model for Five Peaks Properties (Pty) Ltd — a South African property
company buying sectional title stock in Stellenbosch and operating it as
short-term rental through appointed managers.

The app has two jobs.

**Properties under review — should we buy this?** The decisive output is not the
internal rate of return. It is the **breakeven capital growth rate**: the annual
growth a specific unit must achieve, at this price, this interest rate and this
shortfall path, to match an exchange traded fund receiving the same money on the
same dates. Below the band Stellenbosch has plausibly delivered, the deal is
defensible. Above it, the deal is a bet, and the app says so.

**Portfolio — are we managing what we own?** Actuals against projections, bond
and loan-to-value tracking, refinance capacity, levy and maintenance history,
group exposure, and how much room the five directors have left before the next
purchase.

## The app is built to argue with its users

- The verdict states the breakeven growth rate first and shows a deal failing
  when it fails. A marginal deal is never rounded up into a pass.
- **"Never breaks even" is an explicit outcome.** At the revenue escalation the
  managers' own records have delivered recently, the shortfall on a small
  apartment does not close. It widens.
- Inputs are marked **evidenced** or **assumed**, and the verdict page reports
  what proportion of its inputs are which. A verdict resting on a guessed
  nightly rate does not present like one resting on twelve months of manager
  data.
- The short-term letting gate is hard. A property whose conduct rules have not
  been checked cannot pass, whatever the numbers say.
- Every rate, fee, tax bracket and market assumption is seeded **unverified** and
  lives in an editable register. Nothing is hardcoded in calculation code.

## Running it

```bash
npm install
npm run db:seed -w @fp/server
npm run build
npm start
```

The seed prints a password for each of the five director accounts, once. Reset
one later with:

```bash
npm run reset-password -w @fp/server -- someone@example.com
```

For development, run the API and the Vite dev server separately:

```bash
npm run dev
```

```bash
npm run dev:web
```

## Tests

```bash
npm test
```

The engine's test suite is the deliverable as much as the app is. It covers the
amortisation against the closed-form annuity formula, the relationship between
length of stay and cleaning cost, seasonality alignment for a property that
transfers mid-year, every solver converging and reproducing its own answer, the
ETF leg receiving every shortfall contribution, the assessed loss never going
negative, the VAT threshold tripping on rolling group turnover, no floating
point drift across a 240-month run, and a golden fixture whose complete output is
committed so any change to the engine is a reviewable diff.

## Structure

```
/packages/engine   pure TypeScript projection engine: zero dependencies, zero I/O
/packages/shared   types and Zod schemas shared by client and server
/apps/server       Fastify, Drizzle, SQLite, auth, the API
/apps/web          React, Vite, Tailwind, Recharts
```

The engine stays pure — arguments in, results out, no database, no `Date.now()`,
no randomness. That is what makes it testable, and this model is worth nothing if
it is not trustworthy.

## Conventions

- **Money is stored as integer cents,** everywhere, and formatted only at the
  edge. No floating point for money in storage or in accumulation.
- **Rates are decimals:** 0.0925, not 9.25.
- Projection periods are month indices from month 0, the transfer month. The
  calendar month is derived from the transfer date, so seasonality lines up with
  a purchase that transfers in August.
- Nothing is written outside `DATA_DIR`. No `localStorage` or `IndexedDB` for
  shared state — five people need to see the same numbers.
- Comparables and benchmarks carry the year they were observed, and are restated
  to current rands before being compared.

## Deployment

One Railway service, one volume mounted at `/data`, `DATA_DIR=/data`, one
`Dockerfile`. Migrations run automatically on boot, and a nightly job copies the
database to `/data/backups/` with a timestamp, keeping the last thirty.

## Branches

- `master` — released work
- `develop` — integration branch

## Before anyone relies on this

Three things should be settled outside the app, with an accountant:

1. The current transfer duty brackets and attorney fee scales.
2. The VAT position on short-term accommodation, and on buying fixed property
   from a non-vendor.
3. The assessed-loss and dividends-tax treatment for a five-director property
   company.

There is also one known gap in the evidence: there is no apartment cleaning data
in the managers' workbook. Houses ran at 3 to 7 percent of gross; at a studio's
revenue level cleaning is likely to run near 20 percent. Get the turnover counts
from the managers.

This project is not financial, tax or legal advice.
