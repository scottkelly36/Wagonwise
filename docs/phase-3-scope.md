# Phase 3 scope (draft, 2026-10-08)

A draft to agree with the owner before building. The modules and their numbering come from the owner's whiteboard; the
order, sizes and "proof it works" are proposals. Update this file as decisions are made, and keep it short.

## Principles (the owner's)

- **Small first companies at the end of Phase 3; no big companies until the end of Phase 4**, when it is a finished product
  to sell. Big fleets are approached only through people the owner knows.
- **Price:** £10 per vehicle per month at rollout (kept for founders), £15 target. The driver app stays free.
- **Rollout stages (whiteboard):** 1) 25 drivers using the app, 15 active; 2) 5 companies using it, small haulage; 3) 1 paying company; 4) 10 companies and the Play Store release. Phase 3 ends around stages 2 and 3.
- **Each module is proven with a real company before the next starts.** Each company chooses its own retention for what it
  stores (photos today; extend the same setting to new data).

## Order and why

| #   | Module                                    | What it is                                                                                                                                         | Needs from the owner                                                                       | Proof it works                                                                  | Size |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ---- |
| 0   | Billing basics (not on the board, add it) | Bill the vehicle capacity a company commits to (admin-set, changed month to month), not vehicles in use. Invoices generated from the admin portal. | How the first paying company wants to be billed; WagonWise's trading name and bank details | The first invoice is right without a spreadsheet                                | S    |
| M1  | Costing                                   | Running costs per vehicle and per job (fuel, wages, vehicle costs, overheads)                                                                      | Their own monthly costs, and the pilot firm's cost headings                                | Cost per job matches the owner's own working for one month                      | M    |
| M2  | Revenue                                   | What each job earns: rates, customers, revenue per job, vehicle and customer                                                                       | How the pilot firm prices jobs and whether they invoice per job or load                    | Reproduces roughly a month of their invoices                                    | M    |
| M3  | Fuel card CSV                             | Import a fuel card statement and match fuel to vehicles and jobs                                                                                   | A sample CSV and which card provider the pilot firm uses                                   | A month's fuel matches the card statement to the pound                          | M    |
| M6  | Profit projection                         | Revenue minus costs and fuel, per job, vehicle and month, with a simple forecast                                                                   | Nothing new once M1 to M3 exist                                                            | The owner trusts the number for a decision they were already making             | M    |
| M5  | Driver walk-round checks                  | The daily vehicle check in the app, with photos and defects                                                                                        | The pilot firm's current check form                                                        | Drivers do it daily and a defect reaches the office the same day                | M-L  |
| M4  | Fleet maintenance                         | Service, MOT and inspection due dates per vehicle, reminders, defects from M5                                                                      | The pilot firm's inspection routine                                                        | Nothing due is missed for a month                                               | M    |
| M7  | what3words                                | Look up three words on the Where to? screen and the job form                                                                                       | The Basic plan key (£7.99 a month)                                                         | A driver finds a farm gate from three words                                     | S-M  |
| M8  | UK coverage                               | National GB routing tiles                                                                                                                          | A customer outside the Northumberland tiles; the plan is in the deployment guide           | Routes work in a new county                                                     | M-L  |
| M9  | Tachograph / driver hours                 | Driver-hours aware navigation and break planning (`ideas.md`)                                                                                      | What the pilot firm's lorries and tachographs actually have                                | A research spike first, then a driver-entered clock, then the tachograph source | L    |

## Suggested sequence

1. **The money chain first: 0, M1, M2, M3, M6.** It is what a paying company will ask about, and M1 feeds the income
   projections. M1 needs the owner's real running costs.
2. **Then the compliance chain: M5, then M4.** Walk-round checks create the defects that maintenance tracks.
3. **In parallel, only when asked:** M7 (when the key arrives) and M8 (when a customer needs another area).
4. **M9 starts as a cheap research spike now**, to learn what the pilot's lorries have, and is built last.

## Billing model (decided with the owner, 2026-10-09)

- **Bill the commitment, not the usage.** Each company has a vehicle capacity set by a WagonWise admin; the bill is capacity
  times a price per vehicle (default £10, overridable per company). Capacity is effective-dated so changing it never alters a
  past invoice. Creating a fleet vehicle beyond capacity is refused. Not per driver.
- **One live job per vehicle**, so capacity means something (a vehicle cannot carry several drivers' jobs at once).
- **Invoices are generated from the admin portal** (draft, review, issue, mark paid by hand; printable page that saves as a
  PDF). Issuing is refused while WagonWise's billing details still hold `[placeholders]`.
- **Built:** WagonWise's billing details (Billing details page); each company's price per vehicle and effective-dated
  capacity (Plans page), enforced when a vehicle is created; one live job per vehicle. **Next:** invoice generation, then the
  company's own plan and invoices view, then email.

## Cross-cutting

- **Privacy and legal:** every new kind of data (fuel card data, vehicle checks, defect photos) needs the privacy notice, DPIA
  and DPA updated, and an owner-set retention. The legal pack is written; a solicitor has not reviewed it yet.
- **Pricing and billing:** there is no billing system. Start with an invoice made by hand from the usage report (item 0).
- **Deploys:** core, the BFFs and the dashboard auto-deploy on merge; the app ships by `driver-app-release.yml` (OTA for
  JavaScript, a Play build for native changes such as camera or Bluetooth).

## Goals for the end of Phase 3

- 5 companies using the app, 1 paying (aim for 2), at £10 per vehicle. Realistic income is small (about £80 to £200 a month);
  the point is proof, not revenue. The sales workbook and projections are with the owner (not in the repo).
- A company can see what a job cost, earned and made, from its own data.
- Checks and maintenance replace a paper or spreadsheet process for at least one company.

## Phase 4 on the board (not scoped)

M0 legal; M2 abnormal load checks; M3 survey checklist; M4 notifications, reading and tracking responses, sign-off; M5 movement
mode, deviation alerts, escort view; M6 movement records, shadow pilot; M7 TomTom congestion integration; M8 responsive
deviations. Phase 4 ends with the product ready for big fleets.

## Open questions for the owner

1. The real monthly running costs (hosting, maps, email and text, Valhalla, the owner's time) for M1.
2. Which pilot company, and which of walk-round checks or maintenance they would want first.
3. Which fuel card provider the pilot firm uses, and a sample CSV.
4. How the first paying company should be billed.
5. What tachographs the pilot firm's lorries have (for M9).
