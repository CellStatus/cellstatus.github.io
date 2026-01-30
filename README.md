# CellStatus — Manufacturing Management Tool

CellStatus is a Manufacturing Management tool for data collection and analysis. It combines machine status tracking, value stream mapping (VSM) analysis, and audit findings to help teams manage equipment, capture measurement-based issues, and improve production flow.

---

## ✨ Key Features

- Dashboard with live machine statuses and quick status updates
- Machine registry and quick CRUD for machines
- VSM Builder to model operation flows and identify bottlenecks
- Audit Findings to record measurement-based issues and track corrective actions

---

## VSM Builder (Value Stream Mapping)

Build and analyze your value stream:

- Process Flow Modeling: add machines, define operation numbers, group parallel machines
- Bottleneck Analysis: identify constraints and compute utilization and throughput

---

## Audit Findings

The Audit Findings feature provides a user-facing interface to capture measurement-based findings for machines. Key behaviors:

- Findings are grouped by Part Number, then by Characteristic in the UI
- Dashboard and machine/part widgets can link directly into Audit Findings and pre-filter/expand relevant groups
- When a Part Number filter is active the UI hides other parts so you can focus on the selected part
- Selecting an existing characteristic makes tolerance fields read-only to preserve recorded tolerances

Each finding records: machine, part number/name, characteristic, tolerance (min/max), measured value, status (open/closed), and corrective action notes.


## Contributing

Contributions are welcome — open a pull request with a clear description of changes.

---

## License

MIT



