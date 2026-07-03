# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project overview

This repository is a small Python package modeling a "mind lattice": a high-dimensional cognitive space with simple dynamical rules for how minds move and interact. The core, non-placeholder logic lives under `mind_lattice/lattice`; other subpackages are stubs for future expansion.

### Core lattice model (`mind_lattice.lattice`)

- `space.py`
  - Defines `Axis`, a dataclass describing a single cognitive dimension (name, optional description, numeric bounds).
  - Defines `MindSpace`, which owns an ordered list of axes and provides:
    - Dimensionality via `dimension()`.
    - Coordinate validation (`validate_position`) against axis count and optional min/max bounds.
    - Simple helpers to generate the origin (`zero()`) and uniformly-sampled random points (`random_point()`) consistent with axis bounds.
- `mind_type.py`
  - Defines the `MindType` enum (e.g. `FORWARD`, `REVERSE`, `LATERAL`, `VERTICAL`, `HYBRID`) representing qualitative cognitive styles.
  - Associates each `MindType` with `MindTypeMetadata` describing "primary" and "secondary" axis names it emphasizes via the `MIND_TYPE_METADATA` mapping. These axis names are used conceptually and must match axes present in a `MindSpace` when you want a given mind type to affect them.
- `mind.py`
  - Defines the `Mind` dataclass representing a single agent in a `MindSpace`:
    - Stores `id`, `space`, `position` (converted to a list of floats and validated against `MindSpace`), `mind_type`, and dynamics parameters (`learning_rate`, `stability`, `exploration`).
    - Maintains an internal mapping from axis names to indices so dynamics can be written in terms of semantic axis names.
  - `_base_step(dt)` encodes deterministic motion rules per `MindType`, adjusting coordinates along specific named axes (e.g. `prediction`, `recursion`, `abstraction_mobility`). Only axes present in the current `MindSpace` actually move.
  - `step(dt=1.0)` combines:
    - The deterministic update from `_base_step`.
    - Optional exploratory noise scaled by `exploration` and inversely by `stability`.
    - Clamping back into any axis bounds defined on the `MindSpace` before re-validating and committing the new position.
  - Optionally interoperates with NumPy arrays if `numpy` is installed; otherwise it works entirely with Python sequences.
- `trajectory.py`
  - Defines `Trajectory`, which records time-stamped positions (`timestamps`, `positions`) for a single mind and can expose them as a NumPy array if available.
  - Provides small vector helpers (`_vector_diff`, `_norm`, `_cosine_similarity`) and two higher-level metrics:
    - `compute_velocity(trajectory)` for overall displacement.
    - `compute_emergence_score(space, trajectory)` for a heuristic scalar in [0, 1] combining:
      - Directional consistency of motion over time.
      - Net improvements along `coherence` and `complexity` axes.
      - Penalties for increases in `entropy_handling` when that axis exists in the `MindSpace`.
- `coupling.py`
  - Defines `CoupledMindSystem`, which holds two `Mind` instances plus their individual `Trajectory` objects.
  - `step(dt, t)` advances each mind independently via `Mind.step`, then applies a symmetric coupling term that nudges both positions toward each other by a fraction (`coupling_strength`) of their difference, followed by validation and trajectory recording.
  - Provides higher-level diagnostics over the paired trajectories:
    - `convergence()` maps average inter-mind distance over time into a scalar in (0, 1].
    - `divergence()` measures how much final distance exceeds initial distance.
    - `emergence_score()` combines directional alignment of net velocities (via cosine similarity) with convergence into another scalar in [0, 1].

### Other subpackages (currently placeholders)

These modules exist to outline the future architecture but currently contain only minimal docstrings:

- `mind_lattice.identity.identity_engine` – planned to distill trajectories into summarized identities.
- `mind_lattice.dyad.dyad_loop` – planned to host a multi-step NOVA dyad interaction loop.
- `mind_lattice.growth.growth_engine` – planned for recursive rule-based improvement and growth dynamics.
- `mind_lattice.ui.cli` – intended as the command-line entry point for demos once the lattice and coupling models stabilize.

The expectation is that these higher-level systems will be built on top of the primitives in `mind_lattice.lattice` (spaces, minds, trajectories, coupled systems) without duplicating low-level math.

### Tests

- Tests live in `tests/test_lattice_core.py` and currently cover:
  - Basic `MindSpace` dimensionality and validation/error paths.
  - `Mind.step` behavior for `MindType.FORWARD` in a 4D space.
  - `CoupledMindSystem` stepping and convergence behavior over a short trajectory.
- Tests are written using the standard library `unittest` framework (no external test runner dependency).

## Commands

All commands below assume you are in the repository root (the directory containing the `mind_lattice` and `tests` folders) and have a suitable Python interpreter on your PATH.

### Run tests

- Run the full test suite (currently a single module):

  ```bash
  python -m unittest
  ```

- Run tests from just the core lattice test module:

  ```bash
  python -m unittest tests.test_lattice_core
  ```

- Run an individual test method (example: `MindSpace` validation test):

  ```bash
  python -m unittest tests.test_lattice_core.MindSpaceTests.test_dimension_and_validation
  ```

### Linting, formatting, and build

- This repository does not currently define any tooling configuration files for linting, formatting, or packaging (e.g., no `pyproject.toml`, `setup.cfg`, or similar). Do not assume tools like `ruff`, `flake8`, or `black` are configured.
- If you introduce such tools, keep their configuration files in the repo root so future agents can discover and document the appropriate commands here.

### Running CLI entry points

- The CLI module exists but is currently a placeholder; it can still be executed to validate import paths and packaging assumptions:

  ```bash
  python -m mind_lattice.ui.cli
  ```

  As of now this only imports the module and exits; future demo commands should be wired up here.
