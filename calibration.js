// Turning measured swatches into per-stitch consumption figures.
//
// Every consumption number in the app is currently a placeholder — knit 5cm,
// purl 5.5cm, and so on. This is what replaces them with measurements.
//
// Pure: no DOM, no app globals, no units but metres. Phase 1 is the arithmetic
// only — deciding which swatches are worth knitting, and solving the ones that
// come back. Nothing here knows there is a screen.

// --- the model --------------------------------------------------------------
//
// One swatch is one linear equation:
//
//   yarn used = SUM over stitch types (count x consumption)
//             + turns x turn
//             + castOnStitches x setup
//
// There is no such thing as a "direct" measurement. Even a plain flat swatch
// of nothing but knit stitches spends yarn on its R-1 turns and on its cast-on
// and bind-off, so length divided by stitches always overstates the stitch.
// Every measurement is a solve; the only question is how well conditioned it
// is.
//
// "setup" is one figure covering cast-on and bind-off together, because they
// cannot be told apart. Every swatch equation contains S x castOn + S x
// bindOff, which is S x (castOn + bindOff) whatever the swatch — so a solver
// asked for two numbers would return one number and noise.

// Yarn reserved at each end of a swatch for holding on to. Subtracted from the
// measured length before it reaches the solver, exactly as the join adviser
// treats the tail on a new ball.
const DEFAULT_TAIL = 0.15;

// How far one measurement can be off, in metres. Unwinding a swatch and laying
// it along a tape is good to about a centimetre; the yarn stretches, and where
// exactly the last stitch ends is a judgement call.
const DEFAULT_SIGMA = 0.01;

// Below this a tube is more fight than fabric, and below about 8 rows a flat
// swatch curls too hard to measure honestly.
const MIN_ROUND_STITCHES = 16;

// --- describing a swatch ----------------------------------------------------
//
// A swatch is { stitches, rows, circular, pattern }, where pattern is the run
// of stitch types repeated across every row. A plain knit swatch is ["knit"];
// a slipped-stitch one might be ["knit", "knit", "knit", "slipped"].
//
// The pattern cycles and is allowed to run out mid-row, because that is what
// happens on real needles when the repeat does not divide the cast-on.

function rowCounts(pattern, stitches) {
  const counts = new Map();
  for (let i = 0; i < stitches; i++) {
    const type = pattern[i % pattern.length];
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  return counts;
}

// The swatch's row of the matrix: how much of each unknown it contains.
function swatchRow(swatch, unknowns) {
  const per = rowCounts(swatch.pattern, swatch.stitches);
  return unknowns.map(function (name) {
    // Worked in the round there is no turning at all — that is the whole
    // reason for offering round swatches, since it removes a column from the
    // problem rather than merely measuring it.
    if (name === "turn") return swatch.circular ? 0 : Math.max(0, swatch.rows - 1);
    if (name === "setup") return swatch.stitches;
    return (per.get(name) || 0) * swatch.rows;
  });
}

// What this swatch costs to knit. Turns and cast-on take time too, but stitches
// are what the knitter feels, so they are what the effort budget counts.
function swatchCost(swatch) {
  return swatch.stitches * swatch.rows;
}

// The search will pick the same swatch more than once, and it is right to:
// knitting two of a shape halves the noise on it, and that is sometimes the
// cheapest precision available. But three identical lines in a list read as a
// mistake, so they are counted instead.
function swatchKey(swatch) {
  return swatch.stitches + "x" + swatch.rows +
    (swatch.circular ? "round" : "flat") + ":" + swatch.pattern.join("/");
}

function groupSwatches(swatches) {
  const byKey = new Map();
  const order = [];
  for (const swatch of swatches) {
    const key = swatchKey(swatch);
    const seen = byKey.get(key);
    if (seen) {
      seen.count++;
    } else {
      const entry = { swatch: swatch, count: 1 };
      byKey.set(key, entry);
      order.push(entry);
    }
  }
  return order;
}

// Whether two prescriptions ask for the same knitting.
//
// Worth knowing because measurements are entered against a list of swatches,
// and re-running the search usually produces exactly the same list. Clearing
// hours of knitting because someone nudged a box and put it back would be the
// worst thing this panel could do.
function sameSwatches(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (swatchKey(a[i]) !== swatchKey(b[i])) return false;
  }
  return true;
}

function describeSwatch(swatch) {
  const worked = swatch.circular ? "in the round" : "flat";
  const rows = swatch.circular ? "rounds" : "rows";
  const pattern =
    swatch.pattern.length === 1
      ? "all " + swatch.pattern[0]
      : swatch.pattern.join(", ") + " repeated";
  return (
    "Cast on " + swatch.stitches + ", work " + swatch.rows + " " + rows +
    " " + worked + " — " + pattern
  );
}

