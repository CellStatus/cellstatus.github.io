# Manufacturing Cell Status Keeper

## Overview
A real-time manufacturing cell status tracking application for monitoring machines, operators, production statistics, and maintenance logs on a production floor.

## Features
- **Dashboard**: Overview of all machines with color-coded status indicators (running, idle, maintenance, down, setup)
- **Machine Management**: Add, edit, and remove machines with production targets
- **Operator Assignment**: Track who is running each machine with shift information
- **Production Stats**: Monitor units produced, cycle times, and efficiency metrics
- **Maintenance Logging**: Record and track maintenance activities (preventive, corrective, emergency, inspection)

## Technology Stack
- **Frontend**: React with TypeScript, Tailwind CSS, Shadcn UI components
- **Backend**: Express.js with TypeScript
- **Data**: In-memory storage (MemStorage)
- **Styling**: IBM Plex Sans/Mono fonts, industrial-themed color palette

## Project Structure
```
client/
  src/
    components/
      app-sidebar.tsx        # Navigation sidebar
      theme-toggle.tsx       # Dark/light mode toggle
      machine-status-card.tsx # Machine status display card
      machine-dialog.tsx     # Add/edit machine form
      operator-dialog.tsx    # Add/edit operator form
      maintenance-dialog.tsx # Maintenance log form
      assign-operator-dialog.tsx # Operator assignment
    pages/
      dashboard.tsx          # Main dashboard view
      machines.tsx           # Machine list/management
      operators.tsx          # Operator management
      maintenance.tsx        # Maintenance log view
server/
  routes.ts                  # API endpoints
  storage.ts                 # In-memory data storage
shared/
  schema.ts                  # TypeScript types and Zod schemas
```

## API Endpoints
- `GET/POST /api/machines` - List/create machines
- `PATCH/DELETE /api/machines/:id` - Update/delete machine
- `PATCH /api/machines/:id/status` - Update machine status
- `PATCH /api/machines/:id/operator` - Assign operator
- `GET/POST /api/operators` - List/create operators
- `PATCH/DELETE /api/operators/:id` - Update/delete operator
- `GET/POST /api/maintenance` - List/create maintenance logs
- `PATCH/DELETE /api/maintenance/:id` - Update/delete maintenance log

## Running the Application
The application runs on port 5000 using `npm run dev`.

## Recent Changes
- Initial implementation of manufacturing cell status keeper
- Dashboard with machine status cards and production metrics
- CRUD operations for machines, operators, and maintenance logs
- Dark mode support
- Industrial-themed design with IBM Plex fonts
