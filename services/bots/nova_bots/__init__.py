"""
Nova Bots - Deterministic bot implementations for governed automation.

All bots:
- Emit events: task_started, task_step, task_succeeded, task_failed
- Respect governance (check policy, approval, ARM before real actions)
- Use deterministic simulations (seeded random, frozen clock in tests)
- Export results (CSV, JSON)
"""
from nova_bots.trade_bot import TradeBot
from nova_bots.store_bot import StoreBot
from nova_bots.social_bot import SocialBot
from nova_bots.ops_bot import OpsBot
from nova_bots.worker import BotWorker

__all__ = ["TradeBot", "StoreBot", "SocialBot", "OpsBot", "BotWorker"]
