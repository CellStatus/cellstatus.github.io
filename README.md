# CellStatus - VSM & Machine Status Tracker

A manufacturing Value Stream Mapping (VSM) and machine status tracking application. Build VSM models from your machine data, analyze bottlenecks using Theory of Constraints, and simulate WIP flow through your production process.

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

- **WIP Simulation**:
  - Real-time WIP flow simulation with continuous input
  - Visual buffer levels between operations
  - Little's Law calculation: Lead Time = WIP ÷ Throughput
  - Track where inventory accumulates in your process

- **Save & Load Configurations**:
  - Save VSM configurations to the database
  - Load previously saved VSMs for analysis
  - Track status and notes for each configuration

- **Export Reports**:
  - Generate detailed text reports with all calculations
  - Process flow overview with step metrics
  - Improvement recommendations based on constraints

###  Modern UI/UX
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark Mode**: Toggle between light and dark themes
- **Interactive Process Flow**: Click operations to configure parameters
- **Real-time Calculations**: Metrics update as you modify the VSM

---

##  Getting Started

### Prerequisites
- **Node.js** 20 or higher
- **PostgreSQL** database (free tier available at [Neon.tech](https://neon.tech))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/rwaynewhite15/CellStatus.git
   cd CellStatus
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL=postgresql://user:password@host/database
   ```

4. **Initialize the database**
   ```bash
   npm run db:push
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```
   
   Access the app at `http://localhost:5000`

---

##  Project Structure

```
CellStatus/
├── client/                 # React frontend
│   └── src/
│       ├── components/     # UI components
│       ├── pages/          # Page components
│       │   ├── dashboard-vsm.tsx   # Main dashboard
│       │   ├── machines.tsx        # Machine management
│       │   └── vsm-analyser.tsx    # VSM builder
│       ├── hooks/          # Custom React hooks
│       └── lib/            # Utilities
├── server/                 # Express backend
│   ├── routes.ts           # API routes
│   ├── storage.ts          # Database operations
│   └── db.ts               # Database connection
├── shared/                 # Shared types
│   └── schema.ts           # Drizzle schema
└── migrations/             # Database migrations
```

---

## ️ Tech Stack

**Frontend**
- React 18 + TypeScript
- Vite (fast build tool)
- TanStack Query (data fetching and caching)
- Shadcn UI + Radix UI (accessible components)
- Tailwind CSS (utility-first styling)
- Lucide React (icons)

**Backend**
- Node.js + Express
- TypeScript
- Drizzle ORM (type-safe database queries)
- PostgreSQL

---

##  VSM Concepts

### Theory of Constraints
The VSM Builder applies TOC principles:
1. **Identify** the constraint (bottleneck operation)
2. **Exploit** it - maximize bottleneck efficiency
3. **Subordinate** - align all other operations to support the bottleneck
4. **Elevate** - invest in bottleneck capacity
5. **Repeat** - a new constraint will emerge

### Key Calculations
- **Effective Cycle Time** = Cycle Time + (Setup Time ÷ Batch Size)
- **Rate** = (1 ÷ Effective CT) × Uptime%
- **Combined Rate** (parallel machines) = Sum of individual rates
- **Utilization** = (Bottleneck Rate ÷ Step Rate) × 100%
- **Lead Time** = WIP ÷ Throughput (Little's Law)

### Parallel Machine Processing
When multiple machines are assigned to the same operation number, their rates ADD together. This increases capacity at that operation proportionally.

---

##  License

MIT License - see [LICENSE](./LICENSE) file for details

---

##  Support

For issues, feature requests, or questions:
- Open an issue on [GitHub Issues](https://github.com/rwaynewhite15/CellStatus/issues)

---

**Built for manufacturing teams to analyze and optimize production flow** 
