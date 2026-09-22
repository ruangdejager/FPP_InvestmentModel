# Five Peaks Property Model — Claude Code Build Prompt

2026-09-22 · @Ruan Gert de Jager

## How to use this

Everything below is written to be handed to Claude Code as-is, in a fresh empty repository. It is a build specification, not a conversation summary.

One instruction sits above all the others: **every rate, fee, tax bracket and market assumption in this document is an unverified placeholder.** Nothing here has been checked against current SARS tables, the current prime rate, or real Stellenbosch market data. All of it must live in editable seed data carrying a verification flag, never hardcoded inside calculation code. The app's job is to let the directors correct these numbers, not to enshrine them.

## Glossary

Use these exact terms in variable names, database columns and UI labels. Where the app shows an acronym to the user, it must also show the expansion in a tooltip.

### Short-term letting

**ADR — Average Daily Rate.** The average price charged per night actually sold, before platform fees and before cleaning. If a unit sells 20 nights in a month for R26,000 total, ADR is R1,300. It excludes nights nobody booked.

**Occupancy.** Nights sold divided by nights available in the period. 65% occupancy in a 30-day month is 19.5 nights sold.

**LOS — Length of Stay.** The average number of consecutive nights a guest books. It matters because it drives the number of cleans. 19.5 nights sold at an average LOS of 3 is 6.5 guest departures and therefore 6.5 cleaning fees; the same 19.5 nights at LOS 5 is 3.9 cleans. At R650 a clean that difference is roughly R1,700 a month on identical revenue.

**Turnovers.** Nights sold ÷ LOS. The count of cleans to pay for in the month.

**RevPAR — Revenue Per Available Night.** ADR × occupancy. The single number that makes two units comparable regardless of how they split price and volume. Useful in the comparables table.

**STR — Short-Term Rental.** Nightly letting via Airbnb and similar platforms. Five Peaks' primary strategy.

**LTR — Long-Term Rental.** A conventional lease, in Stellenbosch usually an 11-month student lease with parental surety. Modelled only as a comparison case and as the fallback if a body corporate bans short-term letting.

**Platform fee.** Airbnb's host service fee, deducted from gross booking value before payout. Placeholder 3%, must be a parameter, and a property may use several platforms at different rates.

**Seasonality profile.** A 12-month array of ADR, occupancy and LOS for one property. Stellenbosch is strongly seasonal — December and January, graduation and harvest weeks carry the year, winter is soft. An annual average will flatter cashflow and hide the worst month, which is the month that actually determines how much cash the directors need available. The engine must never accept a single annual occupancy figure as the only input.

### Property and finance

**Purchase price.** The agreed price of the unit, excluding transfer costs.

**Deposit.** Cash paid toward the purchase price. Target 10%.

**LTV — Loan to Value.** Bond amount ÷ property value. A 90% LTV purchase means a bond of 90% of price. As the bond amortises and the property grows, LTV falls, which is what eventually creates room to refinance.

**Bond.** The South African term for a mortgage loan secured over the property.

**Amortisation.** The schedule by which a fixed monthly payment repays both interest and capital over the loan term, so the balance reaches zero at the end. Early payments are mostly interest; late payments are mostly capital.

**Prime.** The South African benchmark lending rate. Five Peaks borrows at **prime less 1%**. Prime is a parameter, and the app must support a forward rate path (a schedule of rate changes over time), not one fixed rate forever.

**Transfer duty.** A tax paid to SARS by the buyer on second-hand property, on a sliding bracket scale. Not payable when buying new stock from a VAT-registered developer, where the price is VAT-inclusive instead. Five Peaks buys second-hand, so transfer duty applies, but the toggle must exist.

**Bond registration and initiation costs.** Attorney and bank fees to register the bond, separate from transfer attorney fees.

**Sectional title.** Ownership of a unit within a scheme, plus an undivided share of common property. All Five Peaks stock is sectional title.

**Body corporate.** The legal entity of all owners in a sectional title scheme. It sets conduct rules, which may restrict or ban short-term letting, and it can change those rules by special resolution after purchase. This is a material risk to the business model and the app must treat it as a hard gate.

**Levies.** The monthly charge from the body corporate for common-property maintenance, insurance and management. A **special levy** is a one-off additional charge for unbudgeted work — roof, lifts, paint — and can be five figures with little notice.

**NOI — Net Operating Income.** Rental revenue less all operating costs, but **before** the bond payment and before tax. The measure of what the property earns as an asset, independent of how it was financed.

**Shortfall.** NOI less the bond payment, when negative. The cash the directors must contribute each month. Five Peaks' tolerance: R2,000 per director per property is the target, R3,000 acceptable, R4,000 the ceiling.

**Peak cumulative outflow.** The largest total amount of cash sunk into a property before it turns cash-positive, and the month it occurs. This is the real affordability number. The monthly shortfall is what people anchor on; this is what they actually commit to.

**Breakeven month.** The month NOI first exceeds the bond payment and the shortfall reaches zero.

**DSCR — Debt Service Coverage Ratio.** NOI ÷ bond payment. Below 1.0 the property does not pay for itself. Banks care about it; it is a useful single indicator of how far from self-funding a deal is.

**IRR — Internal Rate of Return.** The annualised return implied by a series of cash flows with different signs and dates. Here: the rate that makes the initial cash, the monthly shortfalls and the terminal net equity sum to zero.

