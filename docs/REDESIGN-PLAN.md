# Redesign plan — aligning with the Circular Yoke Sweater Designer

Target: `circular_yoke_design/docs/DESIGN-PHILOSOPHY.md`. That file is the source of truth for
tokens, voice and component meanings. This file is the ordered plan for getting there without
losing anything the app already does.

## Standing rules for every phase

- **Keep all current functionality.** This is a restyle plus additions, never a removal.
- Plain HTML, CSS, vanilla JS. **No framework, no build step, no backend.** Do not add one.
- Do not reintroduce a mode switch. The mode radio was deliberately removed; nesting
  `<details>` expresses dependency instead.
- Do not touch the micrometre accumulation in `construction.js`. Float drift there was a real
  bug once.
- Do not "simplify" `buildCastOnRow`'s `circular ? i : stitches - 1 - i`. Flat knitting turns
  before row 0; that expression is the turn.
- One commit per numbered step, so any step can be reverted alone.
- After every step: NUL-byte scan, browser check on a **fresh port** (the cache has served
  stale JS before and silently passed a test), console clean, `test-calibration.html` green.

## Decisions taken

1. **Redo the token sweep; do not rebase the `styling` branch.** That branch is one commit
   against eight commits of `index.html` drift, and it disagrees with the philosophy on accent,
   font, token names and dark mode. Dark mode alone changes how every background value is
   picked, so the sweep is redone regardless. Keep the branch only as an inventory of which
   rules need touching, then delete it.
2. **Inter, not Atkinson Hyperlegible.** Section 11 wants one font across both apps so they
   feel like one product. Atkinson was a good accessibility call in isolation; the companion
   app overrides it.

Both are reversible before phase 1 lands and nowhere after.

---

## Phase 1 — Token layer and theming

First, because every later phase writes CSS. Writing untokenized CSS now means sweeping twice.
No structural change here, so nothing in later phases is invalidated by it.

Starting point, measured: `style.css` is 1156 lines, **zero tokens**, 31 colour literals,
0 shadows, no dark mode.

1. Add the `:root` block, copying section 3 of the philosophy **exactly** (values and
   role-based names). Add `--c-paper` for drawing surfaces.
2. Add the dark block: same names redefined under `@media (prefers-color-scheme: dark)` guarded
   by `:not([data-theme="light"])`, and again under `[data-theme="dark"]`.
3. Add the Inter `<link>` to `<head>` (weights 400, 500, 600) with the system stack as fallback.
4. Add the pre-paint inline `<head>` script that reads the stored theme and sets
   `data-theme` before first paint, so there is no flash.
5. Sweep colour: every literal to a token. Verify with
   `grep -oE "#[0-9a-fA-F]{3,8}" style.css` returning nothing outside `:root`.
6. Sweep type, then spacing, then radius, onto the scales.
7. Cards: `--c-surface`, 1px `--c-line`, `--r-panel`, `--shadow-card`. Nested groups get a line
   and a heading, not another card.
8. **The canvas area stays light in both themes** (`--c-paper`). It is an artboard holding the
   user's design data. This is the rule that makes dark mode safe for this app.
9. Theme cycle button (Auto / Light / Dark), stored under `plannedPooling.theme`, also written
   to `circularYokeDesign.theme` so the choice follows the user between the two apps on the
   shared origin.

**Deliberate exceptions, comment each in place:**

- Fade slider thumb hairline stays literal. It needs contrast against an arbitrary yarn colour,
  not against app chrome.
- Stale-badge white-on-danger stays literal.
- Template and count cell widths (`3.2rem`) are sized to hold four digits. Content fit, not
  rhythm.
- Fade thumb width `14px` is pinned to `FADE_THUMB_PX` in `controls.js`. Changing it needs a
  matching JS change.

**Verify:** both themes; focus rings visible and berry; canvas light in dark mode; the three
existing breakpoints (`27rem` container, 900px, 640px) unchanged; no console errors.

