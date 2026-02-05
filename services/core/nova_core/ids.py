"""
ID generation using UUIDv7 for time-ordered, stable identifiers.

UUIDv7 provides:
- Time-ordered (sortable)
- Unique across distributed systems
- Deterministic when seeded (for testing)
"""
from datetime import datetime, timezone
from typing import Optional
from uuid_extensions import uuid7
import uuid
import random
import threading


# Thread-local storage for deterministic ID generation in tests
_local = threading.local()


def _get_random_bytes(n: int) -> bytes:
    """Get random bytes, using seeded random if available."""
    if hasattr(_local, 'seeded_random'):
        return bytes(_local.seeded_random.getrandbits(8) for _ in range(n))
    return random.randbytes(n)


def generate_id() -> str:
    """Generate a new UUIDv7 identifier."""
    return str(uuid7.uuid7())


def generate_id_at(timestamp: datetime) -> str:
    """
    Generate a UUIDv7 at a specific timestamp.
    Useful for deterministic ID generation in tests.
    """
    # Convert to milliseconds since epoch
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    
    ms = int(timestamp.timestamp() * 1000)
    
    # Generate using uuid7's internal method with our timestamp
    # UUIDv7 format: 48-bit timestamp | 4-bit version | 12-bit rand_a | 2-bit variant | 62-bit rand_b
    rand_a = int.from_bytes(_get_random_bytes(2), 'big') & 0x0FFF
    rand_b = int.from_bytes(_get_random_bytes(8), 'big') & 0x3FFFFFFFFFFFFFFF
    
    uuid_int = (ms << 80) | (0x7 << 76) | (rand_a << 64) | (0x2 << 62) | rand_b
    
    return str(uuid.UUID(int=uuid_int))


def seed_id_generator(seed: int) -> None:
    """
    Seed the ID generator for deterministic tests.
    Call this at the start of tests that need reproducible IDs.
    """
    _local.seeded_random = random.Random(seed)


def reset_id_generator() -> None:
    """Reset to non-deterministic ID generation."""
    if hasattr(_local, 'seeded_random'):
        delattr(_local, 'seeded_random')


class DeterministicIdGenerator:
    """
    Context manager for deterministic ID generation in tests.
    
    Usage:
        with DeterministicIdGenerator(seed=42):
            id1 = generate_id()  # Deterministic
        id2 = generate_id()  # Random again
    """
    
    def __init__(self, seed: int = 42):
        self.seed = seed
    
    def __enter__(self):
        seed_id_generator(self.seed)
        return self
    
    def __exit__(self, *args):
        reset_id_generator()


# Fixed IDs for demo data (used across seeds)
DEMO_ORG_ID = "01234567-89ab-7def-8123-456789abcdef"
DEMO_ADMIN_ID = "01234567-89ab-7def-8123-456789abc001"
DEMO_OPERATOR_ID = "01234567-89ab-7def-8123-456789abc002"
DEMO_VIEWER_ID = "01234567-89ab-7def-8123-456789abc003"
DEMO_POLICY_ID = "01234567-89ab-7def-8123-456789abcfff"
