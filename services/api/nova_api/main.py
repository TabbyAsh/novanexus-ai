"""
Nova API - Main FastAPI Application.

Routes:
- /auth: Authentication endpoints
- /tasks: Task management
- /events: Event log and audit
- /governance: Policies, approvals, kill switch, ARM
- /bots: Bot-specific endpoints
- /health: Health checks
"""
import os
import sys
import json
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import text, select, update
from sqlalchemy.ext.asyncio import AsyncSession
import bcrypt
import psutil

# Add parent to path for nova_core
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'core'))

from nova_api.config import get_settings, Settings
from nova_api.database import init_database, get_session, close_database
from nova_api.models import (
    Organization, User, Session as DBSession, Event as DBEvent,
    Policy, Approval, GovernanceState as DBGovernanceState, Task,
    OrgLock
)

# Import nova_core modules
from nova_core.clock import Clock, SystemClock, FrozenClock, get_clock, set_clock
from nova_core.ids import generate_id, DEMO_ORG_ID, DEMO_ADMIN_ID, DEMO_OPERATOR_ID, DEMO_VIEWER_ID, DEMO_POLICY_ID
from nova_core.canonical import canonical_json, GENESIS_HASH, compute_chain_verification
from nova_core.governance import (
    GovernanceMode, PolicyConfig, GovernanceState, GovernanceChecker,
    ActionType, DenialReason
)
from nova_core.events import EventType, ActorType
from nova_core.uow import EventedUoW, evented_uow


# ============================================================================
# Lifespan
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    await init_database()
    await seed_demo_data()
    yield
    # Shutdown
    await close_database()


# ============================================================================
# App Setup
# ============================================================================

settings = get_settings()

