# Task-claim maintenance deployment

Migration `034_task_claim_leases_maintenance.sql` is a stop-the-world protocol
change. Normal Docker/Railway startup sets `NOVA_ROLLING_STARTUP=1` and refuses
to apply it. Never override that startup command.

1. Confirm Railway grants the container at least **15 seconds** of outer
   termination grace. The SDK/PM2 inner budget is 10 seconds; the extra time is
   required for signal delivery and process-manager overhead.
2. Stop or scale to zero the **entire existing monolith**, not only the named bot
   processes. Confirm the old container is gone.
3. Wait until the newest `bots.last_heartbeat` is more than two minutes old.
   The SQL locks the bots table and rejects every newer heartbeat regardless of
   status, including `ERROR` and `BUSY`.
4. From a one-off maintenance shell connected to the production database, run:

   ```text
   NOVA_MAINTENANCE_MIGRATION=034_task_claim_leases_maintenance.sql NOVA_MAINTENANCE_ACK=stop-old-monolith-confirmed node scripts/run-migrations.js
   ```

   Set both environment variables on that one-off process only. Do not store
   them on the Railway service.
5. Verify `_migrations` records
   `034_task_claim_leases_maintenance.sql` and that no task is `RUNNING` without
   `claimed_by_bot_id`, `claim_token`, and `lease_expires_at`.
6. Deploy the new image. Orchestrator refuses readiness without the complete
   schema; StoreBot and TradeBot refuse standalone mode and signal PM2 ready only
   after registration; gateway `/health` stays 503 until all required bots and
   Orchestrator report healthy.

For rollback, keep the monolith stopped, wait through the same heartbeat guard,
run `infra/runbooks/rollback-task-claim-leases.sql`, and then deploy the previous
image. Reverting code without the rollback SQL is unsafe.
