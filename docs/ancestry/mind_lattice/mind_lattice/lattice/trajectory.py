"""Trajectories and emergence metrics for minds in the lattice."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Sequence
import math

try:  # Optional numpy support for convenience.
    import numpy as np  # type: ignore
except Exception:  # pragma: no cover - numpy is optional
    np = None  # type: ignore

from .space import MindSpace


@dataclass
class Trajectory:
    """Time-ordered sequence of positions for a single mind."""

    timestamps: List[float] = field(default_factory=list)
    positions: List[List[float]] = field(default_factory=list)

    def record(self, t: float, position: Sequence[float]) -> None:
        """Append a new observation to the trajectory."""

        self.timestamps.append(float(t))
        self.positions.append([float(x) for x in position])

    def as_array(self):  # type: ignore[override]
        """Return trajectory as a NumPy array if available, else a list.

        The returned array has shape (T, D) where T is the number of
        recorded time steps and D is the dimensionality.
        """

        if np is None:
            return list(self.positions)
        return np.asarray(self.positions, dtype=float)


def _vector_diff(a: Sequence[float], b: Sequence[float]) -> List[float]:
    return [float(bi - ai) for ai, bi in zip(a, b)]


def _norm(vec: Sequence[float]) -> float:
    return math.sqrt(sum(float(x) * float(x) for x in vec))


def _cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    na = _norm(a)
    nb = _norm(b)
    if na == 0.0 or nb == 0.0:
        return 0.0
    dot = sum(float(x) * float(y) for x, y in zip(a, b))
    return dot / (na * nb)


def compute_velocity(trajectory: Trajectory) -> Optional[List[float]]:
    """Approximate the overall velocity of a trajectory.

    The velocity is defined as the difference between the last and first
    recorded positions. If fewer than two points are recorded, ``None`` is
    returned.
    """

    if len(trajectory.positions) < 2:
        return None
    return _vector_diff(trajectory.positions[0], trajectory.positions[-1])


def compute_emergence_score(space: MindSpace, trajectory: Trajectory) -> float:
    """Compute a simple heuristic emergence score for a trajectory.

    A higher score corresponds to:

    * movement that is directionally consistent over time, and
    * net increases in ``coherence`` and ``complexity`` axes, with
      reduced cost on ``entropy_handling``.
    """

    if len(trajectory.positions) < 2:
        return 0.0

    overall_vel = compute_velocity(trajectory)
    if overall_vel is None:
        return 0.0

    # Directional consistency: compare each step with the overall velocity.
    steps = [
        _vector_diff(a, b)
        for a, b in zip(trajectory.positions[:-1], trajectory.positions[1:])
    ]
    if not steps:
        return 0.0

    cos_scores = [_cosine_similarity(step, overall_vel) for step in steps]
    directional_consistency = max(0.0, sum(cos_scores) / len(cos_scores))

    # Axis-based improvement terms.
    axis_index = {axis.name: i for i, axis in enumerate(space.axes)}
    coh_idx = axis_index.get("coherence")
    cplx_idx = axis_index.get("complexity")
    ent_idx = axis_index.get("entropy_handling")

    def _axis_delta(idx: Optional[int]) -> float:
        if idx is None:
            return 0.0
        start = trajectory.positions[0][idx]
        end = trajectory.positions[-1][idx]
        return float(end - start)

    coherence_gain = _axis_delta(coh_idx)
    complexity_gain = _axis_delta(cplx_idx)
    entropy_change = _axis_delta(ent_idx)

    # Reward increased coherence/complexity and penalize increased entropy.
    structure_gain = coherence_gain + complexity_gain - 0.5 * max(entropy_change, 0.0)

    # Squash structure_gain to a reasonable range using tanh.
    structure_component = math.tanh(0.5 * structure_gain)

    # Combine components into a final score in roughly [0, 1].
    score = max(0.0, directional_consistency) * (0.5 + 0.5 * (structure_component + 1.0) / 2.0)
    return float(max(0.0, min(1.0, score)))