app = FastAPI(
    title="Nova Hub API",
    description="Governed Automation Platform",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Rate Limiting (Simple in-memory)
# ============================================================================

_rate_limit_store: Dict[str, List[float]] = {}


def check_rate_limit(key: str, max_requests: int, window_seconds: int) -> bool:
    """Check if request is within rate limit."""
    now = datetime.now(timezone.utc).timestamp()
    window_start = now - window_seconds
    
    if key not in _rate_limit_store:
        _rate_limit_store[key] = []
    
    # Clean old entries
    _rate_limit_store[key] = [t for t in _rate_limit_store[key] if t > window_start]
    
    if len(_rate_limit_store[key]) >= max_requests:
        return False
    
    _rate_limit_store[key].append(now)
    return True


# ============================================================================
# Request Models
# ============================================================================

class LoginRequest(BaseModel):
    username: str
    password: str


class CreateTaskRequest(BaseModel):
    mode: str = Field(..., pattern="^(recommend|assist|automate)$")
    bot: str = Field(..., pattern="^(trade|store|social|ops)$")
    action: str
    input_data: Dict[str, Any] = Field(default_factory=dict)
    idempotency_key: Optional[str] = None


class UpdatePolicyRequest(BaseModel):
    no_real_money: Optional[bool] = None
    automation_allowed: Optional[bool] = None
    max_daily_loss: Optional[str] = None
    max_position_size: Optional[str] = None
    max_orders_per_day: Optional[int] = None
    max_spend_per_day: Optional[str] = None
    require_approval_for: Optional[List[str]] = None
    allow_connectors: Optional[bool] = None
    allowed_symbols: Optional[List[str]] = None
    blocked_symbols: Optional[List[str]] = None
    content_safety_mode: Optional[str] = None


class CreateApprovalRequest(BaseModel):
    scope: str
    expires_in_hours: int = Field(default=24, ge=1, le=168)


class ArmRequest(BaseModel):
    expires_in_minutes: int = Field(default=30, ge=5, le=120)


class KillSwitchRequest(BaseModel):
    active: bool
    reason: Optional[str] = None


# ============================================================================
# Dependencies
# ============================================================================

async def get_db_session():
    """Dependency for database session."""
    async with get_session() as session:
        yield session


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_db_session)
) -> User:
    """Get current authenticated user from session cookie."""
    session_token = request.cookies.get("session_token")
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token_hash = hashlib.sha256(session_token.encode()).hexdigest()
    
    result = await session.execute(
        select(DBSession).where(
            DBSession.token_hash == token_hash,
            DBSession.is_valid == True
        )
    )
    db_session = result.scalar_one_or_none()
    
    if not db_session:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check expiry
    expires = datetime.fromisoformat(db_session.expires_at.replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=401, detail="Session expired")
    
    # Get user
    result = await session.execute(
        select(User).where(User.id == db_session.user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    
    return user


def require_role(*roles: str):
    """Dependency factory for role-based access control."""
    async def check_role(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {', '.join(roles)}")
        return user
    return check_role


async def verify_csrf(request: Request, session: AsyncSession = Depends(get_db_session)):
    """Verify CSRF token for mutation requests."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    
    session_token = request.cookies.get("session_token")
    if not session_token:
        return  # Will be caught by auth
    
    csrf_token = request.headers.get("X-CSRF-Token")
    if not csrf_token:
        raise HTTPException(status_code=403, detail="CSRF token required")
    
    token_hash = hashlib.sha256(session_token.encode()).hexdigest()
    result = await session.execute(
        select(DBSession).where(DBSession.token_hash == token_hash)
    )
    db_session = result.scalar_one_or_none()
    
    if not db_session or db_session.csrf_token != csrf_token:
        raise HTTPException(status_code=403, detail="Invalid CSRF token")


# ============================================================================
# Auth Endpoints
# ============================================================================

@app.post("/api/auth/login")
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    session: AsyncSession = Depends(get_db_session)
):
    """Login and create session."""
    client_ip = request.client.host if request.client else "unknown"
    
    # Rate limiting
    if not check_rate_limit(f"auth:{client_ip}", settings.rate_limit_auth_per_minute, 60):
        raise HTTPException(status_code=429, detail="Too many login attempts")
    
    # Find user
    result = await session.execute(
        select(User).where(User.username == body.username)
    )
    user = result.scalar_one_or_none()
    
    clock = get_clock()
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check lockout
    if user.locked_until:
        locked = datetime.fromisoformat(user.locked_until.replace('Z', '+00:00'))
        if clock.now_utc() < locked:
            raise HTTPException(
                status_code=423,
                detail=f"Account locked until {user.locked_until}"
            )
    
    # Verify password
    if not bcrypt.checkpw(body.password.encode(), user.password_hash.encode()):
        # Increment failed attempts
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.max_login_attempts:
            lockout_time = clock.now_utc() + timedelta(minutes=settings.lockout_minutes)
            user.locked_until = lockout_time.isoformat().replace('+00:00', 'Z')
            
            # Log lockout event
            async with evented_uow(session, clock, ActorType.SYSTEM.value, "system", user.org_id) as uow:
                uow.emit_event(
                    EventType.AUTH_LOCKOUT.value, "user", user.id,
                    {"reason": "max_failed_attempts", "attempts": user.failed_login_attempts}
                )
        
        await session.commit()
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Reset failed attempts
    user.failed_login_attempts = 0
    user.locked_until = None
    
    # Create session
    session_token = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(session_token.encode()).hexdigest()
    expires = clock.now_utc() + timedelta(hours=settings.session_expire_hours)
    
    db_session = DBSession(
        id=generate_id(),
        user_id=user.id,
        token_hash=token_hash,
        csrf_token=csrf_token,
        created_at=clock.now_iso(),
        expires_at=expires.isoformat().replace('+00:00', 'Z'),
        is_valid=True
    )
    
    # Use UoW to emit login event
    async with evented_uow(session, clock, ActorType.USER.value, user.id, user.org_id, db_session.id) as uow:
        uow.add(db_session)
        uow.emit_event(
            EventType.AUTH_LOGIN_SUCCESS.value, "user", user.id,
            {"ip": client_ip}
        )
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,  # Set True in production with HTTPS
        samesite="lax",
        max_age=settings.session_expire_hours * 3600
    )
    
    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "org_id": user.org_id
        },
        "csrf_token": csrf_token,
        "expires_at": db_session.expires_at
    }


@app.post("/api/auth/logout")
async def logout(
    response: Response,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user)
):
    """Logout and invalidate session."""
    session_token = request.cookies.get("session_token")
    if session_token:
        token_hash = hashlib.sha256(session_token.encode()).hexdigest()
        await session.execute(
            update(DBSession).where(DBSession.token_hash == token_hash).values(is_valid=False)
        )
    
    clock = get_clock()
    async with evented_uow(session, clock, ActorType.USER.value, user.id, user.org_id) as uow:
        uow.emit_event(EventType.AUTH_LOGOUT.value, "user", user.id, {})
    
    response.delete_cookie("session_token")
    return {"message": "Logged out"}


@app.get("/api/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current user info."""
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "org_id": user.org_id
    }


# ============================================================================
# Task Endpoints
# ============================================================================

@app.post("/api/tasks")
async def create_task(
    body: CreateTaskRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_role("admin", "operator"))
):
    """Create a new task."""
    clock = get_clock()
    
    # Check idempotency
    if body.idempotency_key:
        result = await session.execute(
            select(Task).where(
                Task.org_id == user.org_id,
                Task.idempotency_key == body.idempotency_key
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            return {"task_id": existing.id, "status": existing.status, "idempotent": True}
    
    # Get governance state
    result = await session.execute(
        select(DBGovernanceState).where(DBGovernanceState.org_id == user.org_id)
    )
    gov_state = result.scalar_one_or_none()
    
    if gov_state:
        # Check kill switch for automate mode
        if body.mode == "automate" and gov_state.kill_switch_active:
            # Log denial
            async with evented_uow(session, clock, ActorType.USER.value, user.id, user.org_id) as uow:
                uow.emit_event(
                    EventType.ACTION_DENIED.value, "task", "none",
                    {"reason": "kill_switch", "mode": body.mode, "bot": body.bot}
                )
            raise HTTPException(status_code=403, detail="Kill switch is active")
    
    task_id = generate_id()
    task = Task(
        id=task_id,
        created_ts=clock.now_iso(),
        created_by=user.id,
        org_id=user.org_id,
        mode=body.mode,
        bot=body.bot,
        action=body.action,
        input_json=canonical_json(body.input_data),
        status="pending",
        attempts=0,
        idempotency_key=body.idempotency_key,
        available_at_ts=clock.now_iso()
    )
    
    async with evented_uow(session, clock, ActorType.USER.value, user.id, user.org_id) as uow:
        uow.add(task)
        uow.emit_event(
            EventType.TASK_CREATED.value, "task", task_id,
            {"mode": body.mode, "bot": body.bot, "action": body.action, "status": "pending"}
        )
    
    return {"task_id": task_id, "status": "pending"}


@app.get("/api/tasks")
async def list_tasks(
    status: Optional[str] = None,
    bot: Optional[str] = None,
    limit: int = 50,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user)
):
    """List tasks for the organization."""
    query = select(Task).where(Task.org_id == user.org_id)
    
    if status:
        query = query.where(Task.status == status)
    if bot:
        query = query.where(Task.bot == bot)
    
    query = query.order_by(Task.created_ts.desc()).limit(limit)
    
    result = await session.execute(query)
    tasks = result.scalars().all()
    
    return {
        "tasks": [
            {
                "id": t.id,
                "created_ts": t.created_ts,
                "mode": t.mode,
                "bot": t.bot,
                "action": t.action,
                "status": t.status,
                "attempts": t.attempts,
                "result": json.loads(t.result_json) if t.result_json else None,
                "error": json.loads(t.error_json) if t.error_json else None,
            }
            for t in tasks
        ]
    }


@app.get("/api/tasks/{task_id}")
async def get_task(
    task_id: str,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user)
):
    """Get task details."""
    result = await session.execute(
        select(Task).where(Task.id == task_id, Task.org_id == user.org_id)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {
        "id": task.id,
        "created_ts": task.created_ts,
        "created_by": task.created_by,
        "mode": task.mode,
        "bot": task.bot,
        "action": task.action,
        "input": json.loads(task.input_json),
        "status": task.status,
        "result": json.loads(task.result_json) if task.result_json else None,
        "error": json.loads(task.error_json) if task.error_json else None,
        "attempts": task.attempts,
        "worker_id": task.worker_id,
        "lease_expires_ts": task.lease_expires_ts,
    }


@app.post("/api/tasks/{task_id}/cancel")
async def cancel_task(
    task_id: str,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_role("admin", "operator"))
):
    """Cancel a pending task."""
    result = await session.execute(
        select(Task).where(Task.id == task_id, Task.org_id == user.org_id)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.status not in ("pending", "running"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel task in status: {task.status}")
    
    clock = get_clock()
    task.status = "cancelled"
    
    async with evented_uow(session, clock, ActorType.USER.value, user.id, user.org_id) as uow:
        uow.emit_event(
            EventType.TASK_CANCELLED.value, "task", task_id,
            {"cancelled_by": user.id}
        )
    
    return {"task_id": task_id, "status": "cancelled"}


# ============================================================================
# Events Endpoints
# ============================================================================

@app.get("/api/events")
async def list_events(
    event_type: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 100,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user)
):
    """List events for the organization."""
    query = select(DBEvent).where(DBEvent.org_id == user.org_id)
    
    if event_type:
        query = query.where(DBEvent.event_type == event_type)
    if entity_type:
        query = query.where(DBEvent.entity_type == entity_type)
    if entity_id:
        query = query.where(DBEvent.entity_id == entity_id)
    
    query = query.order_by(DBEvent.id.desc()).limit(limit)
    
    result = await session.execute(query)
    events = result.scalars().all()
    
    return {
        "events": [
            {
                "id": e.id,
                "ts": e.ts,
                "actor_type": e.actor_type,
                "actor_id": e.actor_id,
                "event_type": e.event_type,
                "entity_type": e.entity_type,
                "entity_id": e.entity_id,
                "payload": json.loads(e.payload_json),
                "hash": e.hash[:16] + "...",  # Truncated for display
            }
            for e in events
        ]
    }


@app.get("/api/events/verify")
async def verify_event_chain(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user)
):
    """Verify the event chain integrity."""
    result = await session.execute(
        select(DBEvent).where(DBEvent.org_id == user.org_id).order_by(DBEvent.id)
    )
    events = result.scalars().all()
    
    event_dicts = [
        {
            "id": e.id,
            "ts": e.ts,
            "actor_type": e.actor_type,
            "actor_id": e.actor_id,
            "org_id": e.org_id,
            "session_id": e.session_id,
            "event_type": e.event_type,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "payload_json": e.payload_json,
            "hash": e.hash,
            "prev_hash": e.prev_hash,
        }
        for e in events
    ]
    
    is_valid, error = compute_chain_verification(event_dicts)
    
    return {
        "valid": is_valid,
        "error": error,
        "event_count": len(events),
        "last_hash": events[-1].hash if events else GENESIS_HASH
    }


@app.get("/api/events/export")
async def export_events(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_role("admin", "operator"))
):
    """Export events as NDJSON."""
    result = await session.execute(
        select(DBEvent).where(DBEvent.org_id == user.org_id).order_by(DBEvent.id)
    )
    events = result.scalars().all()
    
    clock = get_clock()
    
    # Header record
    header = {
        "_type": "header",
        "schema_version": "1.0",
        "app_version": "0.1.0",
        "org_id": user.org_id,
        "exported_at": clock.now_iso(),
        "canonicalization": "jcs",
        "hash_algo": "sha256"
    }
    
    lines = [json.dumps(header)]
    
    for e in events:
        event_dict = {
            "id": e.id,
            "ts": e.ts,
            "actor_type": e.actor_type,
            "actor_id": e.actor_id,
            "org_id": e.org_id,
            "session_id": e.session_id,
            "event_type": e.event_type,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "payload_json": e.payload_json,
            "hash": e.hash,
            "prev_hash": e.prev_hash,
        }
        lines.append(json.dumps(event_dict))
    
    content = "\n".join(lines)
    
    return Response(
        content=content,
        media_type="application/x-ndjson",
        headers={"Content-Disposition": f"attachment; filename=events_{user.org_id}.ndjson"}
    )


