"""Mind representation for the mind lattice.

A :class:`Mind` is a point in :class:`~mind_lattice.lattice.space.MindSpace`
with simple, interpretable update rules depending on its :class:`MindType`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, MutableSequence, Optional, Sequence, Union
import math
import random

try:  # Optional numpy support for convenience, but not required.
    import numpy as np  # type: ignore

    ArrayLike = Union["np.ndarray", Sequence[float]]
except Exception:  # pragma: no cover - numpy is genuinely optional
    np = None  # type: ignore
    ArrayLike = Sequence[float]

from .mind_type import MindType
from .space import MindSpace


def _to_list(position: ArrayLike) -> List[float]:
    """Convert a supported position type to a plain Python list of floats."""

    if "np" in globals() and np is not None and isinstance(position, np.ndarray):
        return position.astype(float).tolist()
    return [float(x) for x in position]


def _apply_bounds(space: MindSpace, coords: MutableSequence[float]) -> None:
    """Clamp coordinates to the bounds defined by the space's axes."""

    for i, axis in enumerate(space.axes):
        if axis.min_value is not None:
            coords[i] = max(coords[i], axis.min_value)
        if axis.max_value is not None:
            coords[i] = min(coords[i], axis.max_value)


@dataclass
class Mind:
    """A single mind as a position plus simple dynamics.

    Parameters
    ----------
    id:
        Identifier for the mind, used for logging and debugging.
    space:
        The :class:`MindSpace` in which this mind lives.
    position:
        Initial position as a 1D list of floats or a NumPy array.
    mind_type:
        Cognitive style controlling how the mind moves in the space.
    learning_rate:
        Base scale for directed movement per unit time ``dt``.
    stability:
        Higher stability reduces the magnitude of random motion.
    exploration:
        Scale of exploratory noise added to motion.
    """

    id: str
    space: MindSpace
    position: List[float]
    mind_type: MindType
    learning_rate: float = 0.1
    stability: float = 0.8
    exploration: float = 0.05

    _axis_index: Dict[str, int] = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self.position = _to_list(self.position)
        self.space.validate_position(self.position)
        self._axis_index = {axis.name: i for i, axis in enumerate(self.space.axes)}

    def _axis(self, name: str) -> Optional[int]:
        """Return the index for a named axis, or ``None`` if not present."""

        return self._axis_index.get(name)

    def _move_along(self, coords: MutableSequence[float], axis_name: str, amount: float) -> None:
        """Apply a delta along a named axis if it exists in the space."""

        idx = self._axis(axis_name)
        if idx is not None:
            coords[idx] += amount

    def _base_step(self, dt: float) -> List[float]:
        """Compute the deterministic part of the update step.

        This method does not mutate :attr:`position`; it returns the proposed
        next coordinates before bounds and noise are applied.
        """

        coords = list(self.position)
        scale = self.learning_rate * dt

        if self.mind_type == MindType.FORWARD:
            # Push strongly along prediction and recursion.
            self._move_along(coords, "prediction", 1.5 * scale)
            self._move_along(coords, "recursion", 1.2 * scale)

        elif self.mind_type == MindType.REVERSE:
            # Start from outcomes: emphasize prediction and time direction.
            self._move_along(coords, "prediction", scale)
            self._move_along(coords, "time_directionality", 1.3 * scale)

        elif self.mind_type == MindType.LATERAL:
            # Small moves scanning patterns and abstractions.
            self._move_along(coords, "pattern_density", 0.5 * scale)
            self._move_along(coords, "abstraction_mobility", 0.5 * scale)

        elif self.mind_type == MindType.VERTICAL:
            # Move mostly along abstraction layers.
            self._move_along(coords, "abstraction_mobility", 1.4 * scale)

        elif self.mind_type == MindType.HYBRID:
            # Blend multiple tendencies and reinforce coherence/complexity.
            self._move_along(coords, "prediction", 0.9 * scale)
            self._move_along(coords, "recursion", 0.9 * scale)
            self._move_along(coords, "pattern_density", 0.6 * scale)
            self._move_along(coords, "abstraction_mobility", 0.8 * scale)
            self._move_along(coords, "coherence", 0.5 * scale)
            self._move_along(coords, "complexity", 0.5 * scale)

        return coords

    def step(self, dt: float = 1.0) -> None:
        """Advance the mind's position by one time step.

        The update is a combination of a deterministic component based on the
        :class:`MindType` and a small exploratory noise term.
        """

        coords = self._base_step(dt)

        # Add simple bounded noise for exploration.
        if self.exploration > 0.0:
            noise_scale = self.exploration * (1.0 - self.stability)
            for i in range(len(coords)):
                coords[i] += random.uniform(-1.0, 1.0) * noise_scale

        _apply_bounds(self.space, coords)
        self.space.validate_position(coords)
        self.position = coords

    def to_dict(self) -> Dict[str, object]:
        """Return a JSON-serializable representation of this mind."""

        return {
            "id": self.id,
            "mind_type": self.mind_type.value,
            "position": list(self.position),
            "learning_rate": self.learning_rate,
            "stability": self.stability,
            "exploration": self.exploration,
        }
