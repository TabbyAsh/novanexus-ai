"""MindSpace and Axis definitions for the mind lattice.

Implements a high-dimensional cognitive lattice where each axis represents
one cognitive feature (e.g. complexity, coherence, prediction).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Sequence
import random


@dataclass
class Axis:
    """Represents a single axis in the cognitive lattice.

    Parameters
    ----------
    name:
        Short identifier for the axis (e.g. "complexity", "coherence").
    description:
        Optional human-readable description of what the axis encodes.
    min_value / max_value:
        Optional numeric bounds used for validation and simple sampling.
    """

    name: str
    description: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None


class MindSpace:
    """High-dimensional space of possible minds.

    The space is defined by an ordered collection of :class:`Axis` objects.
    Positions in this space are represented as coordinate vectors where each
    coordinate corresponds to one axis.
    """

    def __init__(self, axes: Sequence[Axis]):
        if not axes:
            raise ValueError("MindSpace requires at least one axis.")
        self._axes: List[Axis] = list(axes)

    @property
    def axes(self) -> List[Axis]:
        """Return the list of axes defining this space."""

        return list(self._axes)

    def dimension(self) -> int:
        """Return the number of axes (dimensionality) of the space."""

        return len(self._axes)

    def validate_position(self, coords: Sequence[float]) -> None:
        """Validate that ``coords`` is a valid position in this space.

        Parameters
        ----------
        coords:
            Sequence of coordinate values. Length must match the number of
            axes; each value is optionally checked against axis bounds.

        Raises
        ------
        ValueError
            If the dimensionality is incorrect or a value violates bounds.
        """

        if len(coords) != self.dimension():
            raise ValueError(
                f"Expected {self.dimension()} dimensions, got {len(coords)}."
            )

        for axis, value in zip(self._axes, coords):
            if axis.min_value is not None and value < axis.min_value:
                raise ValueError(
                    f"Value {value} for axis '{axis.name}' is below minimum "
                    f"{axis.min_value}."
                )
            if axis.max_value is not None and value > axis.max_value:
                raise ValueError(
                    f"Value {value} for axis '{axis.name}' is above maximum "
                    f"{axis.max_value}."
                )

    def zero(self) -> List[float]:
        """Return the origin (all-zero) coordinate for this space."""

        return [0.0] * self.dimension()

    def random_point(self) -> List[float]:
        """Sample a simple random point in the space.

        If an axis defines ``min_value``/``max_value``, the coordinate is
        sampled uniformly from that interval. Otherwise a default range of
        [-1.0, 1.0] is used.
        """

        coords: List[float] = []
        for axis in self._axes:
            low = axis.min_value if axis.min_value is not None else -1.0
            high = axis.max_value if axis.max_value is not None else 1.0
            coords.append(random.uniform(low, high))
        return coords
