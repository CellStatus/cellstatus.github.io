# CellStatus Operations Hub

CellStatus is a shop-floor operations app for tracking machine status, configuring production cells, managing part/characteristic masters, and monitoring scrap performance.

## Navigation

- Dashboard
- Characteristics
- Parts
- Machines
- Cells
- Scrap Incidents

## Core Features

### Dashboard

- Machine status overview and grouped machine cards
- Scrap analytics with:
  - Costliest incidents
  - Scrap by Machine
  - Scrap by Cell
  - Scrap by Characteristic
  - Scrap by Part Number

### Characteristics

- Dedicated characteristic master page
- Create/delete characteristics
- Each characteristic is linked to a part number

### Parts

- Dedicated part master page
- Create/delete parts with:
  - Part Number
  - Name
  - Material
  - Raw Material Cost
  - Notes

### Machines

- Machine list and editing
- Machine status/state management
- Cycle-time fields used for cell bottleneck and UPH calculations

### Cells

- Cell configuration with operation-based machine assignment
- Machines are assigned to operations (not directly to the cell)
- Operation cycle time is computed from assigned machine cycle times using parallel-rate math
- Cell metrics include machine count, scrap incidents, scrap cost, and bottleneck with UPH

### Scrap Incidents

- Create/edit/delete scrap incidents
- Incident form includes machine, characteristic, quantity, estimated cost, note, status, and dates
- Characteristics are selected from the master list and carry part linkage into incidents

## Tech Stack

- Frontend: React + TypeScript + Vite + Wouter + TanStack Query
- UI: Tailwind CSS + shadcn/ui
- Backend: Express + TypeScript
- Database: PostgreSQL (Neon) + Drizzle ORM

## Local Setup

1. Install dependencies
	- `npm install`
2. Configure environment in `.env`
	- `DATABASE_URL`
	- `API_PASSWORD`
3. Sync schema
	- `npm run db:push`
4. Start app
	- `npm run dev`

## Scripts

- `npm run dev` — Start full-stack dev server
- `npm run check` — Type-check project
- `npm run db:push` — Push Drizzle schema changes
- `npm run build` — Build production bundle

## License

MIT



