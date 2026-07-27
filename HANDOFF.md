# Planned Pooling web app — project handoff

Paste this file into a new Claude Code session on the other computer (or just say
"read HANDOFF.md") to resume exactly where we left off. Nothing has been coded yet.

## Goal

Build a web app that visualizes **planned pooling in knitting**: given a variegated
yarn's repeating color sequence and the fabric dimensions, predict and draw the
color pattern the finished fabric will have.

Secondary goal, equally important: **the user is learning web development through this
project.** No prior web-app experience. Beginner level, simplest forms preferred.

## Inputs / outputs

- **Input 1** — repeating yarn color sequence with lengths, e.g.
  `red 2 m → blue 1 m → green 4 m → …` repeating. Later generalise to non-repeating
  sequences and gradient transitions.
- **Input 2** — fabric dimensions (width, height, row height, stitch width).
- **Algorithm** — decides how much yarn each row/stitch consumes.
- **Output** — visualization of the finished fabric's colors.

## Chosen stack (decided)

| Concern | Choice | Why |
|---|---|---|
| Language | Plain HTML + CSS + JavaScript | No framework — fewer moving parts for a beginner; nothing here needs React/Vue |
| Computation | All in the browser | No backend, no database, no server costs |
| Drawing | Canvas API (`fillRect` per stitch) | Fast for thousands of cells, simple loop-based code |
| Hosting | GitHub Pages (free, static) | Zero cost, and teaches Git — a skill needed regardless |
| Editor | VS Code (user installing it themselves) | |
| Devices | One responsive page, mobile-first inputs | Works on desktop + phone, no app stores |

Cost: $0. User already has a GitHub account.

## Architecture — four separate layers

This is the key design decision. Keep these four concerns strictly separate so that
each future feature touches exactly one layer.

1. **Yarn model** — "what color is the strand at position *x* metres?"
   Starts as a repeating sequence; later generalises to non-repeating sequences and
   color transitions without touching any other layer.
2. **Consumption model** — "how much yarn does stitch *s* consume?"
   Different stitch types (knit, purl, garter, slipped, edge/selvedge…) have different
   consumption. A row is a **template** like `[edge, knit × N, edge]`, not N identical
   stitches. Edge stitches are just another entry in the template.
3. **Construction model** — "in what order are stitches laid down, and where does each
   land in the grid?" This is the flat-vs-circular knob:
   - **Flat (serpentine)** — direction flips every row; optional turning allowance at
     row ends.
   - **Circular** — no flip; it is really a *helix*. Cleanest model: drop discrete rows
     entirely — stitch *k* lands at column `k mod stitchesPerRound`,
     row `k div stitchesPerRound`. The one-row drift at the seam falls out for free.
     Render as the unrolled tube, ideally with a seam marker.
4. **Renderer** — takes the finished grid of colors and draws it. Knows nothing about
   how the grid was produced.

Payoff: non-repeating yarn → layer 1. New stitch type → layer 2. Circular mode →
layer 3. Prettier V-shaped stitch glyphs → layer 4.

## Scope

**MVP:** repeating yarn sequence, one stitch type at a uniform user-entered
consumption (cm/stitch), flat serpentine, rectangle-cell rendering. This already
produces real pooling patterns and is genuinely useful.

**Then, in rough order of value-per-effort:**
1. Circular / helical mode (small change, big feature)
2. Row templates with edge stitches
3. Stitch-type presets with typical consumption values
4. Turning allowance at row ends
5. Yarn-model generalisations (non-repeating sequences, transitions)
6. Calibration solver (see below)

## Post-MVP: calibration solver (user's idea — keep for later)

Rather than guessing consumption per stitch type, let the user report several knitted
swatches (stitch counts per type + total yarn used). Each swatch is one linear equation:

    Σ over stitch types of (count × perStitchConsumption) = totalLength

With at least as many swatches as unknown stitch types, solve the system; with more,
use least-squares so tension and measurement noise average out. Lives in layer 2.

## Working agreement

**"Middle path" on learning:** Claude scaffolds the structure; the user writes the
interesting parts — layers 1–3 (pure logic, learnable with no browser knowledge) and
the core drawing loop. Claude acts as tutor and reviewer.

**Planned learning path** (each stage ends with something visibly working):
HTML basics (the input form) → JS basics (parsing the color sequence) → the algorithm
(pure logic) → Canvas drawing → CSS / responsive polish → Git + publish to GitHub Pages.

## Where we stopped

Next step was **session 1**:
1. Setup — VS Code installed, project folder created, one empty HTML file, viewed in a
   browser (~15 min, mostly installs).
2. First real code — the **yarn model**: a function taking the sequence and a position,
   returning a color. Small, testable, pokeable in the browser console. The user's
   introduction to JS, on their own problem rather than a tutorial's.

**Project folder:** the user wants it at `E:\projects\planned_pooling` on the *other*
computer (that drive does not exist on the machine where this session ran).

**Avoid putting the project inside Google Drive** — Git makes hundreds of tiny file
writes and cloud-sync tools race against them, which corrupts repositories. Once the
project is on GitHub, GitHub itself is the backup and sync mechanism.
