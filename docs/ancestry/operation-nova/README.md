# NOVA Workspace
Modules:
- **nova_core** — Orchestrator (task router, logging, configs)
- **nova_trade** — Data, backtests (paper only), strategy lab
- **nova_store** — Product listings, sync, mock checkout
- **nova_social** — Post scheduler (sandbox), content lab
- **nova_ml** — Models, experiments

## Quickstart (Windows)
1. Python 3.10+ (recommended 64-bit).
2. python -m venv .venv && .\.venv\Scripts\activate
3. pip install -r requirements.txt (create below)
4. Copy configs\.env.example to .env and fill values.