**Hurdle rate.** The return the alternative investment is assumed to make — the ETF comparison, default 10% per year. Configurable, and always run at 8% and 12% as well.

**ETF — Exchange Traded Fund.** The counterfactual: what the same money would have done in a passive index fund instead of a property.

**DCA — Dollar Cost Averaging.** Investing a fixed amount at regular intervals rather than a lump sum. The ETF comparison must use this, because the money going into the property arrives monthly, not all on day one.

**Refinance / re-advance.** Borrowing again against a property whose value has grown, to release cash for the next deposit. It resets the loan balance upward, increases the monthly payment, pushes breakeven further out, and costs re-registration fees. Five Peaks holds and refinances indefinitely rather than selling.

**Terminal value.** The property's worth at the end of the projection. Because Five Peaks never sells, the app must still mark to market at each horizon and deduct what a sale would cost — bond settlement, agent commission, capital gains tax — otherwise the property is compared against the ETF with its exit costs quietly excluded.

### Tax

**CGT — Capital Gains Tax.** Tax on the growth in an asset's value when sold. In a company: 80% of the gain is included in taxable income, taxed at the company rate, so roughly 21.6% effective at a 27% company rate. All figures are parameters.

**Assessed loss.** A tax loss carried forward to offset future taxable profit. Relevant because shortfall-making properties generate losses for years. South African companies face a limit on how much of a year's taxable income an assessed loss may offset — the placeholder is 80%. Verify with the accountant.

**Dividends tax.** Withheld when the company distributes profit to the directors. Placeholder 20%. Relevant because the honest comparison is cash in each director's hand, not cash in the company.

**VAT — Value Added Tax.** Placeholder 15%. Short-term accommodation is a taxable supply. Once the company's turnover crosses the compulsory registration threshold (placeholder R1m in any 12 months) it must register, charge VAT on nightly rates, and may claim input VAT on manager fees, cleaning, levies, utilities and furnishings. At roughly R300k gross per unit this arrives around the third or fourth property. It is a company-level event, not a per-property one, and the engine must model it as a switch that trips on rolling group turnover.

## The business and what the app is for

Five Peaks Properties (Pty) Ltd is a South African property company with five directors holding equal shares. It buys second-hand sectional title apartments in Stellenbosch and operates them as short-term rentals through Airbnb, using appointed rental managers.

**The strategy.** Buy with maximum leverage — 90% bond, 10% deposit — and accept a monthly shortfall from day one. Rental revenue escalates each year while the bond payment stays fixed in nominal terms, so the shortfall closes over time. The return comes from capital growth on the full property value while the directors only funded a fraction of it. Properties are never sold; growth is extracted by refinancing to fund the next deposit.

**Target stock.** R2.5m–R4.5m for studios and one-bedroom units, R4m–R6m for two-bedroom units.

**Operating arrangement.** Managers take 15% of gross booking value. Cleaning is R650 per guest departure, absorbed by the company rather than charged to the guest. The company pays levies, municipal rates, water, electricity, Wi-Fi, insurance and maintenance. Furnishing is budgeted at R100,000 for a one-bedroom and R150,000 for a two-bedroom.

**Affordability rule.** Monthly shortfall per director per property: R2,000 target, R3,000 acceptable, R4,000 absolute ceiling. Shortfalls are split equally five ways.

**Financing.** Prime less 1%. Not currently VAT registered.

### What the app must answer

The app has two jobs, and they are different.

**Properties under review — should we buy this?** Given a real listing, does the deal clear the affordability rule, and does it beat putting the same money into an ETF? The decisive output is not the IRR. It is the **breakeven capital growth rate**: the annual growth this specific unit must achieve, at this price and this rate and this shortfall path, to match the ETF. If that number comes out below what Stellenbosch has plausibly delivered, the deal is defensible. If it comes out above, it is a bet, and the app should say so plainly.

**Portfolio — are we managing what we own?** Actuals against projections, bond and LVR tracking, refinance capacity, levy and maintenance history, aggregate group exposure, and how much room the five directors have left before the next purchase.

### Build the app to argue with its users

This matters more than any feature. The directors have a thesis and they want the model to support it. A model that is tuned to agree is worse than no model.

