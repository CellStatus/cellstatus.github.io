# Manufacturing Cell Status Keeper - Design Guidelines

## Design Approach
**Carbon Design System** - Selected for enterprise-grade data applications with emphasis on clarity, efficiency, and industrial use cases. This system excels at information-dense interfaces requiring quick scanning and data entry on shop floor environments.

## Core Design Principles
1. **Immediate Visibility**: All critical machine statuses visible at a glance
2. **Fast Data Entry**: Minimal clicks to update operator assignments and production counts
3. **Industrial Durability**: High contrast, large touch targets for shop floor use
4. **Hierarchical Clarity**: Production data prioritized over administrative functions

## Typography System
- **Primary Font**: IBM Plex Sans (via Google Fonts CDN)
- **Monospace**: IBM Plex Mono for numerical data, production counts, timestamps
- **Hierarchy**:
  - Page Headers: text-3xl font-semibold
  - Section Headers: text-xl font-medium
  - Machine Names: text-lg font-semibold
  - Data Labels: text-sm font-medium uppercase tracking-wide
  - Metrics/Numbers: text-2xl md:text-3xl font-mono font-bold
  - Status Text: text-sm font-medium

## Layout System
**Spacing Primitives**: Tailwind units of 2, 4, 6, and 8 for consistent rhythm
- Component padding: p-4 to p-6
- Section spacing: space-y-6 to space-y-8
- Grid gaps: gap-4 to gap-6
- Container max-width: max-w-7xl with px-4 to px-6

## Component Library

### Dashboard Layout
- **Main Grid**: 12-column responsive grid for machine cards (grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4)
- **Sidebar Panel**: Fixed left navigation (w-64) with machine filter controls, shift information
- **Header Bar**: Fixed top with cell name, current shift, overall efficiency metrics

### Machine Status Cards
- **Card Structure**: Elevated containers with clear status indicators
- **Status Bar**: Top accent border (border-t-4) indicating machine state
- **Content Sections**:
  - Machine ID and name (prominent)
  - Current operator with avatar/initials circle
  - Real-time production counter with target comparison
  - Last cycle time and efficiency percentage
  - Quick action buttons (Start Run, Log Maintenance, Change Operator)
- **Metrics Display**: Large numerical values with small unit labels beneath

### Status Indicators
- **Visual System**: Combination of border accent, badge, and icon
- **States to Represent**:
  - Running (solid indicator, pulsing animation dot)
  - Idle (muted indicator)
  - Maintenance (distinctive pattern)
  - Down/Error (alert styling)
  - Setup (transitional state)

### Data Tables (Maintenance Log)
- **Structure**: Dense, scannable rows with zebra striping
- **Columns**: Fixed-width for dates/times, flexible for descriptions
- **Row Actions**: Inline edit/complete buttons aligned right
- **Sorting**: Clickable headers with sort direction indicators

### Forms & Inputs
- **Operator Assignment**: Searchable dropdown with recent operators at top
- **Production Entry**: Large numeric keypad-friendly inputs
- **Maintenance Notes**: Expandable textarea with character count
- **Date/Time Pickers**: Clear, touch-friendly selectors

### Navigation
- **Primary Nav**: Vertical sidebar with icons and labels (Dashboard, Machines, Operators, Maintenance, Reports)
- **Secondary Nav**: Horizontal tabs within sections (Active Machines, All Machines, Archived)
- **Breadcrumbs**: Show location hierarchy when drilling into machine details

## Interaction Patterns
- **Live Updates**: Auto-refresh production counts without page reload (polling or WebSocket)
- **Quick Actions**: Floating action button for "Add New Machine" or "Log Issue"
- **Inline Editing**: Double-click metric to edit directly in card
- **Toast Notifications**: Success/error messages for actions (bottom-right position)
- **Confirmation Modals**: For destructive actions (remove machine, end shift)

## Icon System
**Heroicons** (outline style for navigation, solid for status indicators)
- Machine states, operator avatars, maintenance tools, production metrics, navigation items

## Responsive Strategy
- **Desktop (lg:)**: Full 4-column grid, sidebar visible, expanded metrics
- **Tablet (md:)**: 2-column grid, collapsible sidebar, condensed cards
- **Mobile**: Single column, bottom navigation bar, swipeable cards, prioritize current shift data

## Performance Optimization
- **Lazy Loading**: Load historical data on demand
- **Virtual Scrolling**: For large machine lists (100+ items)
- **Optimistic Updates**: Immediate UI feedback before server confirmation

## Accessibility
- **Keyboard Navigation**: Full tab order through all interactive elements
- **Screen Reader Labels**: Descriptive aria-labels for all status indicators and metrics
- **Focus States**: High-contrast focus rings (ring-2 ring-offset-2)
- **Touch Targets**: Minimum 44px tap areas for shop floor tablet use

This design prioritizes functionality, speed, and clarity for manufacturing environments while maintaining a modern, professional aesthetic suitable for enterprise industrial applications.