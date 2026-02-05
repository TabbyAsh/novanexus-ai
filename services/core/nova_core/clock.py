"""
Clock abstraction for deterministic time handling.
All time-dependent code must use this interface.
"""
from abc import ABC, abstractmethod
from datetime import datetime, timezone, timedelta
from typing import Optional
import pytz


class Clock(ABC):
    """Abstract clock interface for injectable time."""
    
    @abstractmethod
    def now(self) -> datetime:
        """Return current time in UTC."""
        pass
    
    @abstractmethod
    def now_utc(self) -> datetime:
        """Return current time in UTC (explicit)."""
        pass
    
    def now_iso(self) -> str:
        """Return current time as ISO8601 string."""
        return self.now_utc().isoformat().replace("+00:00", "Z")
    
    def now_in_tz(self, tz_name: str) -> datetime:
        """Return current time in specified timezone."""
        tz = pytz.timezone(tz_name)
        return self.now_utc().astimezone(tz)
    
    def start_of_day_in_tz(self, tz_name: str) -> datetime:
        """Return start of current day in specified timezone, as UTC."""
        tz = pytz.timezone(tz_name)
        local_now = self.now_utc().astimezone(tz)
        local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        return local_start.astimezone(timezone.utc)
    
    def end_of_day_in_tz(self, tz_name: str) -> datetime:
        """Return end of current day in specified timezone, as UTC."""
        tz = pytz.timezone(tz_name)
        local_now = self.now_utc().astimezone(tz)
        local_end = local_now.replace(hour=23, minute=59, second=59, microsecond=999999)
        return local_end.astimezone(timezone.utc)


class SystemClock(Clock):
    """Production clock using system time."""
    
    def now(self) -> datetime:
        return datetime.now(timezone.utc)
    
    def now_utc(self) -> datetime:
        return datetime.now(timezone.utc)


class FrozenClock(Clock):
    """
    Test clock with frozen time.
    Supports advancing time for testing temporal behavior.
    """
    
    def __init__(self, frozen_time: Optional[datetime] = None):
        if frozen_time is None:
            frozen_time = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        self._frozen_time = frozen_time
    
    def now(self) -> datetime:
        return self._frozen_time
    
    def now_utc(self) -> datetime:
        return self._frozen_time
    
    def advance(self, delta: timedelta) -> None:
        """Advance the frozen clock by the given timedelta."""
        self._frozen_time = self._frozen_time + delta
    
    def set_time(self, new_time: datetime) -> None:
        """Set the frozen clock to a specific time."""
        if new_time.tzinfo is None:
            new_time = new_time.replace(tzinfo=timezone.utc)
        self._frozen_time = new_time
    
    @classmethod
    def at(cls, year: int, month: int, day: int, 
           hour: int = 0, minute: int = 0, second: int = 0) -> "FrozenClock":
        """Create a frozen clock at a specific time."""
        return cls(datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc))


# Default clock instance - replaced in tests
_default_clock: Clock = SystemClock()


def get_clock() -> Clock:
    """Get the current clock instance."""
    return _default_clock


def set_clock(clock: Clock) -> None:
    """Set the clock instance (for testing)."""
    global _default_clock
    _default_clock = clock


def reset_clock() -> None:
    """Reset to system clock."""
    global _default_clock
    _default_clock = SystemClock()