So: the verdict screen must state the breakeven growth rate prominently, must show the deal failing when it fails, must never round a marginal deal up into a pass, and must distinguish visually between **inputs backed by evidence** (a manager's actual figures, a real levy statement, a deeds record) and **inputs that are guesses**. A verdict built on guessed ADR should be labelled as such and should not look as confident as one built on twelve months of real data.

## Stack and deployment

**Frontend.** React 18 + TypeScript + Vite. Tailwind for styling. Recharts for charts. TanStack Query for server state, TanStack Table for the dense financial grids. Responsive down to a 375px viewport — the directors will open this on phones in the browser. This is a web app, not React Native.

**Backend.** Node + Fastify + TypeScript, serving the API and the built frontend from one process on one port.

**Database.** SQLite via better-sqlite3, with Drizzle ORM and Drizzle Kit migrations. The database file path comes from `DATA_DIR` (default `./data` locally, the Railway volume mount path in production). Never write to the filesystem outside `DATA_DIR`. Do not use localStorage or IndexedDB for anything that matters — five people need to see the same numbers.

**Auth.** Email plus password, five seeded director accounts, sessions in an HTTP-only cookie, passwords hashed with argon2. This will sit on the public internet. No password reset flow needed initially; an admin script to reset one is enough.

**Deployment.** One Railway service, one attached volume mounted at `/data`, `DATA_DIR=/data`. A single `Dockerfile`. Migrations run automatically on boot. Include a nightly job that copies the SQLite file to `/data/backups/` with a timestamp and keeps the last 30.

**Money handling.** Store all currency as **integer cents**. Never use floating point for money in storage or in accumulation. Format for display only at the edge. Percentages and rates are stored as decimals (0.0925, not 9.25).

**Dates.** All projection periods are month indices from month 0 (transfer date). Store the real transfer date on the property and derive calendar months from it, so seasonality lines up correctly with a purchase that transfers in, say, August.

### Project structure

```
/packages/engine        pure TypeScript, zero dependencies, zero I/O
/packages/shared        types and Zod schemas shared by client and server
/apps/server            Fastify, Drizzle, routes, auth
/apps/web               React + Vite
```

The engine package is the heart of this and must stay pure: functions in, results out, no database access, no dates from `Date.now()`, no randomness. Everything it needs arrives as arguments. That is what makes it testable, and this model is worth nothing if it is not trustworthy.

## Data model

All money in integer cents. All rates as decimals.

**directors** — id, name, email, password\_hash, share\_pct (default 0.2), active.

**properties** — id, status (`review` | `owned` | `rejected` | `sold`), name, street address, suburb, scheme name, unit number, bedrooms, bathrooms, floor area m², parking bays, purchase price, listing url, agent contact, date added, transfer date (null while under review), notes.

Plus the hard-gate fields, which are the ones that kill deals: `str_permitted` (`yes` | `no` | `unknown`), `str_rules_checked_date`, `str_rules_document` (uploaded file reference), `str_restriction_notes`. A property with `str_permitted` of `no` or `unknown` must carry a loud unresolved warning on every screen it appears on, and the verdict page must refuse to show a pass until it is resolved.

**scenarios** — id, property\_id, name (`Base`, `Bear`, `Bull`, or free text), is\_primary, created\_at. Every property under review has at least one scenario; the verdict page compares them. All assumption values below hang off a scenario, not the property, so alternatives can be modelled without destroying the original.

**scenario\_finance** — scenario\_id, deposit\_pct, bond\_term\_months, rate\_basis (`prime_linked` | `fixed`), rate\_margin (−0.01 for prime less 1), transfer\_duty\_applies, vat\_inclusive\_purchase, furnishing\_cost, other\_setup\_costs, projection\_months (default 240).

**rate\_path** — scenario\_id, from\_month, prime\_rate. A list of changes, so a rate shock can be modelled from month 18 onward. The engine reads the applicable rate for each month from this table.

**seasonality** — scenario\_id, month\_of\_year (1–12), strategy (`str` | `ltr`), adr, occupancy, avg\_los. Twelve rows per strategy per scenario. The UI must make bulk-filling these easy — paste a row of twelve, or apply a saved Stellenbosch seasonality curve template.

**cost\_lines** — scenario\_id, label, category (`platform_fee` | `management` | `cleaning` | `levies` | `municipal_rates` | `utilities` | `insurance` | `maintenance` | `admin` | `other`), basis (`pct_of_gross` | `per_turnover` | `fixed_monthly` | `pct_of_revenue_reserve`), value, escalation\_pct, vat\_input\_claimable. Costs are rows, not hardcoded fields — levies and maintenance escalate at different rates and the directors will want to add lines the spec never anticipated.

**one\_off\_costs** — scenario\_id, month\_index, label, amount, recurring\_every\_months (nullable). Covers special levies, furniture replacement cycles, a new geyser.

**growth\_assumptions** — scenario\_id, capital\_growth\_pct, revenue\_escalation\_pct, and per-cost escalation coming from the cost lines. Capital growth may be a flat rate or a per-year array; support both.

**refinance\_policy** — scenario\_id, enabled, target\_ltv, min\_months\_between, min\_release\_amount, recost\_pct (the re-registration cost as a percentage of the new bond).

**comparables** — id, source (`manual` | `deeds` | `lightstone` | `agent` | `listing` | `airbnb`), scheme name, address, bedrooms, floor area, transaction date, price, price per m², and for rental comps adr, occupancy, revenue period. Plus `evidence_url`, `confidence` (`high` | `medium` | `low`) and free notes. CSV import required — the directors will buy reports per deal and paste the results in. Link comps to properties many-to-many so a verdict can cite what it was based on.

**actuals** — property\_id, year, month, and the real numbers: gross booking revenue, nights sold, turnovers, platform fees, management fees, cleaning, levies, rates, utilities, maintenance, other, bond payment, bond interest, bond balance. This is what makes the portfolio section worth having. Entry must be quick, and support CSV import from a manager statement.

**valuations** — property\_id, date, value, source, notes. Drives current LVR and refinance capacity.

**contributions** — property\_id (nullable for group-level), director\_id, date, amount, type (`deposit` | `shortfall` | `capex` | `distribution`). The capital account ledger.

**assumptions** — the global register: key, label, value, unit, effective\_from, source, verified (boolean), verified\_date, notes. Tax rates, VAT threshold, transfer duty brackets, default hurdle rate, agent commission all live here. **Nothing in this table may be duplicated as a constant in code.**

**transfer\_duty\_brackets** — effective\_from, lower, upper, base\_amount, marginal\_rate. A separate table because the brackets change every February and old deals must still reprice correctly against the bracket set in force at their transfer date.

**documents** — polymorphic attachments (property or comp), stored under `DATA_DIR/uploads`, with original filename, mime type, size, uploaded\_by, uploaded\_at. Needed for conduct rules, levy statements, offers to purchase and manager reports.

## The calculation engine

A single pure function: scenario inputs in, a full month-by-month projection out. Default horizon 240 months. Every intermediate value must be retained per month — the UI needs to show the working, and a black box will not be trusted.

### Month 0 — cash at transfer

- Deposit = purchase price × deposit\_pct
- Bond amount = purchase price − deposit
- Transfer duty: look up the bracket set in force at the transfer date; zero if `vat_inclusive_purchase` is true
- Transfer attorney and deeds office fees: from a fee scale in the assumptions register, by price band
- Bond registration and initiation fees: same, by bond amount band
- Furnishing and setup costs
- **Initial cash in** is the sum. Per director = ÷ 5.

Surface initial cash as a percentage of purchase price on screen. At 10% deposit the true figure lands somewhere near a quarter of the price once duty, fees and furnishing are counted, and that gap between "10% deposit" and what actually leaves the bank account is the single most commonly underestimated number in this business.

### Each month thereafter

Compute in this order. The order matters for VAT and tax.

**1 — Interest rate.** Read the applicable prime from `rate_path` for this month; effective rate = prime + margin.

**2 — Bond payment.** Standard amortisation on the balance over the remaining term. Recompute the payment only when the rate changes or a refinance occurs; otherwise it is fixed. Interest = balance × rate ÷ 12. Capital = payment − interest. Balance reduces by capital.

**3 — Revenue.** For calendar month *m*, escalated by revenue\_escalation compounded annually from transfer:

- nights available = days in month
- nights sold = nights available × occupancy\[m\]
- gross booking value = nights sold × adr\[m\] × escalation factor
- turnovers = nights sold ÷ avg\_los\[m\]

For a long-term scenario, revenue is monthly rent × escalation, with vacant months set by the lease structure — an 11-month student lease means one structurally vacant month every year, and that must be modelled, not averaged away.

**4 — Operating costs.** Evaluate each cost line by its basis:

- `pct_of_gross` → gross booking value × value (platform fee 3%, management 15%)
- `per_turnover` → turnovers × value (cleaning R650)
- `fixed_monthly` → value × its own escalation factor (levies, rates, utilities, insurance, admin)
- `pct_of_revenue_reserve` → gross × value (maintenance reserve)

Plus any one-off costs falling in this month.

**5 — NOI** = gross booking value − all operating costs. **Note the bond is not an operating cost.**

**6 — Shortfall** = NOI − bond payment. Negative means cash required. Per director = ÷ 5.

**7 — VAT, once the group crosses the threshold.** Track rolling 12-month gross accommodation revenue across all owned and modelled properties. On crossing, from the following month: output VAT on gross booking value (either absorbed, reducing net revenue, or added to nightly rates — make this a toggle, it is a real pricing decision), and input VAT reclaimable on cost lines flagged `vat_input_claimable`. Registration is a **group-level** event; a per-property engine run must accept the group's VAT status as an input rather than deciding it alone.

**8 — Tax.** Taxable profit = NOI − interest portion of the bond payment (capital repayment is not deductible). Losses accumulate as an assessed loss. In profitable months, offset the carried loss subject to the utilisation cap, then apply the company rate to the remainder.

**9 — Property value.** Compounded monthly at the annual capital growth rate: `value × (1 + g)^(1/12)`.

**10 — LTV** = bond balance ÷ current value.

**11 — Refinance check.** If the policy is enabled, at least `min_months_between` have passed, and re-advancing to `target_ltv` would release at least `min_release_amount`: increase the balance to target LTV, deduct re-registration costs from the release, record the released cash, and recompute the payment over a freshly reset term. This must visibly push the breakeven month out — refinancing is not free, and the model exists partly to show what scaling costs.

**12 — Cumulative tracking.** Cumulative cash in, cumulative cash out, running net position, and the peak cumulative outflow with the month it occurred.

### Output shape

An array of 240 month records, each carrying every line above, plus a summary object holding initial cash in and per director, peak cumulative outflow and its month, breakeven month, total cash in to breakeven, average and worst monthly shortfall over the first 12, 24 and 60 months, DSCR by year, terminal value and net equity at 5, 10, 15 and 20 years, and IRR against the ETF comparison described next.

The worst single month in year one matters as much as the average, because Stellenbosch seasonality means a winter month can be double the average draw. Report both.

## The ETF counterfactual

This is where naive property models cheat, so be strict about it.

**Same money, same dates.** The ETF leg receives the full initial cash at transfer — deposit, transfer duty, all fees, furnishing — on month 0, and then **every monthly shortfall contribution on the month it occurs**. Investing only the deposit handicaps the ETF and makes the property look better than it is. This is the single most important rule in the comparison.

**Symmetry when the property turns positive.** Once the property is cash-generating, it throws off surplus cash each month. That surplus must also be invested at the hurdle rate in the property leg, or the property is penalised at exactly the point its thesis pays off. Both legs must reinvest.

**Same tax treatment.** Both are held inside Five Peaks (Pty) Ltd. The ETF leg accrues growth at the hurdle rate, and on liquidation pays CGT on the gain at the same effective company rate as the property. If dividends tax is applied to distribution on one leg, apply it to both.

**Property exit costs count, even though there is no exit.** At each horizon: property terminal net equity = current value − agent commission (placeholder 5% plus VAT) − outstanding bond balance − a CGT provision on the gain. The provision is unrealised, and the app should label it so, but excluding it compares an asset you can spend against one you cannot.

**Report the leverage effect explicitly.** Do not bury it inside an IRR. Show a line that says, in effect: capital growth earned on the full property value was R X, of which the directors funded R Y in equity. That ratio is the entire reason this strategy exists and it should be visible, not implied.

**Run the hurdle at three levels.** 8%, 10% and 12%, always, side by side. A thesis that only survives at an 8% hurdle is worth knowing about. And the hurdle should be labelled as an assumed return, not a guaranteed one — an ETF that averages 10% does not deliver 10% every year, and the property leg is not uniquely risky just because its risk is visible.

## Outputs and solvers

### The verdict metrics

In priority order, because this is also the order they should appear on screen:

1. **Breakeven capital growth rate.** The annual growth at which the property's terminal net equity equals the ETF's after-tax value at the chosen horizon. Solve by bisection on the growth rate, tolerance 0.01%. Display it against a reference band for historic Stellenbosch growth, entered by the directors from Lightstone or agent data. This is the headline. Everything else supports it.
2. **Peak cumulative outflow, total and per director**, and the month it peaks.
3. **Shortfall in month 1 and worst month of year 1, per director**, scored against the R2,000 / R3,000 / R4,000 rule with a clear pass, acceptable or fail.
4. **Breakeven month** — when the shortfall reaches zero.
5. **Net equity at 5, 10, 15, 20 years** versus the ETF at 8%, 10% and 12%.
6. **IRR** on the property cash flows.
7. **DSCR** by year.
8. **STR versus LTR side by side** on the same unit, always. It is how the strategy stays evidenced rather than assumed, and it is the fallback position if conduct rules change.

### Three solvers

**Minimum deposit solver.** Given the affordability rule, solve for the smallest deposit percentage where the per-director shortfall stays within the chosen threshold for the first 12 months. Answers the practical question: *this deal fails at 10% down, so what would it take?*

**Maximum price solver.** Given a fixed available deposit and the shortfall ceiling, solve for the highest purchase price that still clears. Answers: *what can we actually shop for?*

**Required ADR solver.** Given price, deposit and the shortfall ceiling, solve for the ADR needed at the modelled occupancy. Then the directors can ask the managers a single concrete question — can this unit achieve R X a night — instead of guessing. Given how sensitive these deals are to nightly rate, this may be the most useful screen in the app.

### Sensitivity analysis

A tornado chart on the verdict page, ranking each input by its effect on 10-year net equity when moved ±20%: ADR, occupancy, LOS, capital growth, interest rate, levies, cleaning cost, management fee, revenue escalation.

Plus two named stress tests run automatically on every deal:

- **Rate shock**: +200 basis points from month 12, held.
- **STR ban**: forced conversion to long-term letting from month 36, including the loss of furnishing value and the change in cost structure. Given that a body corporate can change its conduct rules by special resolution after purchase, this is not a hypothetical, and every deal should carry a number for what it would cost.

## Screens

### Group dashboard

Combined monthly shortfall across all owned properties, total and per director. Current month and the next 12 projected. Aggregate portfolio value, total debt, blended LVR. A **VAT turnover tracker** showing rolling 12-month accommodation revenue against the registration threshold, with a warning as it approaches — this creeps up on a company and the directors should see it coming a year out. Capacity: given a stated group monthly capacity, how much headroom remains and when the next purchase becomes affordable. Cash calls due this month by director.

### Properties under review

List view with the verdict summary per property: breakeven growth rate, per-director shortfall, pass/acceptable/fail badge, and the STR-permitted gate status. Sortable, so the best candidate is obvious.

Detail view: tabbed input form — Property, Purchase, Finance, Revenue (the 12-month seasonality grid), Costs, Growth, Refinance. Every numeric input carries an evidence marker the user sets: **evidenced** (with a source note or linked comp) or **assumed**. Live recalculation as values change; do not make them press Calculate.

### Verdict page

The most important screen in the app. Top: the breakeven growth rate as a large single number, with its verdict. Below: the affordability scorecard against the R2k/R3k/R4k rule. Then the cashflow chart — monthly shortfall over 240 months with the breakeven month marked — and the wealth chart, property net equity against the ETF at all three hurdle rates. Then cumulative cash in with the peak marked. Then the sensitivity tornado, the two stress tests, and the STR versus LTR comparison.

At the bottom, an **assumption confidence panel**: what proportion of the inputs driving this verdict are evidenced versus assumed, listed explicitly. A verdict resting on guessed ADR must not present with the same confidence as one resting on twelve months of manager data, and the screen should say which it is.

Export to PDF, so a deal can be circulated to five directors before a decision.

### Portfolio

Per property: actuals against projection by month, with variance highlighted. Current bond balance, LVR, value, and refinance capacity against the policy. Lease or booking calendar. Levy and special levy history. Maintenance log. Document store.

Portfolio-wide: a consolidated actuals view, per-director capital account showing every contribution and distribution to date, and a refinance planner that models releasing equity from existing units to fund the next deposit, showing what it does to the group's monthly shortfall before committing.

### Comparables

Searchable table, filterable by scheme, size and date. Manual entry, CSV import, and an adapter interface for a future paid data feed. Derived statistics: median price per m² by scheme, implied annual growth from repeat sales, ADR and occupancy benchmarks. Link comps to a property so the verdict can cite its evidence.

Build the import to be forgiving — column mapping on upload, since every provider's CSV differs.

### Assumptions register

Every global rate in one editable table: value, unit, effective date, source, verified flag, last verified date. Anything unverified shows a warning badge, and the app should surface a count of unverified assumptions somewhere persistent. Full edit history. Changing a tax rate here must flow to every projection immediately.

### Directors

The five accounts, share percentages, contribution ledger, and a statement per director showing total capital deployed and current share of net equity.

## Seed data

Seed the assumptions register with the values below. **Every one of them must be created with `verified = false`.** They are placeholders supplied to make the app runnable, not researched figures, and the app should nag until a director has checked each one.

| Key | Placeholder | Note |
| --- | --- | --- |
| Prime rate | 10.50% | Verify current |
| Rate margin | −1.00% | Five Peaks' facility |
| Bond term | 240 months |  |
| Company income tax | 27% |  |
| CGT inclusion rate | 80% | → \~21.6% effective |
| Assessed loss utilisation cap | 80% | Confirm with accountant |
| Dividends tax | 20% |  |
| VAT rate | 15% |  |
| VAT registration threshold | R1,000,000 | Rolling 12 months, group level |
| Agent commission on sale | 5% + VAT | For terminal value only |
| ETF hurdle rate | 10% | Also run 8% and 12% |
| Airbnb host service fee | 3% |  |
| Management fee | 15% of gross | Per the managers' agreement |
| Cleaning fee | R650 per turnover | Absorbed, not charged to guest |
| Maintenance reserve | 5% of gross revenue |  |
| Revenue escalation | 7% p.a. |  |
| Capital growth | 6% p.a. | Replace with Stellenbosch evidence |
| Levy escalation | 8% p.a. | Often outruns CPI |
| Furnishing, 1 bed | R100,000 |  |
| Furnishing, 2 bed | R150,000 |  |
| Shortfall target / ok / max | R2,000 / R3,000 / R4,000 | Per director per property |

**Transfer duty brackets** must be seeded as dated rows, not constants, because they change most Februaries and a deal transferred last year must still reprice against the brackets in force then. Seed an approximate current set, flag it unverified, and make the table editable in the UI. Do not let the engine fall back to a hardcoded bracket if the table is empty — fail loudly instead.

**Transfer attorney and bond registration fee scales** likewise: seed an approximate price-banded scale, flagged unverified, editable.

**Seasonality template.** Seed a Stellenbosch STR curve with December and January strongest, a secondary lift around March and April and again in September, and a soft June and July. Mark it clearly as an illustrative shape, not measured data. It exists so a new property has something to start from; the directors will replace it with real figures from their managers, who already run comparable units and have actual monthly ADR, occupancy and turnover counts. Make importing that easy.

**Demo property.** Seed one worked example — a R3.5m one-bedroom, 90% bond, so the app has something to show on first boot. Label it clearly as demo data and make it deletable in one click.

## Calibration data — confidential

Everything in this section is derived from the managers' actual portfolio records, 2021 to mid-2026, covering roughly 50 units across Stellenbosch. **It is confidential and must not leave Five Peaks.** It is also the only evidenced data in this document, so unlike the seed values above it should be loaded with `verified = true` and a source note.

A caution on the source workbook: on the Commission and Cleaning sheets, only the 2026 block holds actual commission and cleaning figures. The 2024 and earlier blocks on those sheets duplicate turnover values, so anything derived from them would be wrong. Only 2026 was used below.

### Gross revenue benchmarks, clean full calendar years

A "clean" year means twelve months of data with at most one zero month, so closures and renovations are excluded.

| Asset type | Unit-years | Median annual gross | Median monthly | Range |
| --- | --- | --- | --- | --- |
| Studio apartment | 11 | R251,600 | R20,970 | R196,600 – R297,800 |
| 1 bed apartment | 2 | R245,300 | R20,440 | R244,900 – R245,700 |
| 2 bed apartment | 7 | R405,300 | R33,780 | R299,300 – R455,700 |
| 3 bed house | 4 | R653,500 | R54,460 | R579,300 – R790,000 |
| 4 bed house | 9 | R1,002,300 | R83,520 | R636,300 – R1,390,500 |
| 7 bed house | 1 | R2,664,500 | R222,040 | single property |

The studio and one-bedroom figures are statistically indistinguishable from each other. The step up to two bedrooms is roughly 60%, and to a four-bedroom house roughly 4× a studio.

### Seasonality index, apartments

Median share of annual revenue by month across 20 clean unit-years, expressed as a multiple of the monthly average. Seed this as the default apartment curve.

| Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.20 | 1.34 | 1.14 | 1.22 | 0.64 | 0.44 | 0.68 | 0.63 | 1.09 | 1.03 | 1.19 | 1.16 |

June runs at 44% of the average month and February at 134% — a spread of roughly three to one. Houses are more extreme still, peaking in December at 1.66 and bottoming in June at 0.39, with a weaker September because they depend less on the academic calendar. Seed both curves separately.

### Verified cost ratios, 2026

**Management commission** measured month-by-month against the same month's turnover, five properties, 29 matched months: **14.3% to 14.9% of gross**, median 14.5%. Consistent with the 15% agreement. Model at 15% and treat the gap as rounding.

**Cleaning**, houses only, 2026: 3.0% to 7.3% of gross revenue, R6,700 to R8,100 per month on large houses. There is **no apartment cleaning data in the workbook** — this is the single most important gap, because at a studio's revenue level cleaning is likely to run near 20% of gross rather than 5%. Get this from the managers before the model is relied on.

### Observed revenue growth

Year-on-year across 17 consecutive clean unit-years: **median 7.5%, mean 8.1%**, range −10.8% to +31.6%. This supports a 7% revenue escalation assumption, but the dispersion is wide and individual units go backwards. Seed 7% and make clear it is an average across a portfolio, not a promise per unit.

## What the real data changes in this spec

Four amendments, all of which override the earlier sections where they conflict.

### 1. Asset type becomes a first-class dimension

Add `asset_type` to properties: `studio` | `apt_1bed` | `apt_2bed` | `apt_3bed` | `house_3bed` | `house_4bed` | `house_5plus`. It drives the default revenue benchmark, the default seasonality curve (apartment or house), the cleaning intensity default, and the furnishing default. Houses are in scope alongside apartments.

### 2. Revenue input becomes monthly gross, with ADR as the optional decomposition

The managers keep **monthly gross turnover**, not ADR and occupancy. Forcing the directors to invent an ADR and occupancy pair that multiplies back to a revenue they already know is backwards and introduces error.

So the primary revenue input is **annual gross revenue**, spread across months by the seasonality curve. ADR, occupancy and LOS become an optional secondary panel used only to derive the turnover count for cleaning, and the UI should let the user enter turnovers per month directly instead if they have that figure. Keep the LOS mechanics from the engine section — they still matter for cleaning — but do not make ADR the mandatory entry point.

### 3. Cleaning intensity must be modelled per asset type

Cleaning scales with guest turnover, not with revenue, so it falls hardest on the cheapest units. On the evidence, a large house runs 3–7% of gross; a studio at R21,000 a month with a R650 fee across six or seven turnovers is over 20%. That single ratio explains most of the difference in net operating yield between a studio and a house, and it should be shown explicitly on the verdict page as **cleaning as a percentage of gross**, alongside a note of how much a minimum-stay policy would save.

### 4. Net operating yield by asset type is the new headline comparison

Using the real revenue benchmarks with the current cost stack, net operating yield rises steeply with unit size — roughly 2.9% on a studio, 1.8% on a one-bedroom, 3.6% on a two-bedroom, 5.5% on a three-bedroom house and 6.9% on a four-bedroom house. Against a cost of debt near 9.25%, **no apartment type covers its own interest, and larger properties close the gap substantially.**

The app must therefore include an **asset class comparison screen**: for a given per-director shortfall ceiling, the maximum affordable purchase price by asset type, side by side. On the current data that produces roughly R3.1m for a one-bedroom, R4.0m for a two-bedroom, R6.0m for a three-bedroom house and R8.4m for a four-bedroom house — figures that bear directly on whether the group is shopping in the right segment at all.

This screen is arguably more valuable than any individual deal verdict, and it should be built early rather than last.

## 5. Vintage, inflation and the escalation assumption

This amendment overrides the 7% revenue escalation seeded earlier and the growth figure in the calibration section. It is the most consequential correction in this document.

### The benchmarks must be inflation-adjusted

The revenue benchmarks above pool unit-years from 2022 to 2025 into a single median. That is wrong: it averages 2022 rands with 2025 rands, and 2021–22 are visibly covid-suppressed — the source workbook literally labels a row "End Covid". Pooled medians understate current revenue for older-vintage units and overstate the stability of the series.

The engine must therefore store every comparable and benchmark with its **observation year**, and restate it to current rands using a CPI series held in the assumptions register, before it is used as a default or shown as a benchmark. A comps table that cannot say what year a figure is from is not usable evidence.

### Growth is decelerating, sharply

Same-unit, full-calendar-year comparisons:

| Period | Median growth |
| --- | --- |
| 2022 → 2023 | +12.9% |
| 2023 → 2024 | +10.8% |
| 2024 → 2025 | +3.3% |
| 2025 → 2026, Jan–Aug, same units | −0.1% |

The early figures are post-covid recovery, not trend. Against CPI of roughly 4–5%, 2026 revenue is falling in real terms while levies, cleaning, rates and utilities continue to escalate.

**Data exclusion.** Four Den studios switch to a flat R30,000 per month from April 2026. That is a guaranteed rent or master-lease arrangement, not short-term turnover, and including it inflated the 2026 comparison by several points. The import routine must flag any unit whose consecutive monthly figures are identical and exclude it from benchmark derivation unless a user confirms otherwise.

### What this does to the thesis

The business model rests on revenue escalating against a nominally fixed bond payment until the shortfall closes. That mechanism only operates if **revenue escalation exceeds cost escalation by a meaningful margin.** Years until NOI covers the bond, one-bedroom at R3.5m, 90% LTV, costs escalating at 5%:

| Revenue escalation | Years to breakeven |
| --- | --- |
| 0% | never |
| 3% | never |
| 5% | 35 years |
| 7% | 19 years |
| 9% | 14 years |

At the escalation the last two years actually delivered, the shortfall on a small apartment **never closes** — it widens. A four-bedroom house clears the same test at 5% escalation in eight years, because it starts far closer to covering itself.

### Required changes

- **Seed revenue escalation at 4%, not 7%.** Flag it unverified and note that it is a judgement between two years of recent flat performance and a longer but covid-distorted history.
- **Run 0%, 3%, 5% and 7% escalation as standard scenarios on every deal**, in the same way the hurdle rate runs at three levels.
- Add a **real escalation spread** to the verdict page: revenue escalation minus weighted cost escalation. Where it is zero or negative, the verdict must state plainly that the deal has no self-correcting mechanism and the shortfall is permanent.
- Add **"never breaks even"** as an explicit verdict outcome. The engine currently assumes a breakeven month exists; it often will not.
- Hold a **CPI series** in the assumptions register and show every projection in both nominal and real terms.

Two years is a short series, and the plateau most likely reflects growth in Stellenbosch short-term rental supply, which may or may not persist. But the model must not default to the recovery-era number, and a deal that only works at 7% escalation should be presented as the bet it is.

## Testing

Vitest. The engine package must reach high coverage before any UI work begins. Five directors are going to make seven-figure decisions on this output, so the tests are the deliverable as much as the app is.

**Amortisation.** Verify the payment against the closed-form annuity formula. Verify the balance reaches zero in the final month to within one cent. Verify that a mid-term rate change recomputes the payment correctly and still terminates at zero.

**Revenue.** Verify nights sold, turnovers and cleaning costs across LOS values. Assert explicitly that halving LOS doubles the cleaning cost at constant occupancy — it is the relationship most likely to be quietly wrong, and it moves real money.

**Seasonality.** Verify a property transferring in August maps month index 1 to September, not January. Off-by-one here silently misstates year-one cashflow.

**Solvers.** Verify each converges, and that feeding its answer back in reproduces the target within tolerance.

**ETF parity.** The critical test: with property growth set so terminal net equity equals the ETF, confirm the breakeven solver returns that same rate. And confirm the ETF leg receives every shortfall contribution — construct a case with a known contribution schedule and check the ETF balance against a hand-computed future value.

**Tax.** Assessed loss accumulates in loss years, is utilised subject to the cap in profit years, and never goes negative.

**VAT threshold.** Verify the switch trips on rolling group turnover, not per property, and not on a calendar-year reset.

**Money.** Property-based tests asserting no floating-point drift across a 240-month run.

**Golden fixture.** One fully specified scenario with its complete expected 240-month output committed to the repo. Any change to the engine that alters it must be deliberate, and the diff must be reviewable.

## Build order and guardrails

### Order

1. Monorepo scaffold, Dockerfile, Railway config, health check.
2. Drizzle schema, migrations, seed script.
3. **The engine, with its full test suite.** Nothing else until this is trustworthy.
4. API routes with Zod validation.
5. Auth and the five director accounts.
6. Under-review CRUD and the input forms.
7. The verdict page and its charts.
8. Solvers and sensitivity analysis.
9. Comparables and CSV import.
10. Portfolio, actuals, variance.
11. Group dashboard, capacity, VAT tracker.
12. Refinance planner.
13. PDF export.
14. Backups and an admin script.

Stop after step 3 and show the engine's test output before continuing.

### Do not

- **Do not hardcode any rate, bracket or fee.** If it is a number that could change, it belongs in the assumptions register. No exceptions, including the ones seeded above.
- **Do not scrape Property24, Private Property, Airbnb or the Deeds Office.** It is against their terms, it breaks constantly, and it will produce data the directors cannot defend. Comps are entered or imported. Build the adapter interface for a future licensed feed and leave it unimplemented.
- **Do not invent market data.** No default ADR pulled from nowhere, no assumed occupancy presented as fact. If a value is unknown, the UI says unknown and the verdict reflects the uncertainty.
- **Do not use floats for money**, anywhere.
- **Do not use localStorage or IndexedDB** for shared state.
- **Do not let the verdict page round a marginal deal into a pass.** If the breakeven growth rate exceeds the reference band, say so plainly. The model's value lies entirely in its willingness to say no.
- **Do not average away seasonality.** Twelve months of inputs, always.
- **Do not silently skip the STR-permitted gate.** An unresolved gate blocks the verdict.

### One last note for whoever reads this

The model will produce confident-looking numbers from unverified assumptions. Three things should be settled outside the app before anyone relies on it: the current transfer duty brackets and attorney fee scales, the VAT position on short-term accommodation and on buying fixed property from a non-vendor, and the assessed-loss and dividends-tax treatment for a five-director property company. Those are accountant questions, not modelling questions, and the answers change the output materially.

This specification is not financial, tax or legal advice.