---

## Phase 2 — Copy and hints

Independent of everything. Finishes the trimming pass already in flight, now with an objective
rule instead of taste.

Measured: **8 of 10 static hints exceed the philosophy's 12-word limit.** Worst are 77 words
(pattern syntax) and 64 words (repeat marking).

1. Build the `?` affordance: a button that opens **one** floating box (`--shadow-pop`). One
   mechanism, reused.
2. For each over-length hint, cut to one sentence saying what the field **is** or what the
   control **does**. Move the rest behind `?`. The pattern-notation explanation is genuinely
   needed — it belongs in the box, not deleted.
3. Rewrite all visible text to Simplified Technical English: short sentences, active voice, the
   same word for the same thing.
4. **American spelling in visible text.** Ten option labels currently read "metres",
   "centimetres", "millimetres". Code and comments may stay British.
5. Buttons become verbs or short nouns, no periods.

**Verify:** no static hint over 12 words; every `?` opens and closes; screen-reader labels intact.

---

## Phase 3 — App bar

Structural, and needed before File actions have anywhere to live.

Today the page opens with a bare `<h1>Planned Pooling</h1>`.

1. Replace it with the app bar: app name, editable document name, units, then File actions.
2. Match the companion app's bar so the two read as one product.
3. Neutral buttons throughout; **one** primary (berry fill) per area.
4. Audit the other 9 buttons. "Use these figures" in Calibration is the obvious primary there.

**Verify:** bar does not scroll away on desktop; stops being fixed under 621px; tab order sane.

---

## Phase 4 — Save and Open a `.json` file

Must land **before** phase 5. Phase 5 changes the settings shape and forces a
`SETTINGS_VERSION` bump, which discards saved settings — so the escape hatch has to exist first.
This also closes the open backlog item about re-entering measurements every session.

1. **Save**: serialise current settings to a plain `.json` the user owns, with a `format` field
   so the companion app can refuse it politely.
2. **Open**: read a file, validate `format`, apply through the existing `applySettings` path.
   Reject a foreign or future file with a plain message, never a thrown error.
3. Keep the localStorage autosave as a **draft**, offer to restore it, warn before unsaved work
   is replaced.
4. Move storage to a `plannedPooling.` key prefix (today it is the bare key `planned-pooling`),
   since both apps share an origin.
5. Migrate the old key on first load so nobody loses their saved session.

**Verify:** round-trip a full config through save and open; a yoke-app file is refused politely;
a truncated file is refused politely; old key migrates once.

---

## Phase 5 — One unit, not six

`lengthUnit`, `gaugeUnit`, `swatchUnit`, `typeUnit`, `castOnUnit`, `calUnit` — six dropdowns for
one idea. This breaks "a value is typed in one place".

1. Decide the real grouping. Length and gauge are genuinely different kinds of measurement
   (yarn length vs fabric dimension), so this is likely **two** units, not one — not six.
2. Move the surviving unit controls into the app bar.
3. Convert existing values on change, exactly as `convertBoxes` already does, so nothing is
   silently reinterpreted.
4. Bump `SETTINGS_VERSION` (currently 25).
5. Re-check every `toMetres` / `fromMetres` call site for the unit it now reads.

**Verify:** every figure round-trips through a unit change unchanged; calibration still solves;
`test-calibration.html` green; a file saved in phase 4 still opens.

**Risk:** the highest-risk phase. Unit handling is threaded through `app.js`, `controls.js` and
`calibration.js`. Do it in one sitting, with the test harness open.

---

## Phase 6 — One quiet status bar

Half-built already: inline `.problem` notes plus a `staleBadge` reading "Out of date — 2 things
need fixing". That is already count-plus-message.

1. One fixed quiet bar at the bottom for all errors and warnings.
2. Folded to a count, the first message, and a "Show field" button that focuses the offending
   control.
