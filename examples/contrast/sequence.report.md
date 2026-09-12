# Sequence Witness · logic simulation

Engine: contrast-compiler/1.0.0. Schema: nova-contrast/1.
Analysis mode: built-in-adapters-and-model; 16 built-in adapter observations executed. Exported tests: NOT EXECUTED.

Results apply only to supplied finite cases, exact categories, and explicit numeric bins. No tolerance relation, physical validation, universal correctness, or unseen-state guarantee.

## Inspection
Selection: exact. Cost: 2. Selected: a-before-b, b-before-a.
Exact means minimum cost for coverable declared distinctions using admissible enabled observations, not full coverage of impossible requirements. Costs are independent per channel; not a joint acquisition optimization.
a-seen: admissible; separates []; collisions [r1, r2, r3]; incomplete [].
b-seen: admissible; separates []; collisions [r1, r2, r3]; incomplete [].
a-before-b: admissible; separates [r1, r3]; collisions [r2]; incomplete [].
b-before-a: admissible; separates [r1, r2]; collisions [r3]; incomplete [].
DECODER COLLISION [true,true]: ABA, BAB.
Incomplete decoder rows: none.
