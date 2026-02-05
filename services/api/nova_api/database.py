"""
Database setup with async SQLAlchemy.

Includes:
- Engine and session factory
- Append-only triggers for events table
- Database initialization
"""
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession, 
    create_async_engine, 
    async_sessionmaker
)
from sqlalchemy import text, event
from sqlalchemy.pool import StaticPool

from nova_api.config import get_settings
from nova_api.models import Base


# Global engine and session factory
_engine = None
_async_session_factory = None


def get_database_url() -> str:
    """Get the appropriate database URL based on mode."""
    settings = get_settings()
    
    if settings.nova_mode == "docker":
        # PostgreSQL for docker mode
        return os.environ.get(
            "DATABASE_URL",
            "postgresql+asyncpg://nova:nova_dev_password@localhost:5432/nova"
        )
    else:
        # SQLite for nodocker mode
        # Ensure data directory exists
        os.makedirs("./data", exist_ok=True)
        return "sqlite+aiosqlite:///./data/nova.db"


def create_engine():
    """Create the async database engine."""
    global _engine
    
    url = get_database_url()
    
    if "sqlite" in url:
        _engine = create_async_engine(
            url,
            echo=False,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    else:
        _engine = create_async_engine(
            url,
            echo=False,
            pool_size=5,
            max_overflow=10,
        )
    
    return _engine


def get_engine():
    """Get or create the database engine."""
    global _engine
    if _engine is None:
        _engine = create_engine()
    return _engine


def get_session_factory():
    """Get or create the session factory."""
    global _async_session_factory
    if _async_session_factory is None:
        engine = get_engine()
        _async_session_factory = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _async_session_factory


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get an async database session."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_database():
    """Initialize database tables and triggers."""
    engine = get_engine()
    
    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)
        
        # Install append-only triggers
        url = str(engine.url)
        if "sqlite" in url:
            await _install_sqlite_triggers(conn)
        else:
            await _install_postgres_triggers(conn)


async def _install_sqlite_triggers(conn):
    """Install SQLite triggers to prevent UPDATE/DELETE on events."""
    
    # Trigger to prevent UPDATE on events
    await conn.execute(text("""
        CREATE TRIGGER IF NOT EXISTS prevent_events_update
        BEFORE UPDATE ON events
        BEGIN
            SELECT RAISE(ABORT, 'UPDATE not allowed on events table');
        END
    """))
    
    # Trigger to prevent DELETE on events
    await conn.execute(text("""
        CREATE TRIGGER IF NOT EXISTS prevent_events_delete
        BEFORE DELETE ON events
        BEGIN
            SELECT RAISE(ABORT, 'DELETE not allowed on events table');
        END
    """))


async def _install_postgres_triggers(conn):
    """Install PostgreSQL triggers to prevent UPDATE/DELETE on events."""
    
    # Create the trigger function
    await conn.execute(text("""
        CREATE OR REPLACE FUNCTION prevent_events_modification()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'Modification not allowed on events table';
        END;
        $$ LANGUAGE plpgsql
    """))
    
    # Drop existing triggers if they exist
    await conn.execute(text("""
        DROP TRIGGER IF EXISTS prevent_events_update ON events
    """))
    await conn.execute(text("""
        DROP TRIGGER IF EXISTS prevent_events_delete ON events
    """))
    
    # Create UPDATE trigger
    await conn.execute(text("""
        CREATE TRIGGER prevent_events_update
        BEFORE UPDATE ON events
        FOR EACH ROW
        EXECUTE FUNCTION prevent_events_modification()
    """))
    
    # Create DELETE trigger
    await conn.execute(text("""
        CREATE TRIGGER prevent_events_delete
        BEFORE DELETE ON events
        FOR EACH ROW
        EXECUTE FUNCTION prevent_events_modification()
    """))


async def close_database():
    """Close database connections."""
    global _engine, _async_session_factory
    
    if _engine:
        await _engine.dispose()
        _engine = None
    
    _async_session_factory = None


async def reset_database():
    """Reset database (for testing only)."""
    engine = get_engine()
    
    async with engine.begin() as conn:
        # Drop triggers first (SQLite)
        url = str(engine.url)
        if "sqlite" in url:
            await conn.execute(text("DROP TRIGGER IF EXISTS prevent_events_update"))
            await conn.execute(text("DROP TRIGGER IF EXISTS prevent_events_delete"))
        
        # Drop and recreate all tables
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        
        # Reinstall triggers
        if "sqlite" in url:
            await _install_sqlite_triggers(conn)
        else:
            await _install_postgres_triggers(conn)