# ============================================================================
# Governance Endpoints
# ============================================================================

@app.get("/api/governance")
async def get_governance(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user)
):
    """Get current governance state."""
    # Get policy
    result = await session.execute(
        select(Policy).where(Policy.org_id == user.org_id).order_by(Policy.version.desc()).limit(1)
    )
    policy = result.scalar_one_or_none()
    
    policy_config = PolicyConfig.default_safe()
    if policy:
        policy_config = PolicyConfig(**json.loads(policy.config_json))
    
    # Get governance state
    result = await session.execute(
        select(DBGovernanceState).where(DBGovernanceState.org_id == user.org_id)
    )
    gov_state = result.scalar_one_or_none()
    
    # Get active approvals
    clock = get_clock()
    result = await session.execute(
        select(Approval).where(
            Approval.org_id == user.org_id,
            Approval.revoked == False
        )
    )
    approvals = result.scalars().all()
    active_approvals = [
        {
            "id": a.id,
            "scope": a.scope,
            "expires_at": a.expires_at,
            "created_at": a.created_at,
        }
        for a in approvals
        if datetime.fromisoformat(a.expires_at.replace('Z', '+00:00')) > clock.now_utc()
    ]
    
    return {
        "policy": policy_config.model_dump(),
        "policy_version": policy.version if policy else 0,
        "kill_switch": {
            "active": gov_state.kill_switch_active if gov_state else False,
            "activated_at": gov_state.kill_switch_activated_at if gov_state else None,
            "activated_by": gov_state.kill_switch_activated_by if gov_state else None,
            "reason": gov_state.kill_switch_reason if gov_state else None,
        },
        "arm": {
            "armed": gov_state.arm_armed if gov_state else False,
            "armed_at": gov_state.arm_armed_at if gov_state else None,
            "armed_by": gov_state.arm_armed_by if gov_state else None,
            "expires_at": gov_state.arm_expires_at if gov_state else None,
        },
        "approvals": active_approvals
    }