// --- linear algebra ---------------------------------------------------------
//
// Small dense matrices, a handful of unknowns. Nothing here needs to be clever;
// it needs to be readable and to fail loudly rather than return nonsense.

function normalMatrix(A, ridge) {
  const n = A[0].length;
  const M = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let r = 0; r < A.length; r++) sum += A[r][i] * A[r][j];
      row[j] = sum;
    }
    // A ridge term keeps the matrix invertible while the design is still
    // under-determined. Without it the search cannot compare two useless sets
    // of swatches, because both score infinity.
    if (ridge) row[i] += ridge;
    M.push(row);
  }
  return M;
}

function normalVector(A, b) {
  const n = A[0].length;
  const v = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let r = 0; r < A.length; r++) sum += A[r][i] * b[r];
    v[i] = sum;
  }
  return v;
}

// Gaussian elimination with partial pivoting. Returns null on a singular
// matrix rather than a vector of infinities — the caller wants to know that
// the swatches do not determine the answer, not to be handed a number.
function solveLinear(M, v) {
  const n = v.length;
  const a = M.map(function (row, i) { return row.concat([v[i]]); });

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;

    const swap = a[col];
    a[col] = a[pivot];
    a[pivot] = swap;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
    }
  }

  return a.map(function (row, i) { return row[n] / a[i][i]; });
}

// Gauss-Jordan against an identity. Only the diagonal is ever used, but the
// whole inverse is cheap at this size and much easier to check.
function invertMatrix(M) {
  const n = M.length;
  const a = M.map(function (row, i) {
    const id = new Array(n).fill(0);
    id[i] = 1;
    return row.concat(id);
  });

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;

    const swap = a[col];
    a[col] = a[pivot];
    a[pivot] = swap;

    const d = a[col][col];
    for (let c = 0; c < 2 * n; c++) a[col][c] /= d;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let c = 0; c < 2 * n; c++) a[r][c] -= f * a[col][c];
    }
  }

  return a.map(function (row) { return row.slice(n); });
}

// How much each answer would wobble, given how noisy one measurement is.
//
// This is the whole point of the exercise: it can be computed before a single
// swatch is knitted, because it depends only on the shapes of the swatches and
// not on what they measure. That is what makes prescribing possible.
function uncertainties(A, sigma, ridge) {
  const inv = invertMatrix(normalMatrix(A, ridge));
  if (!inv) return A[0].map(function () { return Infinity; });
  return inv.map(function (row, i) {
    return row[i] > 0 ? sigma * Math.sqrt(row[i]) : Infinity;
  });
}

// --- solving a set of measured swatches -------------------------------------

// measured: [{ swatch, used }] with used in metres, tails already removed.
function solveCalibration(measured, unknowns, options) {
  const opts = options || {};

  // No swatches is not a degenerate case of "not enough swatches" — there is
  // no matrix at all, and the width of one cannot be read off an empty list.
  if (measured.length === 0) {
    return { ok: false, reason: "No swatches have been measured yet." };
  }

  const A = measured.map(function (m) { return swatchRow(m.swatch, unknowns); });
  const b = measured.map(function (m) { return m.used; });

  const x = solveLinear(normalMatrix(A, opts.ridge || 0), normalVector(A, b));
  if (!x) {
    return {
      ok: false,
      reason: "These swatches do not pin down every figure on their own.",
    };
  }

  // Residuals: what the fitted numbers say each swatch should have measured,
  // against what it did. Large ones mean tension drifted, or a swatch was
  // miscounted, or the model is missing something.
  const residuals = A.map(function (row, r) {
    let predicted = 0;
    for (let i = 0; i < row.length; i++) predicted += row[i] * x[i];
    return b[r] - predicted;
  });

  // With spare swatches the data reports its own noise, which is better than
  // any figure guessed in advance. With none to spare there is nothing to
  // measure it from, and the assumed value has to stand.
  const spare = measured.length - unknowns.length;
  let sigma = opts.sigma || DEFAULT_SIGMA;
  if (spare > 0) {
    let ss = 0;
    for (const r of residuals) ss += r * r;
    sigma = Math.sqrt(ss / spare);
  }

  const spread = uncertainties(A, sigma, opts.ridge || 0);

  const values = {};
  const error = {};
  unknowns.forEach(function (name, i) {
    values[name] = x[i];
    error[name] = spread[i];
  });

  return {
    ok: true,
    values: values,
    uncertainty: error,
    residuals: residuals,
    sigma: sigma,
    measuredNoise: spare > 0,
    // A negative consumption is arithmetically fine and physically nonsense.
    // It means the swatches disagree badly enough that the fit has gone
    // looking for cancellation, and the answer must not be applied.
    suspect: unknowns.filter(function (name) { return values[name] <= 0; }),
  };
}

