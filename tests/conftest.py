"""
Test configuration and fixtures for Nova Hub acceptance tests.

Provides:
- Frozen clock for deterministic time
- Seeded random for deterministic tests
- In-memory database
- Test client
"""
import os
import sys
import asyncio
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# Add service paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'services', 'api'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'services', 'core'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'services', 'bots'))

# Set test environment BEFORE imports
os.environ["NOVA_MODE"] = "nodocker"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["NOVA_ALLOW_REAL_ACTIONS"] = "false"

from nova_core.clock import FrozenClock, set_clock, reset_clock
from nova_core.ids import seed_id_generator, reset_id_generator


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
def frozen_clock():
    """Freeze time for deterministic tests."""
    clock = FrozenClock.at(2024, 1, 15, 12, 0, 0)
    set_clock(clock)
    yield clock
    reset_clock()


@pytest.fixture(autouse=True)
def seeded_random():
    """Seed random for deterministic tests."""
    seed_id_generator(42)
    yield
    reset_id_generator()


@pytest_asyncio.fixture
async def db_session():
    """Create test database and session."""
    from nova_api.database import init_database, reset_database, get_session
    
    await init_database()
    
    async with get_session() as session:
        yield session
    
    await reset_database()


@pytest_asyncio.fixture
async def client(db_session):
    """Create test client."""
    from nova_api.main import app
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def auth_client(client):
    """Create authenticated test client (admin user)."""
    # Login as admin
    response = await client.post("/api/auth/login", json={
        "username": "admin",
        "password": "admin123"
    })
    assert response.status_code == 200
    
    data = response.json()
    csrf_token = data["csrf_token"]
    
    # Add CSRF header to client
    client.headers["X-CSRF-Token"] = csrf_token
    
    yield client


@pytest_asyncio.fixture
async def operator_client(client):
    """Create authenticated test client (operator user)."""
    response = await client.post("/api/auth/login", json={
        "username": "operator",
        "password": "operator123"
    })
    assert response.status_code == 200
    
    data = response.json()
    csrf_token = data["csrf_token"]
    client.headers["X-CSRF-Token"] = csrf_token
    
    yield client


@pytest_asyncio.fixture
async def viewer_client(client):
    """Create authenticated test client (viewer user)."""
    response = await client.post("/api/auth/login", json={
        "username": "viewer",
        "password": "viewer123"
    })
    assert response.status_code == 200
    
    data = response.json()
    csrf_token = data["csrf_token"]
    client.headers["X-CSRF-Token"] = csrf_token
    
    yield client
