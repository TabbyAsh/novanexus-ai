"""
SQLAlchemy models for Nova Hub.

All tables support append-only events table with triggers.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column, String, Text, Integer, Boolean, DateTime, 
    ForeignKey, UniqueConstraint, Index, event
)
from sqlalchemy.orm import DeclarativeBase, relationship, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


class Organization(Base):
    """Organization/tenant model."""
    __tablename__ = "organizations"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(30), nullable=False)
    
    # Relationships
    users = relationship("User", back_populates="organization")
    policies = relationship("Policy", back_populates="organization")
    tasks = relationship("Task", back_populates="organization")


class User(Base):
    """User model with authentication."""
    __tablename__ = "users"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="viewer")  # admin, operator, viewer
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(30), nullable=False)
    
    # Relationships
    organization = relationship("Organization", back_populates="users")
    sessions = relationship("Session", back_populates="user")


class Session(Base):
    """Server-side session for auth."""
    __tablename__ = "sessions"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    csrf_token: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)
    expires_at: Mapped[str] = mapped_column(String(30), nullable=False)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Relationships
    user = relationship("User", back_populates="sessions")


class Event(Base):
    """
    Append-only event log.
    
    Database triggers prevent UPDATE and DELETE.
    Forms a hash chain per organization.
    """
    __tablename__ = "events"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    ts: Mapped[str] = mapped_column(String(30), nullable=False)
    actor_type: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False)
    session_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False)
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    
    __table_args__ = (
        Index("ix_events_org_id", "org_id"),
        Index("ix_events_org_ts", "org_id", "ts"),
        Index("ix_events_entity", "entity_type", "entity_id"),
    )


class Policy(Base):
    """Organization policy configuration."""
    __tablename__ = "policies"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    config_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)
    
    # Relationships
    organization = relationship("Organization", back_populates="policies")
    
    __table_args__ = (
        Index("ix_policies_org_version", "org_id", "version"),
    )


class Approval(Base):
    """Approval records for actions requiring authorization."""
    __tablename__ = "approvals"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False)
    approver_id: Mapped[str] = mapped_column(String(36), nullable=False)
    scope: Mapped[str] = mapped_column(String(100), nullable=False)
    expires_at: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    revoked_at: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    
    __table_args__ = (
        Index("ix_approvals_org_scope", "org_id", "scope"),
    )


class GovernanceState(Base):
    """Global governance state (kill switch, ARM)."""
    __tablename__ = "governance_state"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    kill_switch_active: Mapped[bool] = mapped_column(Boolean, default=False)
    kill_switch_activated_at: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    kill_switch_activated_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    kill_switch_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    arm_armed: Mapped[bool] = mapped_column(Boolean, default=False)
    arm_armed_at: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    arm_armed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    arm_expires_at: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)


class Task(Base):
    """Task queue for bot orchestration."""
    __tablename__ = "tasks"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    created_ts: Mapped[str] = mapped_column(String(30), nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)
    org_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)  # recommend/assist/automate
    bot: Mapped[str] = mapped_column(String(20), nullable=False)  # trade/store/social/ops
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    input_json: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    result_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    worker_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    lease_expires_ts: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    available_at_ts: Mapped[str] = mapped_column(String(30), nullable=False)
    
    # Relationships
    organization = relationship("Organization", back_populates="tasks")
    
    __table_args__ = (
        UniqueConstraint("org_id", "idempotency_key", name="uq_task_idempotency"),
        Index("ix_tasks_status", "status"),
        Index("ix_tasks_available", "status", "available_at_ts"),
    )


class OrgLock(Base):
    """Lock table for SQLite single-writer enforcement."""
    __tablename__ = "org_locks"
    
    org_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    locked_at: Mapped[str] = mapped_column(String(30), nullable=False)


# Trade-related models
class TradePosition(Base):
    """Paper trading positions."""
    __tablename__ = "trade_positions"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    side: Mapped[str] = mapped_column(String(10), nullable=False)  # long/short
    quantity: Mapped[str] = mapped_column(String(30), nullable=False)  # decimal string
    entry_price: Mapped[str] = mapped_column(String(30), nullable=False)
    current_price: Mapped[str] = mapped_column(String(30), nullable=False)
    pnl: Mapped[str] = mapped_column(String(30), nullable=False)
    opened_at: Mapped[str] = mapped_column(String(30), nullable=False)
    closed_at: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open")


class TradeOrder(Base):
    """Paper trading orders."""
    __tablename__ = "trade_orders"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    side: Mapped[str] = mapped_column(String(10), nullable=False)  # buy/sell
    order_type: Mapped[str] = mapped_column(String(20), nullable=False)  # market/limit
    quantity: Mapped[str] = mapped_column(String(30), nullable=False)
    price: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)
    filled_at: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    filled_price: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)


# Store-related models
class Product(Base):
    """Store product listings."""
    __tablename__ = "products"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku: Mapped[str] = mapped_column(String(100), nullable=False)
    cost: Mapped[str] = mapped_column(String(30), nullable=False)
    price: Mapped[str] = mapped_column(String(30), nullable=False)
    margin: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft/review/listed
    supplier_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(30), nullable=False)


class StoreOrder(Base):
    """Store orders (simulated)."""
    __tablename__ = "store_orders"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False)
    product_id: Mapped[str] = mapped_column(String(36), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    total: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="placed")  # placed/paid/shipped/delivered
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(30), nullable=False)


# Social-related models
class ContentCalendar(Base):
    """Social media content calendar."""
    __tablename__ = "content_calendar"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[str] = mapped_column(String(50), nullable=False)
    scheduled_at: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft/scheduled/posted
    posted_at: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(30), nullable=False)


# Daily tracking
class DailyBudget(Base):
    """Daily budget tracking per org."""
    __tablename__ = "daily_budgets"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    org_id: Mapped[str] = mapped_column(String(36), nullable=False)
    date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD in org timezone
    spend: Mapped[str] = mapped_column(String(30), default="0.00")
    loss: Mapped[str] = mapped_column(String(30), default="0.00")
    orders: Mapped[int] = mapped_column(Integer, default=0)
    
    __table_args__ = (
        UniqueConstraint("org_id", "date", name="uq_daily_budget"),
    )