3. A new error opens it once.
4. Keep the inline field marking — the bar points at the field, it does not replace it.
5. No toasts, no `alert`. (The app already uses neither.)

---

## Phase 7 — Print

The biggest functional gap: there are **zero print styles**, and the app's whole output is a
chart you want beside you while knitting.

Placed here because print must hide the final structure, which phases 3 to 6 settle.

1. `@media print`: hide the panel, app bar and status bar; the fabric takes the page.
2. Print fixed colours, not themed ones — the one place literals are allowed.
3. Print the numbers that matter with the chart: stitches, rows, finished size, yarn needed,
   where the yarn starts.
4. Page-break rules so a tall fabric splits sensibly rather than mid-row.

**Verify:** print preview at A4 and Letter, light and dark theme both producing the same sheet.

---

## Phase 8 — Mobile

Backlog item 8, never started. The philosophy supplies the breakpoints.

1. Medium (621–900px): the settings panel becomes a drawer over the fabric.
2. Phone (under 621px): one column, nothing folds, app bar stops being fixed.
3. **No horizontal page scroll at 375px.** Check every screen, every panel open.
4. The drag grips already use pointer events, so they work on touch — verify, do not rewrite.
5. Touch targets 44px.

---

## Phase 9 — Yarn meter

Polish. The app already computes "Needs 122.4 m" and has a skein length, so the philosophy's
"one bar, one meaning: how much of your yarn the design uses" ports directly.

One bar, one meaning. Full and red means short. Do not reuse it for anything else.

---

## Phase 10 — Calibration from one repeat

Asked for directly: design the pattern, knit one repeat containing every element
you will use, unwind it, measure, and have that be enough. Today it is not, and
the reason is worth writing down rather than rediscovering.

`calibration.js` treats one swatch as one linear equation, and `unknownsFor()`
counts one unknown per stitch type **plus** `turn`, `castOn` and `bindOff`. Even
an all-knit flat calibration is four unknowns, and the search will not stop until
`rankOf(rows) === unknowns.length`. One repeat is one measurement against many
unknowns, so it cannot separate knit from purl from slipped — and the renderer
walks the yarn stitch by stitch, so colour placement needs that separation.
`candidateSwatches()` never offers the knitter's own repeat as a swatch for the
same reason: mixed swatches do not separate types.

The narrower version is sound. Keep the **ratios** between stitch types as
currently believed and solve a single **scale factor** from one measured repeat.
One equation, one unknown. Total yarn becomes exact and colour placement is as
good as the assumed ratios, which is far better than unscaled defaults.

1. A path that takes the design already on screen, states the repeat to knit, and
   asks for one measurement.
2. Solve one multiplier over the current per-type figures. Do not touch
   `solveCalibration`; this is a different question, not a cheaper version of the
   same one.
3. Say plainly what it buys and what it does not: exact total, approximate
   placement. A knitter choosing this is trading one for the other knowingly.
4. Decide the edges. The repeat carries a cast-on and, worked flat, turns. Either
   prescribe it in the round so turning leaves the equation, or fold cast-on and
   bind-off into the one factor and say so.
5. `metresPerGram()` already exists, so "weigh it" can stand in for "unwind it".

**Verify:** the fitted factor reproduces the measured repeat exactly; a design
whose repeat is all one stitch type agrees with what the full solver returns from
equivalent swatches.

**Placement:** independent of phases 1 to 9. It is the only item here that adds a
way of using the app rather than restyling one, so it is worth doing early if
appetite allows.

---

## Explicitly not adopted

- **Three-column `list | view | settings`.** There is no list of pieces here. The current
  two-column fabric/settings split with a draggable splitter is correct.
- **The left tool rail.** This canvas is computed, not painted. There are no tools to rail.
- **The `Design | Pattern` segmented control.** Modes were deliberately removed.
- **Undo.** Nothing here paints.