@app.put("/api/governance/policy")
async def update_policy(
    body: UpdatePolicyRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_role("admin"))
):
    """Update organization policy."""
    clock = get_clock()
    
    # Get current policy
    result = await session.execute(
        select(Policy).where(Policy.org_id == user.org_id).order_by(Policy.version.desc()).limit(1)
    )
    current_policy = result.scalar_one_or_none()
    
    if current_policy:
        config = PolicyConfig(**json.loads(current_policy.config_json))
        new_version = current_policy.version + 1
    else:
        config = PolicyConfig.default_safe()
        new_version = 1
    
    # Update fields
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)
    
    # Create new policy record
    new_policy = Policy(
        id=generate_id(),
        org_id=user.org_id,
        version=new_version,
        config_json=canonical_json(config.model_dump()),
        created_at=clock.now_iso(),
        created_by=user.id
    )
    
    async with evented_uow(session, clock, ActorType.USER.value, user.id, user.org_id) as uow:
        uow.add(new_policy)
        uow.emit_event(
            EventType.POLICY_UPDATED.value, "policy", new_policy.id,
            {"version": new_version, "changes": update_data}
        )
    
    return {"policy_id": new_policy.id, "version": new_version}


@app.post("/api/governance/kill-switch")
async def toggle_kill_switch(
    body: KillSwitchRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_role("admin"))
):
    """Activate or deactivate kill switch."""
    clock = get_clock()
    
    result = await session.execute(
        select(DBGovernanceState).where(DBGovernanceState.org_id == user.org_id)
    )
    gov_state = result.scalar_one_or_none()
    
    if not gov_state:
        gov_state = DBGovernanceState(
            id=generate_id(),
            org_id=user.org_id
        )
        session.add(gov_state)
    
    gov_state.kill_switch_active = body.active
    if body.active:
        gov_state.kill_switch_activated_at = clock.now_iso()
        gov_state.kill_switch_activated_by = user.id
        gov_state.kill_switch_reason = body.reason
        event_type = EventType.KILL_SWITCH_ACTIVATED.value
    else:
        event_type = EventType.KILL_SWITCH_DEACTIVATED.value
    
    async with evented_uow(session, clock, ActorType.USER.value, user.id, user.org_id) as uow:
        uow.emit_event(
            event_type, "governance", user.org_id,
            {"active": body.active, "reason": body.reason}
        )
    
    return {"kill_switch_active": body.active}


