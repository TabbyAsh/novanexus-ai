"""
Base bot class with common functionality.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from decimal import Decimal
import random
import json


@dataclass
class BotResult:
    """Result from bot execution."""
    success: bool
    data: Dict[str, Any]
    error: Optional[str] = None
    steps: List[Dict[str, Any]] = None
    
    def __post_init__(self):
        if self.steps is None:
            self.steps = []
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "data": self.data,
            "error": self.error,
            "steps": self.steps
        }


class BaseBot(ABC):
    """
    Base class for all bots.
    
    Provides:
    - Seeded random for deterministic simulations
    - Step logging for audit trail
    - Common result formatting
    """
    
    def __init__(self, seed: Optional[int] = None):
        self.random = random.Random(seed) if seed is not None else random.Random()
        self._steps: List[Dict[str, Any]] = []
    
    def log_step(self, action: str, details: Dict[str, Any]) -> None:
        """Log a step in the bot's execution."""
        self._steps.append({
            "action": action,
            "details": details
        })
    
    def reset_steps(self) -> None:
        """Reset step log for new execution."""
        self._steps = []
    
    def get_steps(self) -> List[Dict[str, Any]]:
        """Get logged steps."""
        return self._steps.copy()
    
    @abstractmethod
    async def execute(self, action: str, input_data: Dict[str, Any]) -> BotResult:
        """Execute a bot action."""
        pass
    
    def _decimal_str(self, value: float, precision: int = 2) -> str:
        """Format float as decimal string for JSON safety."""
        return f"{value:.{precision}f}"
