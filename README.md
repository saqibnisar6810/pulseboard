# PulseBoard

Real-time revenue analytics for SaaS teams. MRR, churn, net revenue retention and cohort retention, computed from your subscription events, with a live feed of every signup, upgrade and cancellation as it happens.

![PulseBoard](docs/cover.png)

**Live demo:** https://pulseboard-demo.vercel.app

Click **Try the live demo** and you get a private sandbox with two years of realistic data for a made-up SaaS company. While you have it open, new events stream in every few seconds, so the numbers and the feed move. Sandboxes are deleted after 24 hours.

> The API runs on a free container plan, which can sleep when idle. The first visit can take about 30 seconds while it wakes; the app shows a "waking up" screen during that time.

## What it does

- **Revenue dashboard:** MRR, net revenue retention, monthly churn and ARPA, each compared with the previous period. Filter by plan and by 30 days, 90 days or 12 months.
- **MRR movement chart:** new, expansion, contraction and churn per month (or week/day), plus MRR at the end of each period.
- **Retention cohorts:** the share of each month's new customers still paying N months later.
- **Live updates:** Socket.io pushes every event and fresh headline numbers to every open dashboard in the workspace.
- **Customers:** search, filter by plan and status, sort, paginate, and open a timeline of each customer's events.
- **Events API:** your backend posts six subscription event types with an API key; PulseBoard works out the MRR movement from them.
- **Teams and roles:** owner, admin and viewer, enforced on the server. Invite links, role changes, removal.
- **Billing:** PulseBoard's own plans through Stripe Checkout in test mode, with signed webhooks.
- **CSV export:** the customer list (with current filters) and the MRR movement report.

![Customers](docs/customers.png)

## How it works

```mermaid
flowchart LR
  A[Your backend] -- "POST /api/v1/events (API key)" --> B[Express API]
  S[Demo simulator] --> B
  B --> R[transition rules<br/>new / expansion / contraction / churn]
  R --> M[(MongoDB<br/>customers + events)]
  R -- Socket.io --> D[Open dashboards]
  D -- REST --> B
  M --> K[metrics: MRR, NRR, churn, cohorts]
```

- **One set of rules.** `server/src/domain/apply.ts` has a pure `transition()` function that decides how each event changes a customer and how MRR moved. The live API, the demo-data generator and the simulator all use it, so every number on screen comes from the same logic.
- **Metrics are pure functions** (`server/src/domain/metrics.ts`) over customers and events. At larger scale they'd read from pre-aggregated daily snapshots, but the inputs and outputs would stay the same.
- **Multi-tenant by design.** Every query is scoped by workspace. Membership and role are re-checked on each request (and on socket connect), so removing someone takes effect immediately.
- **Security:** bcrypt passwords, short-lived JWTs, API keys stored as SHA-256 hashes (the full key is shown once), invite tokens hashed, Helmet, CORS allow-list, rate limits on auth, demo creation and ingestion, and formula-safe CSV.

## Tech stack

| Part | Choice |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Recharts, React Router |
| API | Node.js, Express 5, Socket.io, Zod validation |
| Database | MongoDB with Mongoose (compound indexes per workspace) |
| Billing | Stripe Checkout and webhooks (test mode) |
| Hosting | Vercel (frontend), Docker container on Back4app (API), MongoDB Atlas (database) |

## Events API

```bash
curl -X POST https://<api-host>/api/v1/events \
  -H "Authorization: Bearer pk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "type": "subscription.started",
    "customer": { "id": "cus_42", "name": "Acme" },
    "plan": "pro", "mrr": 99, "seats": 4
  }'
```

| Event | Meaning |
|---|---|
| `customer.signed_up` | A trial starts |
| `subscription.started` | First payment, or a churned customer coming back (reactivation) |
| `subscription.changed` | Plan or seat change; counted as expansion or contraction |
| `subscription.canceled` | Churn |
| `payment.failed` | Account becomes past due |
| `payment.succeeded` | Recovers a past-due account |

Send up to 100 at once as `{ "events": [...] }`. Each result comes back with its own status (HTTP 207 when some fail).

## Run it locally

You need Node.js 20+ and a MongoDB (local, Docker or a free Atlas cluster).

```bash
npm install
cp server/.env.example server/.env      # set MONGODB_URI
cp client/.env.example client/.env
npm run dev -w server                   # API on http://localhost:4000
npm run dev -w client                   # app on http://localhost:5173
```

## Deploy (free)

1. **MongoDB Atlas:** create a free M0 cluster and a database user, allow access from anywhere (`0.0.0.0/0`, since Render's free IPs change), and copy the connection string.
2. **API:** any Docker host works with the root `Dockerfile` (listens on `PORT`, default 8080). The demo runs on Back4app Containers; `render.yaml` is included for Render. Set `MONGODB_URI`, `JWT_SECRET` and `APP_URL` (your Vercel URL). Stripe keys are optional.
3. **Vercel:** import the repo with root directory `client` and set `VITE_API_URL` to the Render URL.
4. **Stripe (optional):** add a webhook endpoint `https://<api-host>/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.deleted` and `invoice.payment_failed`, then set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.

## Project structure

```
server/src/
  index.ts              Express app, Socket.io, simulator and cleanup timers
  models.ts             users, workspaces, memberships, invites, customers, events
  auth.ts               JWT, role middleware, hashing helpers
  realtime.ts           socket auth, rooms per workspace, live KPI pushes
  domain/apply.ts       event rules (pure) + persistence
  domain/metrics.ts     MRR, NRR, churn, ARPA, movement, cohorts
  domain/demo.ts        two years of realistic demo history, generated in memory
  domain/simulator.ts   live events for open demo dashboards
  routes/               auth, app (metrics, customers, team), ingest, billing
client/src/
  pages/                Revenue, Customers, Events, Settings, Login, Join
  lib/                  API client, session, live socket hook, formatting
```

## License

MIT