// --- weight instead of a tape -----------------------------------------------
//
// Weighing a swatch is far easier than unwinding it, and a kitchen scale beats
// a tape measure for repeatability. It needs one conversion, which the yarn
// itself provides: weigh known lengths and fit a line.
//
// Through the origin, deliberately. Zero yarn weighs zero, and that is not an
// assumption — it is the one point on the line known exactly. Letting the fit
// choose an intercept spends a degree of freedom on a number that must be zero.
function metresPerGram(pairs) {
  let top = 0;
  let bottom = 0;
  for (const p of pairs) {
    top += p.grams * p.metres;
    bottom += p.grams * p.grams;
  }
  if (!(bottom > 0)) return null;
  return top / bottom;
}

// --- prescribing swatches ---------------------------------------------------
//
// Given the stitch types someone uses, which swatches should they knit?
//
// Not "the most" and not "the biggest". The right set maximises the contrast
// between its rows: a swatch is only informative about setup if its ratio of
// cast-on stitches to worked stitches differs from the others'. Two swatches
// of similar shape are nearly the same equation twice.

// Spread points geometrically between two bounds, because what separates the
// equations is the ratio between swatches, not the difference. From 5 to 40 in
// four steps this gives 5, 10, 20, 40 — the same spread reached by hand,
// which is reassuring but is now derived rather than chosen.
function gridFrom(min, max, count) {
  if (count < 2) return [max];
  const ratio = Math.pow(max / min, 1 / (count - 1));
  const out = [];
  for (let i = 0; i < count; i++) out.push(Math.round(min * Math.pow(ratio, i)));
  return [...new Set(out)];
}

// Every swatch worth offering: each workable pattern, at each shape, in each
// construction the knitter is willing to use.
//
// The bounds are the only hand-supplied numbers in the whole search, and they
// are the two a knitter actually knows: how narrow a swatch they can face
// working, and how many stitches they are willing to spend.
function candidateSwatches(request) {
  const bounds = Object.assign(
    { minStitches: 10, maxStitches: 40, stitchSteps: 4, minRows: 5, maxRows: 40, rowSteps: 4 },
    request.bounds
  );

  const standalone = request.types.filter(function (t) { return !t.dependent; });
  const patterns = [];

  for (const t of standalone) patterns.push([t.name]);

  // A dependent type cannot make a whole fabric on its own — slip every stitch
  // of every row and the yarn never moves. It has to be carried by a base type,
  // and two different ratios give two genuinely different columns.
  for (const d of request.types.filter(function (t) { return t.dependent; })) {
    const base = standalone[0];
    if (!base) continue;
    for (const run of [1, 3]) {
      const pattern = [];
      for (let i = 0; i < run; i++) pattern.push(base.name);
      pattern.push(d.name);
      patterns.push(pattern);
    }
  }

  const constructions = [];
  if (request.construction !== "round") constructions.push(false);
  if (request.construction !== "flat") constructions.push(true);

  const out = [];
  for (const stitches of gridFrom(bounds.minStitches, bounds.maxStitches, bounds.stitchSteps)) {
    for (const rows of gridFrom(bounds.minRows, bounds.maxRows, bounds.rowSteps)) {
      for (const circular of constructions) {
        if (circular && stitches < MIN_ROUND_STITCHES) continue;
        for (const pattern of patterns) {
          out.push({ stitches: stitches, rows: rows, circular: circular, pattern: pattern });
        }
      }
    }
  }
  return out;
}

function unknownsFor(request) {
  const names = request.types.map(function (t) { return t.name; });
  // Nothing turns in the round, so a round-only calibration has no turn to
  // find and should not be asked to look for one.
  if (request.construction !== "round") names.push("turn");
  names.push("setup");
  return names;
}

function targetsFor(request, unknowns) {
  const fraction = request.targetFraction || 0.01;
  const current = {};
  for (const t of request.types) current[t.name] = t.current;
  current.turn = request.turnCurrent || 0.01;
  current.setup = request.setupCurrent || 0.02;

  return unknowns.map(function (name) {
    const value = current[name] > 0 ? current[name] : 0.05;
    return value * fraction;
  });
}

// One number for how good a set of swatches is: the worst any single figure
// comes out, measured against what that figure needs to be good to.
//
// Normalising against the targets is what lets a 5cm stitch and a 1cm turn be
// compared at all — in raw metres the search would spend every swatch on
// whichever unknown happened to be largest.
function worstRatio(rows, targets, sigma, ridge) {
  if (rows.length === 0) return Infinity;
  const spread = uncertainties(rows, sigma, ridge);
  let worst = 0;
  for (let i = 0; i < spread.length; i++) worst = Math.max(worst, spread[i] / targets[i]);
  return worst;
}

