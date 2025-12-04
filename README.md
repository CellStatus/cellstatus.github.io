# CellStatus - Manufacturing Cell Tracker

A modern, real-time manufacturing cell status tracking application built for production floor teams. Monitor machines, track production metrics, manage operator assignments, and log downtime incidents—all in one intuitive dashboard.

![Live Demo](https://rwaynewhite15.github.io/CellStatus/)

---

## 📸 Screenshots

### Dashboard - Real-Time Cell Overview
![Dashboard Screenshot](./screenshots/dashboard.png)
*Live dashboard showing all machines with status cards, production stats, and shift selection*

### Machines Management
![Machines Page Screenshot](./screenshots/machines.png)
*Manage your manufacturing equipment with detailed status tracking*

### Reports & Analytics
![Reports Screenshot](./screenshots/reports.png)
*Comprehensive production reports with machine history, maintenance logs, and downtime analysis*

### Production Tracking
![Production Tab Screenshot](./screenshots/production-tab.png)
*Log and review production statistics by shift and date*

---

## ✨ Key Features

### 🎯 Real-Time Dashboard
- **Live Status Cards**: Color-coded machine status at a glance (Running, Idle, Down, Maintenance, Setup)
- **Shift Management**: Track production across Day, Afternoon, and Midnight shifts
- **Summary Metrics**: Instant view of total running/idle/down machines, units produced, and average efficiency
- **Active Downtime Tracking**: See live downtime duration for machines currently down

### 🏭 Machine Management
- **Machine Cards**: Visual cards showing:
  - Current status with color indicators
  - Assigned operator and shift
  - Units produced vs. target
  - Real-time efficiency percentage
  - Active downtime alerts
- **Quick Actions**:
  - Change machine status with one click
  - Assign/reassign operators
  - Log maintenance activities
  - Record downtime incidents
  - Submit production stats
  - Resolve active downtime

### 📊 Production Statistics
- **Daily Tracking**: Log units produced, targets, downtime, and efficiency per shift
- **Automatic Calculations**: Efficiency computed from production data
- **Historical View**: Review past production performance by machine and date
- **Operator Attribution**: Production stats automatically linked to current machine operator

### 🔧 Maintenance Logging
- **Maintenance Types**: Preventive, Corrective, Emergency, and Inspection
- **Status Tracking**: Scheduled, In Progress, and Completed
- **Technician Assignment**: Track who performed each maintenance task
- **History**: Full maintenance records per machine

### ⏱️ Downtime Management
- **Reason Categorization**: Log downtime with specific reason codes:
  - **Mechanical**: Equipment Failure, Hydraulic Issue, Pneumatic Issue, Bearing Failure, Lubrication Issue
  - **Electrical**: Motor Failure, Sensor Malfunction, Control System Error, Power Supply Issue, Wiring Problem
  - **Material**: Material Shortage, Wrong Material, Material Defect, Loading Issue, Feed Problem
  - **Operator**: Break Time, Training, Shift Change, Absence, Setup Time
  - **Quality**: Quality Check, Rework Required, Calibration, Inspection, Cleaning
  - **Other**: Unplanned Downtime, Emergency Stop, Other
- **Duration Tracking**: Automatic calculation of downtime duration in minutes
- **Active Alerts**: Real-time indicators for machines currently experiencing downtime
- **Resolution Logging**: Record who resolved each incident and any notes

### 📈 Reports & Analytics
- **Overview Tab**:
  - Machine Status summary table
  - Maintenance logs overview
  - Machine history with production stats and maintenance records
  - Downtime summary with total incidents, duration, and per-incident details
- **Production Tab**:
  - Create new production entries
  - View all historical production stats
  - Delete individual entries
- **Downtime Analysis** (shown in Overview):
  - Total downtime incidents count
  - Total downtime hours
  - Today's downtime
  - Average incident duration
  - Per-row delete actions for downtime logs

### 🎨 Modern UI/UX
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Dark Mode**: Toggle between light and dark themes for 24/7 operation
- **Accessible**: Built with Radix UI primitives for keyboard navigation and screen readers
- **Intuitive**: Clean, industrial-themed design with semantic color coding

### 👥 Operator Management
- **Operator Database**: Maintain a list of operators with names, shifts, and availability
- **Assignment Tracking**: See which operator is running each machine
- **Shift-Based Views**: Filter and track by shift (Day, Afternoon, Midnight)

---

## 🚀 Getting Started

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
   SESSION_SECRET=your-random-secret-here
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

## 🌐 Live Demo

**Frontend**: [https://rwaynewhite15.github.io/CellStatus/](https://rwaynewhite15.github.io/CellStatus/)  
**Backend API**: Hosted on Render (serverless)

---

## 🛠️ Tech Stack

**Frontend**
- React 18 + TypeScript
- Vite (fast build tool)
- TanStack Query (data fetching and caching)
- Shadcn UI + Radix UI (accessible components)
- Tailwind CSS (utility-first styling)
- Lucide React (beautiful icons)
- Recharts (production charts)

**Backend**
- Node.js + Express
- TypeScript
- Drizzle ORM (type-safe database queries)
- PostgreSQL (Neon serverless)
- CORS & Rate Limiting (security)

**Deployment**
- Frontend: GitHub Pages (static hosting)
- Backend: Render (Node.js service)
- Database: Neon (serverless PostgreSQL)

---

## 📂 Project Structure

```
CellStatus/
├── client/                   # React frontend
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── ui/           # Shadcn UI components
│   │   │   ├── machine-status-card.tsx
│   │   │   ├── machine-dialog.tsx
│   │   │   ├── maintenance-dialog.tsx
│   │   │   ├── operator-dialog.tsx
│   │   │   └── ...
│   │   ├── pages/            # Route pages
│   │   │   ├── dashboard.tsx # Main dashboard
│   │   │   ├── machines.tsx  # Machine management
│   │   │   ├── operators.tsx # Operator management
│   │   │   ├── maintenance.tsx
│   │   │   └── reports.tsx   # Reports & analytics
│   │   ├── hooks/            # Custom React hooks
│   │   └── lib/              # Utilities and API client
│   └── public/               # Static assets
├── server/                   # Express backend
│   ├── index.ts              # Server entry and middleware
│   ├── routes.ts             # API route handlers
│   ├── storage.ts            # Database operations
│   ├── db.ts                 # Database connection
│   └── auth.ts               # Authentication (optional)
├── shared/                   # Shared TypeScript types
│   └── schema.ts             # Database schema & Zod validators
└── .github/workflows/        # CI/CD for GitHub Pages
```

---

## 🎨 Color-Coded Status System

| Status | Color | Meaning |
|--------|-------|---------|
| 🟢 **Running** | Green | Machine actively producing |
| 🟡 **Idle** | Yellow | Machine waiting for work/operator |
| 🔴 **Down** | Red | Machine experiencing downtime |
| 🔵 **Maintenance** | Blue | Scheduled or active maintenance |
| 🟣 **Setup** | Purple | Machine being set up for production |

---

## 🔒 Security Features

- ✅ **CORS Protection**: Whitelist-based origin control
- ✅ **Rate Limiting**: 100 requests per 15 minutes per IP
- ✅ **Environment Isolation**: Secure credential management
- ✅ **SQL Injection Protection**: Parameterized queries via Drizzle ORM
- ✅ **HTTPS Enforced**: Secure communication in production
- ✅ **No-Cache Headers**: Prevent stale data issues

---

## 📱 Usage

### Dashboard Workflow
1. **Select Shift**: Choose Day, Afternoon, or Midnight shift from the dropdown
2. **Monitor Machines**: View real-time status cards for all equipment
3. **Take Actions**:
   - Click status dropdown to change machine state
   - Click "Assign Operator" to link an operator to a machine
   - Click "Log Maintenance" to record maintenance activities
   - Click "Log Downtime" to document incidents
   - Click "Submit Stats" to log production data for the current shift
4. **Review Metrics**: Check summary stats at the top (running count, units, efficiency, active downtime)

### Reports Workflow
1. Navigate to the **Reports** page
2. **Overview Tab**:
   - Review machine status summary
   - Check maintenance logs
   - Drill into machine history (production stats + maintenance per machine)
   - Analyze downtime incidents with delete capability
3. **Production Tab**:
   - Create new production stat entries manually
   - Review all historical production data
   - Delete incorrect entries

### Machine Management
1. Go to **Machines** page
2. View all machines in a table format
3. **Add Machine**: Click "Add Machine" and fill in name, machine ID, target units
4. **Edit Machine**: Click edit icon on any row
5. **Delete Machine**: Click trash icon (confirms before deletion)

### Operator Management
1. Go to **Operators** page
2. Add operators with name, shift, and status
3. Assign operators to machines from the Dashboard

---

## 🌍 Deployment

### Production Environment Variables

**Backend (`server/.env` on Render)**
```env
DATABASE_URL=postgresql://...
SESSION_SECRET=your-production-secret
NODE_ENV=production
ENABLE_AUTH=false  # Set to true if using Replit OIDC auth
```

**Frontend (`client/.env.production`)**
```env
VITE_API_BASE_URL=https://your-backend.onrender.com
```

### Deployment Steps
1. **Database**: Create PostgreSQL database on [Neon](https://neon.tech)
2. **Backend**: Deploy to Render as a Node.js web service, set environment variables
3. **Frontend**: Automatic deployment via GitHub Actions on push to `main` branch

---

## 🐛 Troubleshooting

**Problem**: CORS errors when accessing API  
**Solution**: Ensure your frontend URL is in the `allowedOrigins` array in `server/index.ts`

**Problem**: Database connection failed  
**Solution**: Verify `DATABASE_URL` is correct and Neon project is active (free tier pauses after inactivity)

**Problem**: Production stats not showing  
**Solution**: Check that you've selected the correct shift and date; stats are shift-specific

**Problem**: Render service not responding  
**Solution**: Free tier sleeps after 15 minutes; first request may take 20-30 seconds to wake

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details

---

## 🙏 Acknowledgments

- Built with [Shadcn UI](https://ui.shadcn.com/) for beautiful, accessible components
- Icons by [Lucide](https://lucide.dev/)
- Database by [Neon](https://neon.tech/)
- Hosted on [Render](https://render.com/) and [GitHub Pages](https://pages.github.com/)

---

## 📧 Support

For issues, feature requests, or questions:
- Open an issue on [GitHub Issues](https://github.com/rwaynewhite15/CellStatus/issues)
- Check existing issues for solutions

---

**Built for manufacturing teams to track production in real-time** 🏭
