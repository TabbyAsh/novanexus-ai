"""MindType definitions for the mind lattice.

Each type represents a qualitative "shape" of cognition, indicating how
it tends to move through the MindSpace.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List


class MindType(str, Enum):
    """High-level cognitive style of a mind.

    The enum values are chosen to be descriptive and stable identifiers
    suitable for logging and serialization.
    """

    FORWARD = "FORWARD"
    REVERSE = "REVERSE"
    LATERAL = "LATERAL"
    VERTICAL = "VERTICAL"
    HYBRID = "HYBRID"


@dataclass(frozen=True)
class MindTypeMetadata:
    """Metadata describing which axes a :class:`MindType` emphasizes.

    Attributes
    ----------
    primary_axes:
        Names of axes this type tends to move along most strongly.
    secondary_axes:
        Axes that receive weaker but still meaningful emphasis.
    """

    primary_axes: List[str]
    secondary_axes: List[str]


MIND_TYPE_METADATA: Dict[MindType, MindTypeMetadata] = {
    MindType.FORWARD: MindTypeMetadata(
        primary_axes=["prediction", "recursion"],
        secondary_axes=["complexity", "coherence"],
    ),
    MindType.REVERSE: MindTypeMetadata(
        primary_axes=["prediction", "time_directionality"],
        secondary_axes=["abstraction_mobility"],
    ),
    MindType.LATERAL: MindTypeMetadata(
        primary_axes=["pattern_density", "abstraction_mobility"],
        secondary_axes=["attention_distribution"],
    ),
    MindType.VERTICAL: MindTypeMetadata(
        primary_axes=["abstraction_mobility"],
        secondary_axes=["complexity", "coherence"],
    ),
    MindType.HYBRID: MindTypeMetadata(
        primary_axes=[
            "prediction",
            "recursion",
            "pattern_density",
            "abstraction_mobility",
        ],
        secondary_axes=["coherence", "complexity", "risk_mapping"],
    ),
}
