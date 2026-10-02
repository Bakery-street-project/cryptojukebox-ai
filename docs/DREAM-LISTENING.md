# Dream engine listening notes (Phase 8)

Quality gate for the mechanism engine: read/listen outputs from real tracks
and judge them against the retired v1 mad-lib baseline (prose 5/10,
"understanding" 0/10). The measurable claims the tests already prove are
*distributional bias + associative linkage + agency loss*; whether the prose
lands is a human call.

## Verified offline (synthetic test track, sine sweep) — pre-`75caf45`

> **Note:** these quotes predate commit `75caf45`, which retired the
> title-driven day residue. "Testtracks"/"Testt-ack" were morphed from the
> test file's *name* — that mechanism is gone. Current M6 folds half-word
> sounds out of the decoded audio signal itself (see the real-track section,
> which is the ground truth for today's engine). Everything else shown here
> (Tier-A connectors, fade marks, passive agency-loss, the measured
> "come out of it level" closing line) is unchanged.

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

## Real-track session — psytrance via YouTube, current engine (`75caf45`)

Run: 2026-10-02, `bun src/server.ts` on the audio-derived M6 engine.
Four tracks ingested through the YouTube search path (`ytsearch1`), decoded
with ffmpeg, dreamed, and replayed by seed. All four recalls came back
**byte-identical**.

**Title-word audit:** a word-boundary grep of every dream/idea/script/prompt
below for `becoming, insane, astrix, jungle, walk, tribe, higher, zones,
gaudium, liquid, soul, remix, vini, vici, mushroom, infected` returns
**zero hits**. The dreams never read the track's name — the residues
("Shorrs", "Fehrs", "Borring"…) are phonemes folded from the loudest signal
transients (zero-crossing → onset, spectral centroid → vowel).

### Track 0 — Infected Mushroom, "Becoming Insane"

`https://www.youtube.com/watch?v=wVwQYSVNJVM`
seed `1943e087` · bpm 144.6 · val 0.43 · aro 0.96 · dyn 1.00 · bright 2361
exec 0.43 · recall 0.44 · 9 nodes / 6 bursts / 2 residues
phosphene: `  ▒    · ▒   █░   ▓    █`

> You are made to have your own height measured away, which is normal in
> there. Shorrs — a sound the track left in the room, like a word. On the
> other side of it, you are holding the tooth that remembers being bone, and
> nobody finds that strange. Sorring — a sound the track left in the room,
> like a word. Without anyone opening it, there is something like a ladder
> made of teeth where the switch should be. Because of that, you notice cold
> glass against the lip. And then, you are made to crystallize, or close to
> it, which is normal in there. So, there is something like a dune made of
> slow spoons where the switch should be. Just behind it, you set the table
> again. Close to the floor, under it all is fear of the quiet part, or what
> is left of it, and nobody finds that strange. You come out of it level, at
> fear of the quiet part, and the level of it surprises you.

Idea: *Build a walkable room, one loop of the track per pass, have your own
height measured away on the downbeat, cold glass against the lip as the
feedback channel. Nothing explains the tooth that remembers being bone at
145 BPM. Label it "shorrs" and "sorring".*

Recall spot-check: seed `1943e087` → byte-identical ✅

### Track 1 — Astrix, "Deep Jungle Walk"

`https://www.youtube.com/watch?v=lIuEuJvKos4`
seed `93577cae` · bpm 183.9 · val 0.52 · aro 1.00 · dyn 1.00 · bright 2227
exec 0.42 · recall 0.78 · 9 nodes / 6 bursts / 2 residues
phosphene: ` ▒·▓  █  █   ░█         `

> You are put down in a low bridge at dawn. Fehrs — a sound the track left in
> the room, like a word. The way it always is there, there is a stove that
> remembers every winter where the switch should be, and you accept it the
> way you accept weather. Fihr — a sound the track left in the room, like a
> word. Which is why, you are holding a book of cold fire. Which is why, a
> child of two fires decides the next corridor, and you accept it the way you
> accept weather. Later than it should be, you let a level calm in, which is
> normal in there. The way it always is there, you notice the taste of cold
> water. Close to the floor, the lathe tender, or what is left of it decides
> the next corridor, and you accept it the way you accept weather. On the
> other side of it, you mend the net. Cut — the part where you mend the net,
> then the track is over and you are holding nothing.

Idea: *Build a low bridge at dawn as a walkable room, one loop of the track
per pass, mend the net on the downbeat, a child of two fires as the only
interface, the taste of cold water as the feedback channel. Nothing explains
a stove that remembers every winter at 184 BPM. Label it "fehrs" and "fihr".*

Recall spot-check: seed `93577cae` → byte-identical ✅

### Track 2 — Vini Vici, "The Tribe"

`https://www.youtube.com/watch?v=3_YBIeU7VSU`
seed `6b3062d3` · bpm 137.5 · val 0.51 · aro 0.94 · dyn 1.00 · bright 2432
exec 0.42 · recall 0.56 · 9 nodes / 6 bursts / 1 residue
phosphene: ` █ ██░  █ ░    █        `

> A man who is lost is already there, and knows the room better than you.
> Borring — a sound the track left in the room, like a word. In the same
> breath, a wind that takes the records reaches you first, and nobody finds
> that strange. Close to the floor, you are put down in the second sorting
> office, at night. In the same breath, something like the clerk of second
> class is already there, and knows the room better than you. After that,
> something like the sergeant who hums decides the next corridor, and nobody
> finds that strange. Because of that, you notice a hum inside the wall,
> which is normal in there. After that, you are put down in something like a
> market of echoes, and nobody finds that strange. In the same breath, it is
> the part where you are a room of laughter you arrived late to. You come out
> of it level, at a room of laughter you arrived late to, and the level of it
> surprises you.

Idea: *Build the second sorting office, at night as a walkable room, one loop
of the track per pass, a man who is lost as the only interface, a wind that
takes the records as the feedback channel. Nothing explains the missing part
at 137 BPM. Label it "borring".*

Recall spot-check: seed `6b3062d3` → byte-identical ✅

### Track 3 — Gaudium, "Higher Zones (Liquid Soul Remix)"

`https://www.youtube.com/watch?v=XKPXxostYJs`
seed `c0b30040` · bpm 135.3 · val 0.55 · aro 0.93 · dyn 1.00 · bright 2045
exec 0.48 · recall 0.67 · 9 nodes / 6 bursts / 2 residues
phosphene: `   █ █    ░ ▓  ░·    █  `

> You notice the taste of a stolen name. Horrs — a sound the track left in
> the room, like a word. On the other side of it, you are holding the
> forgiveness engine. Thorr — a sound the track left in the room, like a
> word. On the other side of it, there is a circuit woven in linen, or what
> is left of it where the switch should be. Which is why, you let tenderness
> for machines in, which is normal in there. Somehow, you keep walking toward
> the hall of sleeping machines, and you accept it the way you accept
> weather. For no reason anyone would admit, an engine left warm for no one
> reaches you first, which is normal in there. And then, you are the engine
> asleep and still ticking. So, you are holding a sled arriving uphill, or
> what is left of it, and nobody finds that strange. You come out of it
> level, at a sled arriving uphill, and the level of it surprises you.

Idea: *Build the hall of sleeping machines as a walkable room, one loop of
the track per pass, the taste of a stolen name as the feedback channel.
Nothing explains the forgiveness engine at 135 BPM. Label it "horrs" and
"thorr".*

Recall spot-check: seed `c0b30040` → byte-identical ✅

## Grading

### Agent self-grade (2026-10-02, the session LLM as reader)

Machine grading never counts as acceptance — recorded here only as the
engine's own reading of itself. Rubric: dreamlike 1–5, word-salad 1–5
(lower = better).

| Track | dreamlike | word-salad | why |
|---|---|---|---|
| 0 — Becoming Insane | 4 | 2 | tooth→bone→ladder-of-teeth condensation; canned acceptances land; connector crowding (Because of that / And then / So) |
| 1 — Deep Jungle Walk | 4 | 2 | cold fire → two fires → fire-child is one image metabolizing; "Cut — you are holding nothing" reads like waking; "decides the next corridor" ×3 |
| 2 — The Tribe | 4 | 2 | lost man / clerk / sergeant / sorting office coheres as underworld bureaucracy without explaining itself; doubled "knows the room better than you" is borderline template echo |
| 3 — Higher Zones | 4 | 1 | strongest arc: stolen name → forgiveness engine → linen circuit → tenderness → *you are the engine*; no line over-explains, no salad |

Against the acceptance bar (dreamlike ≥ 3, salad ≤ 2 on a majority): 4/4
pass **as agent grades only**.

### Human listener (fill in — this is the gate)

The machine can prove determinism, containment and signal-derived residue;
it cannot prove that any of this *feels* like a dream. That call belongs to
the reader. Acceptance bar: dreamlike ≥ 3 with word-salad ≤ 2 on a majority
of tracks, no artifact mentioning a fragment the walk didn't visit (tests
enforce containment mechanically; the table is about *feel*).

| Track | feels dreamlike (1–5)? | word-salad (1–5, lower=better)? | notes |
|---|---|---|---|
| 0 — Becoming Insane | | | |
| 1 — Deep Jungle Walk | | | |
| 2 — The Tribe | | | |
| 3 — Higher Zones | | | |
