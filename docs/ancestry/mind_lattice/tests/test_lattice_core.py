"""Minimal tests for the core lattice and coupling components."""

from __future__ import annotations

import math
import unittest

from mind_lattice.lattice.space import Axis, MindSpace
from mind_lattice.lattice.mind_type import MindType
from mind_lattice.lattice.mind import Mind
from mind_lattice.lattice.coupling import CoupledMindSystem


class MindSpaceTests(unittest.TestCase):
    def test_dimension_and_validation(self) -> None:
        space = MindSpace([
            Axis("complexity", min_value=0.0, max_value=10.0),
            Axis("coherence", min_value=-1.0, max_value=1.0),
        ])
        self.assertEqual(space.dimension(), 2)

        space.validate_position([5.0, 0.0])  # Should not raise.

        with self.assertRaises(ValueError):
            space.validate_position([1.0])

        with self.assertRaises(ValueError):
            space.validate_position([11.0, 0.0])


class MindTests(unittest.TestCase):
    def _build_space(self) -> MindSpace:
        return MindSpace([
            Axis("complexity", min_value=0.0, max_value=10.0),
            Axis("coherence", min_value=-1.0, max_value=10.0),
            Axis("prediction", min_value=0.0, max_value=10.0),
            Axis("recursion", min_value=0.0, max_value=10.0),
        ])

    def test_forward_mind_moves_along_prediction_and_recursion(self) -> None:
        space = self._build_space()
        mind = Mind(
            id="m1",
            space=space,
            position=[1.0, 1.0, 1.0, 1.0],
            mind_type=MindType.FORWARD,
            learning_rate=0.5,
            stability=1.0,  # Disable noise.
            exploration=0.0,
        )

        mind.step(dt=1.0)
        # Complexity and coherence unchanged; prediction/recursion increased.
        self.assertAlmostEqual(mind.position[0], 1.0)
        self.assertAlmostEqual(mind.position[1], 1.0)
        self.assertGreater(mind.position[2], 1.0)
        self.assertGreater(mind.position[3], 1.0)


class CouplingTests(unittest.TestCase):
    def _build_space(self) -> MindSpace:
        return MindSpace([
            Axis("complexity", min_value=0.0, max_value=10.0),
            Axis("coherence", min_value=0.0, max_value=10.0),
            Axis("prediction", min_value=0.0, max_value=10.0),
        ])

    def test_coupling_reduces_distance(self) -> None:
        space = self._build_space()
        a = Mind(
            id="A",
            space=space,
            position=[1.0, 1.0, 1.0],
            mind_type=MindType.FORWARD,
            learning_rate=0.0,
            stability=1.0,
            exploration=0.0,
        )
        b = Mind(
            id="B",
            space=space,
            position=[5.0, 5.0, 5.0],
            mind_type=MindType.FORWARD,
            learning_rate=0.0,
            stability=1.0,
            exploration=0.0,
        )

        system = CoupledMindSystem(mind_a=a, mind_b=b, coupling_strength=0.5)

        # Initial step just records coupled positions.
        system.step(dt=1.0, t=0.0)
        self.assertEqual(len(system.trajectory_a.positions), 1)
        self.assertEqual(len(system.trajectory_b.positions), 1)

        # After a few steps, convergence score should be reasonably high.
        for i in range(5):
            system.step(dt=1.0, t=float(i + 1))

        conv = system.convergence()
        self.assertGreater(conv, 0.5)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