@app.post("/api/governance/arm")
async def toggle_arm(
    body: ArmRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_role("admin"))
):
    """Enable ARM toggle with expiry."""
    clock = get_clock()
    
    result = await session.execute(
        select(DBGovernanceState).where(DBGovernanceState.org_id == user.org_id)
    )
    gov_state = result.scalar_one_or_none()
    
    if not gov_state:
        gov_state = DBGovernanceState(
            id=generate_id(),
            org_id=user.org_id
        )
        session.add(gov_state)
    
    expires = clock.now_utc() + timedelta(minutes=body.expires_in_minutes)
    
    gov_state.arm_armed = True
    gov_state.arm_armed_at = clock.now_iso()
    gov_state.arm_armed_by = user.id
    gov_state.arm_expires_at = expires.isoformat().replace('+00:00', 'Z')
    
    async with evented_uow(session, clock, ActorType.USER.value, user.id, user.org_id) as uow:
        uow.emit_event(
            EventType.ARM_ENABLED.value, "governance", user.org_id,
            {"expires_at": gov_state.arm_expires_at, "expires_in_minutes": body.expires_in_minutes}
        )
    
    return {"armed": True, "expires_at": gov_state.arm_expires_at}


@app.delete("/api/governance/arm")
async def disarm(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_role("admin"))
):
    """Disable ARM toggle."""
    clock = get_clock()
    
    result = await session.execute(
        select(DBGovernanceState).where(DBGovernanceState.org_id == user.org_id)
    )
    gov_state = result.scalar_one_or_none()
    
    if gov_state:
        gov_state.arm_armed = False
        gov_state.arm_expires_at = None
        
        async with evented_uow(session, clock, ActorType.USER.value, user.id, user.org_id) as uow:
            uow.emit_event(
                EventType.ARM_DISABLED.value, "governance", user.org_id, {}
            )
    
    return {"armed": False}


