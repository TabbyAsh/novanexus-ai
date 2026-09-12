# Sequence Witness · logic simulation

Engine: contrast-compiler/1.0.0. Schema: nova-contrast/1.
Analysis mode: built-in-adapters-and-model; 16 built-in adapter observations executed. Exported tests: NOT EXECUTED.

Results apply only to supplied finite cases, exact categories, and explicit numeric bins. No tolerance relation, physical validation, universal correctness, or unseen-state guarantee.

## Inspection
Selection: exact. Cost: 0. Selected: (none).
Exact means minimum cost for coverable declared distinctions using admissible enabled observations, not full coverage of impossible requirements. Costs are independent per channel; not a joint acquisition optimization.
UNCOVERED r1: AB / BA. Collision: identical recorded values under every admissible observation.
UNCOVERED r2: AB / ABA. Collision: identical recorded values under every admissible observation.
UNCOVERED r3: BA / ABA. Collision: identical recorded values under every admissible observation.
UNCOVERED r4: ABA / BAB. Collision: identical recorded values under every admissible observation.
a-seen: admissible; separates []; collisions [r1, r2, r3, r4]; incomplete [].
b-seen: admissible; separates []; collisions [r1, r2, r3, r4]; incomplete [].
a-before-b: disabled; separates [r1, r3]; collisions [r2, r4]; incomplete [].
b-before-a: disabled; separates [r1, r2]; collisions [r3, r4]; incomplete [].
DECODER COLLISION []: AB, BA, ABA, BAB.
Incomplete decoder rows: none.
