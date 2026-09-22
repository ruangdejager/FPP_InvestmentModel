# Five Peaks Property Model

Investment model for Five Peaks Properties (Pty) Ltd — a South African property
company buying sectional title stock in Stellenbosch and operating it as
short-term rental.

The app answers two questions:

1. **Properties under review** — should we buy this? The decisive output is the
   breakeven capital growth rate: the annual growth this unit must achieve to
   match an ETF receiving the same money on the same dates.
2. **Portfolio** — are we managing what we own? Actuals against projections,
   bond and LVR tracking, refinance capacity and group exposure.

## Status

Repository scaffold only. See [docs/build-spec.md](docs/build-spec.md) for the
full build specification.

## Planned structure

```
/packages/engine   pure TypeScript projection engine, zero dependencies, zero I/O
/packages/shared   types and Zod schemas shared by client and server
/apps/server       Fastify, Drizzle, routes, auth
/apps/web          React + Vite
```

## Ground rules

- Every rate, fee, tax bracket and market assumption lives in the editable
  assumptions register with a verification flag. Nothing is hardcoded in
  calculation code.
- All currency is stored as integer cents. No floating point for money.
- Rates and percentages are stored as decimals (0.0925, not 9.25).
- The engine package stays pure: arguments in, results out — no database
  access, no `Date.now()`, no randomness.
- The seeded assumption values are unverified placeholders, not researched
  figures.

## Branches

- `master` — released work
- `develop` — integration branch for ongoing development

## Disclaimer

This project is not financial, tax or legal advice.