function prescribeSwatches(request) {
  const unknowns = unknownsFor(request);
  const targets = targetsFor(request, unknowns);
  const sigma = request.sigma || DEFAULT_SIGMA;
  const budget = request.budget || Infinity;
  const maxSwatches = request.maxSwatches || unknowns.length + 3;
  const candidates = candidateSwatches(request);

  // Small enough not to move the answer once the design is determined, large
  // enough to keep the score finite before it is.
  const ridge = 1e-9;
  // Below this, another swatch is not paying for itself.
  const worthwhile = 0.05;

  const cheapest = candidates.reduce(function (least, c) {
    return Math.min(least, swatchCost(c));
  }, Infinity);

  const chosen = [];
  const rows = [];
  let cost = 0;

  function scoreWith(set) {
    return worstRatio(set.map(function (s) { return swatchRow(s, unknowns); }), targets, sigma, ridge);
  }

  while (chosen.length < maxSwatches) {
    const before = worstRatio(rows, targets, sigma, ridge);

    // Keep enough budget in hand to reach a solvable set. Greedy search is
    // myopic: left alone it spends almost everything on one large, highly
    // informative swatch and then cannot afford the others, ending up precise
    // about nothing. Reserving the cheapest possible remainder stops that.
    const reserve = Math.max(0, unknowns.length - chosen.length - 1) * cheapest;

    let best = null;
    for (const c of candidates) {
      if (cost + swatchCost(c) + reserve > budget) continue;
      const score = worstRatio(rows.concat([swatchRow(c, unknowns)]), targets, sigma, ridge);
      if (!best || score < best.score) best = { swatch: c, score: score };
    }
    if (!best) break;

    // Only once the system is solvable at all does diminishing return mean
    // anything — before that every swatch looks like a poor improvement on
    // infinity.
    if (chosen.length >= unknowns.length && best.score > before * (1 - worthwhile)) break;

    chosen.push(best.swatch);
    rows.push(swatchRow(best.swatch, unknowns));
    cost += swatchCost(best.swatch);

    if (best.score <= 1) break;
  }

  // The first swatch is picked while the system is still rank-deficient, when
  // every score is a huge ridge-propped number and the ordering between them
  // means very little. That choice is then stuck in the set. Swapping each
  // position against every candidate, now that the rest of the set exists to
  // judge it against, repairs the ones chosen for no good reason.
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let i = 0; i < chosen.length; i++) {
      const without = cost - swatchCost(chosen[i]);
      let best = { swatch: chosen[i], score: scoreWith(chosen) };
      for (const c of candidates) {
        if (without + swatchCost(c) > budget) continue;
        const trial = chosen.slice();
        trial[i] = c;
        const score = scoreWith(trial);
        if (score < best.score * (1 - 1e-9)) best = { swatch: c, score: score };
      }
      if (best.swatch !== chosen[i]) {
        cost = without + swatchCost(best.swatch);
        chosen[i] = best.swatch;
        improved = true;
      }
    }
    if (!improved) break;
  }

  // Reported without the ridge, so an under-determined set reports infinity
  // rather than a large but finite number that looks like an answer.
  //
  // Choosing nothing at all is reachable: a budget too small for even the
  // cheapest swatch plus its reserve leaves the loop with no affordable
  // candidate on the first pass. There is no matrix then, so there is nothing
  // to invert — every figure is simply unknown.
  const spread = chosen.length === 0
    ? unknowns.map(function () { return Infinity; })
    : uncertainties(chosen.map(function (s) { return swatchRow(s, unknowns); }), sigma, 0);
  const expected = {};
  const wanted = {};
  // Which unknown is holding the whole set back. Without this the answer is
  // "not good enough" with no clue what to do about it — and the fix is
  // usually specific to one figure, like accepting a looser turn.
  let limiting = null;
  let worst = -Infinity;

  unknowns.forEach(function (name, i) {
    expected[name] = spread[i];
    wanted[name] = targets[i];
    const ratio = spread[i] / targets[i];
    if (ratio > worst) {
      worst = ratio;
      limiting = name;
    }
  });

  return {
    unknowns: unknowns,
    swatches: chosen,
    cost: cost,
    expected: expected,
    targets: wanted,
    limiting: limiting,
    // Two different failures, worth telling apart. Not solvable means these
    // swatches cannot produce the numbers at all; solvable but short of target
    // means they will, just less precisely than asked.
    solvable: spread.every(function (v) { return isFinite(v); }),
    meetsTargets: spread.every(function (v, i) { return v <= targets[i]; }),
  };
}

console.log("calibration.js loaded");
