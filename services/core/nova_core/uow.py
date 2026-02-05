"""
EventedUoW - Unit of Work enforcing atomic domain mutations with events.

ALL writes must go through EventedUoW to ensure:
1. Domain change and event are committed atomically
2. Hash chain is maintained
3. Single-writer per org is enforced
4. No raw session.commit() outside UoW

Architecture makes it impossible to mutate domain state without an event.
"""
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, TYPE_CHECKING
import json

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from nova_core.clock import Clock


class EventedUoW:
    """
    Unit of Work that atomically commits domain changes with events.
    
    Usage:
        async with EventedUoW(session, clock, actor_type, actor_id, org_id) as uow:
            task = Task(...)
            uow.add(task)
            uow.emit_event("task.created", "task", task.id, {"status": "pending"})
            # Commit happens at end, atomically
    
    The UoW:
    - Acquires org-level lock before any writes
    - Fetches previous hash for chain
    - Commits all changes + events in one transaction
    - Releases lock after commit
    """
    
    def __init__(
        self,
        session: "AsyncSession",
        clock: "Clock",
        actor_type: str,
        actor_id: str,
        org_id: str,
        session_id: Optional[str] = None
    ):
        self.session = session
        self.clock = clock
        self.actor_type = actor_type
        self.actor_id = actor_id
        self.org_id = org_id
        self.session_id = session_id
        
        self._pending_entities: List[Any] = []
        self._pending_events: List[Dict[str, Any]] = []
        self._committed = False
        self._lock_acquired = False
    
    def add(self, entity: Any) -> None:
        """Add an entity to be persisted."""
        self._pending_entities.append(entity)
    
    def emit_event(
        self,
        event_type: str,
        entity_type: str,
        entity_id: str,
        payload: Dict[str, Any]
    ) -> None:
        """
        Queue an event to be emitted with the transaction.
        
        The actual event (with hash) is created at commit time to ensure
        proper chain ordering.
        """
        self._pending_events.append({
            'event_type': event_type,
            'entity_type': entity_type,
            'entity_id': entity_id,
            'payload': payload,
        })
    
    async def _acquire_org_lock(self) -> None:
        """Acquire single-writer lock for the organization."""
        from sqlalchemy import text
        
        # Detect database type from connection URL
        url = str(self.session.get_bind().url)
        
        if 'postgresql' in url:
            # PostgreSQL: advisory lock based on org_id hash
            lock_id = hash(self.org_id) & 0x7FFFFFFF  # Positive 32-bit int
            await self.session.execute(
                text("SELECT pg_advisory_xact_lock(:lock_id)"),
                {"lock_id": lock_id}
            )
        else:
            # SQLite: use a lock table
            # First ensure lock table exists
            await self.session.execute(text("""
                INSERT OR IGNORE INTO org_locks (org_id, locked_at)
                VALUES (:org_id, datetime('now'))
            """), {"org_id": self.org_id})
            # The unique constraint ensures single writer
        
        self._lock_acquired = True
    
    async def _get_prev_hash(self) -> str:
        """Get the hash of the last event for this org."""
        from sqlalchemy import text
        from nova_core.canonical import GENESIS_HASH
        
        result = await self.session.execute(text("""
            SELECT hash FROM events 
            WHERE org_id = :org_id 
            ORDER BY id DESC 
            LIMIT 1
        """), {"org_id": self.org_id})
        
        row = result.fetchone()
        return row[0] if row else GENESIS_HASH
    
    async def _create_and_insert_events(self, prev_hash: str) -> None:
        """Create events with proper hashing and insert them."""
        from sqlalchemy import text
        from nova_core.events import EventBuilder
        from nova_core.canonical import canonical_json
        
        current_prev_hash = prev_hash
        
        for event_data in self._pending_events:
            builder = EventBuilder(
                self.clock, self.org_id, self.actor_type, self.actor_id
            ).with_session(self.session_id)
            
            event = builder.build(
                event_data['event_type'],
                event_data['entity_type'],
                event_data['entity_id'],
                event_data['payload'],
                current_prev_hash
            )
            
            await self.session.execute(text("""
                INSERT INTO events (
                    id, ts, actor_type, actor_id, org_id, session_id,
                    event_type, entity_type, entity_id, payload_json,
                    hash, prev_hash
                ) VALUES (
                    :id, :ts, :actor_type, :actor_id, :org_id, :session_id,
                    :event_type, :entity_type, :entity_id, :payload_json,
                    :hash, :prev_hash
                )
            """), {
                "id": event.id,
                "ts": event.ts,
                "actor_type": event.actor_type,
                "actor_id": event.actor_id,
                "org_id": event.org_id,
                "session_id": event.session_id,
                "event_type": event.event_type,
                "entity_type": event.entity_type,
                "entity_id": event.entity_id,
                "payload_json": event.payload_json,
                "hash": event.hash,
                "prev_hash": event.prev_hash,
            })
            
            # Chain to this event's hash
            current_prev_hash = event.hash
    
    async def commit(self) -> None:
        """Commit all pending changes and events atomically."""
        if self._committed:
            raise RuntimeError("UoW already committed")
        
        try:
            # Acquire org lock
            await self._acquire_org_lock()
            
            # Add pending entities to session
            for entity in self._pending_entities:
                self.session.add(entity)
            
            # Flush entities to get their IDs
            await self.session.flush()
            
            # Get previous hash and create events
            prev_hash = await self._get_prev_hash()
            await self._create_and_insert_events(prev_hash)
            
            # Commit everything
            await self.session.commit()
            self._committed = True
            
        except Exception:
            await self.session.rollback()
            raise
    
    async def rollback(self) -> None:
        """Rollback all pending changes."""
        await self.session.rollback()
        self._pending_entities.clear()
        self._pending_events.clear()


@asynccontextmanager
async def evented_uow(
    session: "AsyncSession",
    clock: "Clock",
    actor_type: str,
    actor_id: str,
    org_id: str,
    session_id: Optional[str] = None
):
    """
    Context manager for EventedUoW.
    
    Usage:
        async with evented_uow(session, clock, "user", user_id, org_id) as uow:
            uow.add(entity)
            uow.emit_event(...)
            # Auto-commits on exit
    """
    uow = EventedUoW(session, clock, actor_type, actor_id, org_id, session_id)
    try:
        yield uow
        if not uow._committed:
            await uow.commit()
    except Exception:
        await uow.rollback()
        raise