@app.post("/api/governance/approvals")
async def create_approval(
    body: CreateApprovalRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_role("admin"))
):
    """Create an approval for specific actions."""
    clock = get_clock()
    expires = clock.now_utc() + timedelta(hours=body.expires_in_hours)
    
    approval = Approval(
        id=generate_id(),
        org_id=user.org_id,
        approver_id=user.id,
        scope=body.scope,
        expires_at=expires.isoformat().replace('+00:00', 'Z'),
        created_at=clock.now_iso(),
        revoked=False
    )
    
    async with evented_uow(session, clock, ActorType.USER.value, user.id, user.org_id) as uow:
        uow.add(approval)
        uow.emit_event(
            EventType.APPROVAL_CREATED.value, "approval", approval.id,
            {"scope": body.scope, "expires_at": approval.expires_at}
        )
    
    return {"approval_id": approval.id, "expires_at": approval.expires_at}


@app.delete("/api/governance/approvals/{approval_id}")
async def revoke_approval(
    approval_id: str,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_role("admin"))
):
    """Revoke an approval."""
    clock = get_clock()
    
    result = await session.execute(
        select(Approval).where(Approval.id == approval_id, Approval.org_id == user.org_id)
    )
    approval = result.scalar_one_or_none()
    
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    
    approval.revoked = True
    approval.revoked_at = clock.now_iso()
    
    async with evented_uow(session, clock, ActorType.USER.value, user.id, user.org_id) as uow:
        uow.emit_event(
            EventType.APPROVAL_REVOKED.value, "approval", approval_id,
            {"scope": approval.scope}
        )
    
    return {"approval_id": approval_id, "revoked": True}


# ============================================================================
# Health Endpoints
# ============================================================================

@app.get("/health")
async def health():
    """Basic health check."""
    return {"status": "healthy"}


@app.get("/ready")
async def ready(session: AsyncSession = Depends(get_db_session)):
    """Readiness check including database."""
    try:
        await session.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "error": str(e)}
        )


