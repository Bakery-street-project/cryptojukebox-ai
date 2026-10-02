# Dream engine listening notes (Phase 8)

Quality gate for the mechanism engine: read/listen outputs from real tracks
and judge them against the retired v1 mad-lib baseline (prose 5/10,
"understanding" 0/10). The measurable claims the tests already prove are
*distributional bias + associative linkage + agency loss*; whether the prose
lands is a human call.

## Verified offline (synthetic test track, sine sweep)

Two unseeded decodes of the same track differ; replaying seed `71074843`
returned the first dream **byte-identical**.

- seed `71074843` · exec 0.61 · recall 0.44 · 9 nodes / 6 bursts / 1 residue

  > The drowned band master is already there, and knows the room better than
  > you. Testtracks — the word somebody used at the window this morning.
  > Somehow, you keep walking toward the room above the band. […] Because of
  > that, the conductor decides the next corridor, and you accept it the way
  > you accept weather.

- seed `69cbaa06` · exec 0.61 · recall 0.89 · 9 nodes / 6 bursts / 1 residue

  > The smell of two fires reaches you first. Testt-ack — the word somebody
  > used at the window this morning. […] And then, under it all is the
  > survivor's guilt, and you accept it the way you accept weather.

Both show: day-residue morphing of the title, Tier-A connectors, fade marks
("or what is left of it", "or close to it"), passive agency-loss, and an
arc that resolves on a measured "come out of it level" line.

## Real-track session (to be filled by a human listener)

Run `bun dev`, decode 3–4 real tracks you know well, and record:

| Track (title/source) | dominant mood in artifacts? | feels dreamlike (1–5)? | word-salad (1–5, lower=better)? | recall via seed worked? | notes |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |

Acceptance bar: dreamlike ≥ 3 with word-salad ≤ 2 on a majority of tracks,
no artifact mentioning a fragment the walk didn't visit (tests enforce this
mechanically; the table is about *feel*).
