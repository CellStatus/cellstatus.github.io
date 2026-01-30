# CellStatus — Manufacturing Management Tool

CellStatus is a Manufacturing Management tool for data collection and analysis. It combines machine status tracking, value stream mapping (VSM) analysis, and audit findings to help teams manage equipment, capture measurement-based issues, and improve production flow.

---

## ✨ Key Features

###  Dashboard
- **Live Status Cards**: View all machines with color-coded status (Running, Idle, Down, Maintenance, Setup)
- **Quick Status Changes**: Update machine status with one click
- **Notes & Tracking**: Add notes to machines for shift handoffs

###  Machine Management
- **Machine Registry**: Maintain your equipment database with:
  - Machine ID and name
  - Cycle time and batch size
  - Uptime percentage
  - Current status
- **CRUD Operations**: Add, edit, and delete machines

###  VSM Builder (Value Stream Mapping)
The core feature of the application - build and analyze your value stream:

- **Process Flow Modeling**:
  - Add machines from your database to the VSM
  - Define operation numbers (Op 10, Op 20, etc.)
  - Group parallel machines at the same operation
  - Set cycle times, setup times, and uptime percentages

- **Bottleneck Analysis**:
  - Automatic identification of the constraint (bottleneck)
  - Theory of Constraints-based recommendations
  - Utilization calculations for each operation
  - System throughput calculation (Units Per Hour)

### CellStatus

CellStatus is a lightweight Value Stream Mapping (VSM), machine status and audit findings tool for small-to-medium manufacturing operations. It helps teams map processes, track machine health, record measurement-based audit findings, and analyze bottlenecks using Theory of Constraints.

This README gives an overview of the app, developer setup and how to use the Audit Findings feature.

---

## Quick highlights

- Dashboard with live machine statuses and quick status updates
- VSM Builder: model operation flow, compute throughput, and identify bottlenecks
- Audit Findings: record measurement results per machine/part/characteristic with open/closed workflow
- Seed script, API endpoints, and deployment script included

---

## Table of contents

1. [Getting started](#getting-started)
2. [Development workflow](#development-workflow)
3. [Audit Findings](#audit-findings)
4. [API Endpoints](#api-endpoints)
5. [Project structure](#project-structure)
6. [Deployment](#deployment)
7. [Contributing](#contributing)
8. [License](#license)

---

## Getting started

Prerequisites:

- Node.js 20+
- PostgreSQL (or Neon/Postgres-compatible)

Steps:

```bash
git clone https://github.com/rwaynewhite15/CellStatus.git
cd CellStatus
npm install
# set DATABASE_URL in .env (see .env.example if present)
npm run db:push    # run migrations
npm run db:seed    # populate sample data (optional)
npm run dev        # start backend server
```

The app serves the client and API from the Node server; frontend assets are under `client/` and server code is under `server/`.

---

## Development workflow

- Use the included project scripts to run, build, and deploy the application. See `package.json` for the available commands.

---

## Audit Findings

The Audit Findings feature provides a user-facing interface to capture measurement-based findings for machines. Key behaviors:

- Findings are grouped by Part Number, then by Characteristic in the UI.
- Dashboard and machine/part widgets link into the Audit Findings page and can pre-filter or expand groups for quick inspection.
- When a Part Number filter is active the UI hides other parts so you can focus on the selected part.
- Selecting an existing characteristic in the create/edit flow makes the characteristic/tolerance fields read-only to preserve recorded tolerances.

Each finding records the machine, part number/name, characteristic, tolerance (min/max), measured value, status (open/closed), and corrective action notes.
---

## API Endpoints

Relevant endpoints used by the frontend (HTTP JSON API):

- `GET /api/audit-findings` — list findings
- `POST /api/machines/:machineId/findings` — create a finding for a machine
- `PATCH /api/findings/:id` — update a finding
- `DELETE /api/findings/:id` — delete a finding
- `GET /api/machines` — list machines (used to populate selectors and cards)
- `GET /api/vsm-configurations` — list saved VSMs

Note: API route files live in `server/` and are wired into `server/index.ts`.

---

## Project structure

```
CellStatus/
├─ client/                # React + TypeScript frontend
│  └─ src/
│     ├─ pages/           # pages, e.g. dashboard-vsm.tsx, audit-findings.tsx
│     ├─ components/      # shared UI components and primitives
│     └─ lib/             # helpers and api client
├─ server/                # Node/Express backend and API
│  ├─ index.ts            # server entrypoint
│  ├─ routes.ts           # API routes
│  └─ db.ts               # Drizzle DB connection
├─ shared/                # shared types & schema (drizzle)
└─ migrations/            # SQL migrations
```

---

## Contributing

Contributions are welcome. Suggested workflow:

1. Fork the repo and create a feature branch
2. Run tests / type-check locally (`npm run check`)
3. Open a pull request with a clear description of changes

---

## License

MIT
- **Behavior highlights:**

