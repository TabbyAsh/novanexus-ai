"""Coupled mind dynamics for the mind lattice."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List
import math

from .mind import Mind
from .trajectory import Trajectory, _norm, _vector_diff, _cosine_similarity


@dataclass
class CoupledMindSystem:
    """Two minds whose trajectories influence each other.

    The coupling is implemented as a gentle pull of each mind's position
    toward the other's position after each independent update step.
    """

    mind_a: Mind
    mind_b: Mind
    coupling_strength: float = 0.1
    trajectory_a: Trajectory = field(default_factory=Trajectory)
    trajectory_b: Trajectory = field(default_factory=Trajectory)

    def __post_init__(self) -> None:
        if not (0.0 <= self.coupling_strength <= 1.0):
            raise ValueError("coupling_strength must be in [0, 1].")

    def step(self, dt: float = 1.0, t: float = 0.0) -> None:
        """Advance both minds by one time step and record their positions.

        The update consists of:

        1. Each mind performs its own :meth:`Mind.step`.
        2. A symmetric coupling term nudges both positions slightly toward
           each other, scaled by ``coupling_strength``.
        """

        # Independent updates.
        self.mind_a.step(dt=dt)
        self.mind_b.step(dt=dt)

        # Coupling: move each mind a fraction toward the other's position.
        a_pos = list(self.mind_a.position)
        b_pos = list(self.mind_b.position)
        delta = [bi - ai for ai, bi in zip(a_pos, b_pos)]

        for i in range(len(a_pos)):
            a_pos[i] += 0.5 * self.coupling_strength * delta[i]
            b_pos[i] -= 0.5 * self.coupling_strength * delta[i]

        # Clamp via each mind's space.
        self.mind_a.position = a_pos
        self.mind_a.space.validate_position(self.mind_a.position)
        self.mind_b.position = b_pos
        self.mind_b.space.validate_position(self.mind_b.position)

        # Record trajectories.
        self.trajectory_a.record(t, self.mind_a.position)
        self.trajectory_b.record(t, self.mind_b.position)

    def _pairwise_distances(self) -> List[float]:
        return [
            _norm(_vector_diff(a, b))
            for a, b in zip(self.trajectory_a.positions, self.trajectory_b.positions)
        ]

    def convergence(self) -> float:
        """Return a simple convergence score in [0, 1].

        Lower average distance between minds corresponds to higher
        convergence. The score is defined as ``1 / (1 + d_avg)``.
        """

        if not self.trajectory_a.positions:
            return 0.0
        dists = self._pairwise_distances()
        avg = sum(dists) / len(dists)
        return float(1.0 / (1.0 + avg))

    def divergence(self) -> float:
        """Measure how much the minds have separated over time.

        Defined as ``max(d_final - d_initial, 0)`` where ``d_*`` are
        Euclidean distances between positions at the respective times.
        """

        if len(self.trajectory_a.positions) < 2:
            return 0.0
        first = _norm(
            _vector_diff(self.trajectory_a.positions[0], self.trajectory_b.positions[0])
        )
        last = _norm(
            _vector_diff(self.trajectory_a.positions[-1], self.trajectory_b.positions[-1])
        )
        return float(max(0.0, last - first))

    def emergence_score(self) -> float:
        """Combine convergence and directional coherence into one scalar.

        The score increases when minds move in similar directions (high
        cosine similarity of their net velocities) while remaining
        relatively close together (high convergence).
        """

        if len(self.trajectory_a.positions) < 2:
            return 0.0

        a_vel = _vector_diff(self.trajectory_a.positions[0], self.trajectory_a.positions[-1])
        b_vel = _vector_diff(self.trajectory_b.positions[0], self.trajectory_b.positions[-1])
        alignment = max(0.0, _cosine_similarity(a_vel, b_vel))

        conv = self.convergence()
        # Simple bounded combination.
        raw = 0.5 * alignment + 0.5 * conv
        return float(max(0.0, min(1.0, raw)))
