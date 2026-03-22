# Production & Scrap Cost Analysis Dashboard

CellStatus is a manufacturing analytics platform for tracking machine status, optimizing production cells, managing part/characteristic masters, and analyzing scrap costs and production efficiency.

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

## Screenshots

### Dashboard Overview
Full dashboard view showing machine status cards and the scrap cost trend chart with granularity selector
![Dashboard Overview](screenshots/01-dashboard-overview.png)

### Scrap Analytics Charts
Shows the scrap breakdown charts (by Machine, Cell, Characteristic, Part Number)
![Scrap Analytics](screenshots/02-scrap-analytics.png)

### Machines Page
The machines list table ordered by cell and machine number
![Machines Table](screenshots/03-machines-table.png)

### Cells Page with Configuration
Shows the cell list (collapsible) and cell detail editor with operations/machines assigned
![Cells Configuration](screenshots/04-cells-configuration.png)

### Scrap Incidents Form
Shows the form for creating scrap incidents with machine, characteristic, quantity, cost fields
![Scrap Incident Creation](screenshots/05-scrap-incident-creation.png)

### Parts Master
The parts list page showing Part Number, Name, Material, Raw Material Cost
![Parts Master](screenshots/06-parts-master.png)

### Characteristics Master
The characteristics list page showing characteristics linked to part numbers
![Characteristics Master](screenshots/07-characteristics-master.png)

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