@app.get("/api/metrics")
async def metrics(user: User = Depends(get_current_user)):
    """Get system metrics."""
    cpu_percent = psutil.cpu_percent()
    memory = psutil.virtual_memory()
    
    return {
        "cpu_percent": cpu_percent,
        "memory_percent": memory.percent,
        "memory_available_mb": memory.available / (1024 * 1024),
        "degraded": cpu_percent > 90 or memory.percent > 90
    }


# ============================================================================
# Demo Data Seeding
# ============================================================================

async def seed_demo_data():
    """Seed demo data if not exists."""
    async with get_session() as session:
        # Check if demo org exists
        result = await session.execute(
            select(Organization).where(Organization.id == DEMO_ORG_ID)
        )
        if result.scalar_one_or_none():
            return  # Already seeded
        
        clock = get_clock()
        
        # Create demo organization
        org = Organization(
            id=DEMO_ORG_ID,
            name="Nova Demo Organization",
            timezone="America/New_York",
            created_at=clock.now_iso(),
            updated_at=clock.now_iso()
        )
        session.add(org)
        
        # Create demo users
        admin_password = bcrypt.hashpw("admin123".encode(), bcrypt.gensalt()).decode()
        operator_password = bcrypt.hashpw("operator123".encode(), bcrypt.gensalt()).decode()
        viewer_password = bcrypt.hashpw("viewer123".encode(), bcrypt.gensalt()).decode()
        
        admin = User(
            id=DEMO_ADMIN_ID,
            org_id=DEMO_ORG_ID,
            username="admin",
            email="admin@nova-demo.local",
            password_hash=admin_password,
            role="admin",
            is_active=True,
            failed_login_attempts=0,
            created_at=clock.now_iso(),
            updated_at=clock.now_iso()
        )
        
        operator = User(
            id=DEMO_OPERATOR_ID,
            org_id=DEMO_ORG_ID,
            username="operator",
            email="operator@nova-demo.local",
            password_hash=operator_password,
            role="operator",
            is_active=True,
            failed_login_attempts=0,
            created_at=clock.now_iso(),
            updated_at=clock.now_iso()
        )
        
        viewer = User(
            id=DEMO_VIEWER_ID,
            org_id=DEMO_ORG_ID,
            username="viewer",
            email="viewer@nova-demo.local",
            password_hash=viewer_password,
            role="viewer",
            is_active=True,
            failed_login_attempts=0,
            created_at=clock.now_iso(),
            updated_at=clock.now_iso()
        )
        
        session.add_all([admin, operator, viewer])
        
        # Create default policy
        policy = Policy(
            id=DEMO_POLICY_ID,
            org_id=DEMO_ORG_ID,
            version=1,
            config_json=canonical_json(PolicyConfig.default_safe().model_dump()),
            created_at=clock.now_iso(),
            created_by=DEMO_ADMIN_ID
        )
        session.add(policy)
        
        # Create governance state
        gov_state = DBGovernanceState(
            id=generate_id(),
            org_id=DEMO_ORG_ID,
            kill_switch_active=False,
            arm_armed=False
        )
        session.add(gov_state)
        
        # Commit base data
        await session.commit()
        
        # Now emit creation events with proper hashing
        async with evented_uow(session, clock, ActorType.SYSTEM.value, "system", DEMO_ORG_ID) as uow:
            uow.emit_event(EventType.ORG_CREATED.value, "organization", DEMO_ORG_ID, {"name": org.name})
            uow.emit_event(EventType.USER_CREATED.value, "user", DEMO_ADMIN_ID, {"username": "admin", "role": "admin"})
            uow.emit_event(EventType.USER_CREATED.value, "user", DEMO_OPERATOR_ID, {"username": "operator", "role": "operator"})
            uow.emit_event(EventType.USER_CREATED.value, "user", DEMO_VIEWER_ID, {"username": "viewer", "role": "viewer"})
            uow.emit_event(EventType.POLICY_CREATED.value, "policy", DEMO_POLICY_ID, {"version": 1})


# ============================================================================
# Run Server
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.api_port)
