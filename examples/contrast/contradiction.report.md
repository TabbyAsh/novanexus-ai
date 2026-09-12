# A transitive contradiction

Engine: contrast-compiler/1.0.0. Schema: nova-contrast/1.
Analysis mode: built-in-adapters-and-model; 16 built-in adapter observations executed. Exported tests: NOT EXECUTED.

Results apply only to supplied finite cases, exact categories, and explicit numeric bins. No tolerance relation, physical validation, universal correctness, or unseen-state guarantee.

## Inspection
Selection: blocked. Cost: 0. Selected: (none).
Exact means minimum cost for coverable declared distinctions using admissible enabled observations, not full coverage of impossible requirements. Costs are independent per channel; not a joint acquisition optimization.
CONTRADICTION apart: AB / ABA; equivalence chain: same1 → same2.
UNCOVERED apart: AB / ABA. Channel blocked by contradictory requirements.
a-seen: admissible; separates []; collisions [apart]; incomplete [].
b-seen: admissible; separates []; collisions [apart]; incomplete [].
a-before-b: violates-equivalence; separates []; collisions [apart]; incomplete [].
  Equivalence violation: AB=true, BA=false; chain same1.
  Equivalence violation: BA=false, ABA=true; chain same2.
b-before-a: violates-equivalence; separates [apart]; collisions []; incomplete [].
  Equivalence violation: AB=false, BA=true; chain same1.
  Equivalence violation: AB=false, ABA=true; chain same1 → same2.
DECODER COLLISION []: AB, BA, ABA, BAB.
Incomplete decoder rows: none.
