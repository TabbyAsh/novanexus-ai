"""
Event types and Event model for event sourcing.

All domain mutations MUST produce an event atomically via EventedUoW.
"""
from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class EventType(str, Enum):
    """All event types in the system."""
    
    # Organization events
    ORG_CREATED = "org.created"
    ORG_UPDATED = "org.updated"
    
    # User events
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_DELETED = "user.deleted"
    
    # Auth events
    AUTH_LOGIN_SUCCESS = "auth.login_success"
    AUTH_LOGIN_FAILURE = "auth.login_failure"
    AUTH_LOGOUT = "auth.logout"
    AUTH_PASSWORD_CHANGED = "auth.password_changed"
    AUTH_LOCKOUT = "auth.lockout"
    
    # Policy events
    POLICY_CREATED = "policy.created"
    POLICY_UPDATED = "policy.updated"
    
    # Approval events
    APPROVAL_CREATED = "approval.created"
    APPROVAL_REVOKED = "approval.revoked"
    APPROVAL_EXPIRED = "approval.expired"
    APPROVAL_USED = "approval.used"
    
    # Governance events
    KILL_SWITCH_ACTIVATED = "governance.kill_switch_activated"
    KILL_SWITCH_DEACTIVATED = "governance.kill_switch_deactivated"
    ARM_ENABLED = "governance.arm_enabled"
    ARM_DISABLED = "governance.arm_disabled"
    ARM_EXPIRED = "governance.arm_expired"
    ACTION_DENIED = "governance.action_denied"
    
    # Task events
    TASK_CREATED = "task.created"
    TASK_STARTED = "task.started"
    TASK_STEP = "task.step"
    TASK_SUCCEEDED = "task.succeeded"
    TASK_FAILED = "task.failed"
    TASK_CANCELLED = "task.cancelled"
    TASK_RETRIED = "task.retried"
    
    # Bot events
    BOT_TRADE_SIGNAL = "bot.trade.signal"
    BOT_TRADE_EXECUTED = "bot.trade.executed"
    BOT_STORE_LISTING = "bot.store.listing"
    BOT_STORE_ORDER = "bot.store.order"
    BOT_SOCIAL_CONTENT = "bot.social.content"
    BOT_SOCIAL_POST = "bot.social.post"
    BOT_OPS_BACKUP = "bot.ops.backup"
    BOT_OPS_RESTORE = "bot.ops.restore"
    
    # System events
    SYSTEM_STARTUP = "system.startup"
    SYSTEM_SHUTDOWN = "system.shutdown"
    SYSTEM_HEALTH_CHECK = "system.health_check"
    SYSTEM_EXPORT = "system.export"


class ActorType(str, Enum):
    """Types of actors that can emit events."""
    USER = "user"
    SYSTEM = "system"
    BOT = "bot"


class Event(BaseModel):
    """
    Immutable event record.
    
    Events are append-only and form a hash chain per organization.
    The hash chain provides tamper-evidence for audit purposes.
    """
    id: str = Field(..., description="UUIDv7 event ID")
    ts: str = Field(..., description="ISO8601 timestamp")
    actor_type: str = Field(..., description="Type of actor: user/system/bot")
    actor_id: str = Field(..., description="ID of the actor")
    org_id: str = Field(..., description="Organization ID")
    session_id: Optional[str] = Field(None, description="Session correlation ID")
    event_type: str = Field(..., description="Type of event")
    entity_type: str = Field(..., description="Type of affected entity")
    entity_id: str = Field(..., description="ID of affected entity")
    payload_json: str = Field(..., description="Canonical JSON payload")
    hash: str = Field(..., description="SHA-256 hash of this event")
    prev_hash: str = Field(..., description="Hash of previous event in chain")
    
    class Config:
        frozen = True  # Events are immutable


class EventBuilder:
    """
    Builder for creating events with proper hashing.
    
    Usage:
        event = EventBuilder(clock, org_id, actor_type, actor_id) \
            .with_session(session_id) \
            .build(event_type, entity_type, entity_id, payload, prev_hash)
    """
    
    def __init__(self, clock, org_id: str, actor_type: str, actor_id: str):
        from nova_core.clock import Clock
        self.clock: Clock = clock
        self.org_id = org_id
        self.actor_type = actor_type
        self.actor_id = actor_id
        self.session_id: Optional[str] = None
    
    def with_session(self, session_id: Optional[str]) -> "EventBuilder":
        self.session_id = session_id
        return self
    
    def build(
        self,
        event_type: str,
        entity_type: str,
        entity_id: str,
        payload: Dict[str, Any],
        prev_hash: str
    ) -> Event:
        from nova_core.ids import generate_id
        from nova_core.canonical import canonical_json, compute_event_hash
        
        event_id = generate_id()
        ts = self.clock.now_iso()
        payload_json = canonical_json(payload)
        
        header = {
            'id': event_id,
            'ts': ts,
            'actor_type': self.actor_type,
            'actor_id': self.actor_id,
            'org_id': self.org_id,
            'session_id': self.session_id,
            'event_type': event_type,
            'entity_type': entity_type,
            'entity_id': entity_id,
        }
        
        event_hash = compute_event_hash(prev_hash, header, payload)
        
        return Event(
            id=event_id,
            ts=ts,
            actor_type=self.actor_type,
            actor_id=self.actor_id,
            org_id=self.org_id,
            session_id=self.session_id,
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            payload_json=payload_json,
            hash=event_hash,
            prev_hash=prev_hash,
        )
