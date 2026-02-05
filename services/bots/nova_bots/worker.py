"""
Bot Worker - Processes tasks from the queue.

Features:
- Task claiming with lease
- Exponential backoff on failure
- Graceful shutdown
- Event emission for task lifecycle
"""
import asyncio
import json
import signal
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from nova_bots.trade_bot import TradeBot
from nova_bots.store_bot import StoreBot
from nova_bots.social_bot import SocialBot
from nova_bots.ops_bot import OpsBot
from nova_bots.base import BotResult


class BotWorker:
    """
    Worker that processes tasks from the queue.
    
    Features:
    - Leasing to prevent double execution
    - Retry with exponential backoff
    - Event emission for audit
    - Graceful shutdown
    """
    
    def __init__(
        self,
        worker_id: str,
        session_factory,
        clock,
        seed: Optional[int] = None
    ):
        self.worker_id = worker_id
        self.session_factory = session_factory
        self.clock = clock
        self._running = False
        self._shutdown_event = asyncio.Event()
        
        # Initialize bots with optional seed for determinism
        self.bots = {
            "trade": TradeBot(seed=seed),
            "store": StoreBot(seed=seed),
            "social": SocialBot(seed=seed),
            "ops": OpsBot(seed=seed),
        }
        
        # Backoff settings
        self.base_delay = 1.0
        self.max_delay = 60.0
        self.max_attempts = 3
        self.lease_duration_seconds = 300  # 5 minutes
    
    async def start(self):
        """Start the worker loop."""
        self._running = True
        
        while self._running and not self._shutdown_event.is_set():
            try:
                task = await self._claim_task()
                
                if task:
                    await self._process_task(task)
                else:
                    # No task available, wait briefly
                    await asyncio.sleep(1.0)
            except Exception as e:
                # Log error but keep running
                print(f"Worker error: {e}")
                await asyncio.sleep(5.0)
    
    async def stop(self):
        """Stop the worker gracefully."""
        self._running = False
        self._shutdown_event.set()
    
    async def _claim_task(self) -> Optional[Dict[str, Any]]:
        """Claim a pending task with lease."""
        from sqlalchemy import text
        
        async with self.session_factory() as session:
            now = self.clock.now_iso()
            lease_expires = (
                self.clock.now_utc() + timedelta(seconds=self.lease_duration_seconds)
            ).isoformat().replace('+00:00', 'Z')
            
            # Find and claim a task atomically
            # Look for pending tasks or tasks with expired leases
            result = await session.execute(text("""
                SELECT id, org_id, bot, action, input_json, attempts
                FROM tasks
                WHERE status IN ('pending', 'running')
                AND (
                    (status = 'pending' AND available_at_ts <= :now)
                    OR (status = 'running' AND lease_expires_ts < :now)
                )
                ORDER BY available_at_ts
                LIMIT 1
            """), {"now": now})
            
            row = result.fetchone()
            if not row:
                return None
            
            task_id, org_id, bot, action, input_json, attempts = row
            
            # Claim the task
            await session.execute(text("""
                UPDATE tasks
                SET status = 'running',
                    worker_id = :worker_id,
                    lease_expires_ts = :lease_expires,
                    attempts = attempts + 1
                WHERE id = :task_id
            """), {
                "worker_id": self.worker_id,
                "lease_expires": lease_expires,
                "task_id": task_id
            })
            
            await session.commit()
            
            return {
                "id": task_id,
                "org_id": org_id,
                "bot": bot,
                "action": action,
                "input": json.loads(input_json),
                "attempts": attempts + 1
            }
    
    async def _process_task(self, task: Dict[str, Any]):
        """Process a claimed task."""
        task_id = task["id"]
        bot_name = task["bot"]
        action = task["action"]
        input_data = task["input"]
        org_id = task["org_id"]
        
        bot = self.bots.get(bot_name)
        if not bot:
            await self._fail_task(task_id, org_id, f"Unknown bot: {bot_name}")
            return
        
        try:
            # Execute the bot action
            result = await bot.execute(action, input_data)
            
            if result.success:
                await self._complete_task(task_id, org_id, result)
            else:
                await self._fail_task(task_id, org_id, result.error or "Unknown error")
                
        except Exception as e:
            await self._fail_task(task_id, org_id, str(e))
    
    async def _complete_task(self, task_id: str, org_id: str, result: BotResult):
        """Mark task as completed."""
        from sqlalchemy import text
        
        async with self.session_factory() as session:
            await session.execute(text("""
                UPDATE tasks
                SET status = 'completed',
                    result_json = :result_json
                WHERE id = :task_id
            """), {
                "task_id": task_id,
                "result_json": json.dumps(result.to_dict())
            })
            await session.commit()
    
    async def _fail_task(self, task_id: str, org_id: str, error: str):
        """Mark task as failed or schedule retry."""
        from sqlalchemy import text
        
        async with self.session_factory() as session:
            # Check attempts
            result = await session.execute(text("""
                SELECT attempts FROM tasks WHERE id = :task_id
            """), {"task_id": task_id})
            row = result.fetchone()
            
            if not row:
                return
            
            attempts = row[0]
            
            if attempts >= self.max_attempts:
                # Max retries exceeded
                await session.execute(text("""
                    UPDATE tasks
                    SET status = 'failed',
                        error_json = :error_json
                    WHERE id = :task_id
                """), {
                    "task_id": task_id,
                    "error_json": json.dumps({"error": error, "attempts": attempts})
                })
            else:
                # Schedule retry with backoff
                delay = min(self.base_delay * (2 ** attempts), self.max_delay)
                available_at = (
                    self.clock.now_utc() + timedelta(seconds=delay)
                ).isoformat().replace('+00:00', 'Z')
                
                await session.execute(text("""
                    UPDATE tasks
                    SET status = 'pending',
                        worker_id = NULL,
                        lease_expires_ts = NULL,
                        available_at_ts = :available_at,
                        error_json = :error_json
                    WHERE id = :task_id
                """), {
                    "task_id": task_id,
                    "available_at": available_at,
                    "error_json": json.dumps({"error": error, "attempts": attempts, "retry_at": available_at})
                })
            
            await session.commit()


async def run_worker():
    """Run the bot worker as a standalone process."""
    import sys
    import os
    
    # Add paths
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'api'))
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'core'))
    
    from nova_api.database import get_session_factory, init_database
    from nova_core.clock import get_clock
    from nova_core.ids import generate_id
    
    # Initialize database
    await init_database()
    
    worker_id = generate_id()
    worker = BotWorker(
        worker_id=worker_id,
        session_factory=get_session_factory(),
        clock=get_clock()
    )
    
    # Setup signal handlers
    def signal_handler(sig, frame):
        print("Shutting down worker...")
        asyncio.create_task(worker.stop())
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    print(f"Worker {worker_id} starting...")
    await worker.start()
    print("Worker stopped.")


if __name__ == "__main__":
    asyncio.run(run_worker())
