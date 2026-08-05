// Checks for calibration.js. Open test-calibration.html in a browser to run
// them — no install, no build step, no command line.
//
// Not loaded by index.html: nothing here is part of the app.
//
// The technique throughout is to work backwards. Pick consumption figures,
// invent the swatch measurements they would produce, and see whether the
// solver gets the original numbers back. A solver can only be trusted on real
// measurements if it is exact on made-up ones where the answer is known.

const out = document.getElementById("out");
const summary = document.getElementById("summary");

let failures = 0;
let total = 0;

function say(line, className) {
  const span = document.createElement("span");
  if (className) span.className = className;
  span.textContent = line + "\n";
  out.appendChild(span);
}

function group(name) { say("\n" + name, "group"); }

function check(name, condition, detail) {
  total++;
  if (condition) {
    say("  ok    " + name, "ok");
  } else {
    failures++;
    say("  FAIL  " + name + (detail ? "  -> " + detail : ""), "fail");
  }
}

function close(a, b, tolerance) { return Math.abs(a - b) <= tolerance; }

// Noise from a fixed seed rather than Math.random, so a failure can be looked
// at again instead of vanishing on reload.
let seed = 12345;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function gauss(sigma) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// --- what a swatch contains -------------------------------------------------

group("grid and swatch shape");

check("gridFrom(5,40,4) is 5,10,20,40",
  gridFrom(5, 40, 4).join(",") === "5,10,20,40", gridFrom(5, 40, 4).join(","));
check("gridFrom(10,40,4) spreads geometrically",
  gridFrom(10, 40, 4).join(",") === "10,16,25,40", gridFrom(10, 40, 4).join(","));

const flat = { stitches: 20, rows: 10, circular: false, pattern: ["knit"] };
const tube = { stitches: 20, rows: 10, circular: true, pattern: ["knit"] };

check("flat swatch: 200 knit, 9 turns, 20 setup",
  swatchRow(flat, ["knit", "turn", "setup"]).join(",") === "200,9,20",
  swatchRow(flat, ["knit", "turn", "setup"]).join(","));
check("the same swatch worked in the round has no turns at all",
  swatchRow(tube, ["knit", "turn", "setup"]).join(",") === "200,0,20");

const mixed = { stitches: 10, rows: 4, circular: false, pattern: ["knit", "knit", "knit", "slipped"] };
check("a pattern cycles and may run out mid-row (10 sts -> 8 knit, 2 slipped)",
  swatchRow(mixed, ["knit", "slipped"]).join(",") === "32,8",
  swatchRow(mixed, ["knit", "slipped"]).join(","));

const grouped = groupSwatches([flat, tube, flat, flat]);
check("identical swatches are counted rather than repeated",
  grouped.length === 2 && grouped[0].count === 3 && grouped[1].count === 1,
  grouped.map(function (g) { return g.count; }).join(","));
check("grouping keeps the order they were chosen in",
  grouped[0].swatch === flat && grouped[1].swatch === tube);
check("same size but a different construction is a different swatch",
  groupSwatches([flat, tube]).length === 2);
check("same size but a different pattern is a different swatch",
  groupSwatches([
    { stitches: 10, rows: 10, circular: false, pattern: ["knit"] },
    { stitches: 10, rows: 10, circular: false, pattern: ["purl"] },
  ]).length === 2);

// Measurements are written against a list of swatches, so knowing whether a
// re-run produced the same list is what decides whether they survive it.
check("the same list is recognised across a fresh run",
  sameSwatches([flat, tube], [
    { stitches: 20, rows: 10, circular: false, pattern: ["knit"] },
    { stitches: 20, rows: 10, circular: true, pattern: ["knit"] },
  ]));
check("a different order is a different list — line 2 is a different swatch",
  !sameSwatches([flat, tube], [tube, flat]));
check("a shorter list is different", !sameSwatches([flat, tube], [flat]));
check("two empty lists match", sameSwatches([], []));

// --- the arithmetic underneath ----------------------------------------------

group("linear algebra");

const M = [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]];
const x = solveLinear(M, [8, -11, -3]);
check("solveLinear on a system with a known answer (2, 3, -1)",
  close(x[0], 2, 1e-9) && close(x[1], 3, 1e-9) && close(x[2], -1, 1e-9), x.join(","));
check("solveLinear returns null rather than nonsense when singular",
  solveLinear([[1, 2], [2, 4]], [1, 2]) === null);

const inverse = invertMatrix(M);
let identity = true;
for (let i = 0; i < 3; i++) {
  for (let j = 0; j < 3; j++) {
    let sum = 0;
    for (let k = 0; k < 3; k++) sum += M[i][k] * inverse[k][j];
    if (!close(sum, i === j ? 1 : 0, 1e-9)) identity = false;
  }
}
check("invertMatrix gives M x inverse = I", identity);
check("invertMatrix returns null when singular", invertMatrix([[1, 2], [2, 4]]) === null);

// --- does it get the right answer back? -------------------------------------

group("exact recovery from invented swatches");

// The figures the solver is supposed to rediscover, in metres.
const truth = { knit: 0.05, purl: 0.055, slipped: 0.025, turn: 0.01, setup: 0.02 };
const unknowns = ["knit", "purl", "slipped", "turn", "setup"];

// What this swatch would measure if `truth` were the real yarn behaviour.
function fabricate(swatch, noise) {
  const row = swatchRow(swatch, unknowns);
  let used = 0;
  for (let i = 0; i < row.length; i++) used += row[i] * truth[unknowns[i]];
  return { swatch: swatch, used: used + (noise ? gauss(noise) : 0) };
}

const shapes = [
  { stitches: 10, rows: 20, circular: false, pattern: ["knit"] },
  { stitches: 40, rows: 10, circular: false, pattern: ["purl"] },
  { stitches: 20, rows: 40, circular: false, pattern: ["knit", "purl"] },
  { stitches: 30, rows: 15, circular: true, pattern: ["knit", "knit", "knit", "slipped"] },
  { stitches: 20, rows: 30, circular: false, pattern: ["knit", "slipped"] },
  { stitches: 40, rows: 5, circular: true, pattern: ["purl"] },
];

const clean = solveCalibration(shapes.map(function (s) { return fabricate(s, 0); }), unknowns);
check("a clean solve succeeds", clean.ok, clean.reason);
check("every consumption comes back to within 1e-9",
  unknowns.every(function (n) { return close(clean.values[n], truth[n], 1e-9); }),
  unknowns.map(function (n) { return n + "=" + clean.values[n].toFixed(9); }).join(" "));
check("nothing is flagged suspect", clean.suspect.length === 0);
check("perfect data reports no disagreement", close(clean.scatter, 0, 1e-9),
  String(clean.scatter));
// Error bars of zero would be a lie told confidently: a few swatches agreeing
// is a small sample, not proof the tape is perfect.
check("but the error bars still allow for the tape",
  clean.sigma === DEFAULT_SIGMA && clean.uncertainty.knit > 0,
  clean.sigma + " / " + clean.uncertainty.knit);

const exactCount = solveCalibration(
  shapes.slice(0, 5).map(function (s) { return fabricate(s, 0); }), unknowns
);
check("with nothing spare there is no disagreement to report",
  exactCount.ok && exactCount.scatter === null && exactCount.measuredNoise === false);

group("designs that cannot work are refused");

check("two swatches cannot fix five unknowns",
  !solveCalibration([shapes[0], shapes[1]].map(function (s) { return fabricate(s, 0); }), unknowns).ok);

// Same shape, scaled: 200 knit / 10 setup against 400 knit / 20 setup. Both
// equations say the same thing twice as loudly, so neither can be pinned.
// 10x20 against 20x40 would NOT do this — that is knit x4 against setup x2,
// which separates them perfectly well.
const proportional = [
  { stitches: 10, rows: 20, circular: false, pattern: ["knit"] },
  { stitches: 20, rows: 20, circular: false, pattern: ["knit"] },
];
check("proportional swatches do not separate knit from setup",
  !solveCalibration(proportional.map(function (s) { return fabricate(s, 0); }), ["knit", "setup"]).ok);
check("no swatches at all is refused rather than crashed on",
  solveCalibration([], unknowns).ok === false);

// --- the claim the whole feature rests on -----------------------------------

group("predicted uncertainty against simulation");

// prescribeSwatches promises to say how far off each answer will land before a
// single swatch is knitted. Everything else is arithmetic; this is the claim
// worth actually testing. Fabricate 2000 sets of noisy measurements, solve each
// one, and compare the real spread of errors against the prediction.

const sigma = 0.01;
const predicted = uncertainties(
  shapes.map(function (s) { return swatchRow(s, unknowns); }), sigma, 0
);

const trials = 2000;
const sums = unknowns.map(function () { return 0; });
const squares = unknowns.map(function () { return 0; });
let scatterTotal = 0;

for (let t = 0; t < trials; t++) {
  const result = solveCalibration(
    shapes.map(function (s) { return fabricate(s, sigma); }), unknowns, { sigma: sigma }
  );
  unknowns.forEach(function (name, i) {
    const error = result.values[name] - truth[name];
    sums[i] += error;
    squares[i] += error * error;
  });
  scatterTotal += result.scatter;
}

let allMatch = true;
unknowns.forEach(function (name, i) {
  const observed = Math.sqrt(squares[i] / trials);
  const ratio = observed / predicted[i];
  const bias = sums[i] / trials;
  // Within 15% of the prediction, and centred on the right answer rather than
  // consistently high or low.
  if (!(ratio > 0.85 && ratio < 1.15 && Math.abs(bias) < predicted[i] * 0.2)) allMatch = false;
  say("        " + name.padEnd(8) +
    " predicted +-" + (predicted[i] * 100).toFixed(4) + "cm" +
    "  observed +-" + (observed * 100).toFixed(4) + "cm" +
    "  ratio " + ratio.toFixed(3), "note");
});
check("the simulated spread matches the prediction, and the fit is unbiased", allMatch);

// The reported disagreement is what tells a knitter whether their measuring
// was as good as they thought, so it has to recover the noise that is really
// there rather than whatever the tape was claimed to do.
const meanScatter = scatterTotal / trials;
check("the reported disagreement recovers the real measurement noise",
  meanScatter > sigma * 0.7 && meanScatter < sigma * 1.1,
  (meanScatter * 100).toFixed(4) + "cm against " + (sigma * 100).toFixed(4) + "cm");

// --- weighing instead of measuring ------------------------------------------

group("weight calibration");

check("three noisy length/weight pairs fit about 2 m per gram",
  close(metresPerGram([
    { grams: 10, metres: 20.1 },
    { grams: 25, metres: 49.8 },
    { grams: 50, metres: 100.3 },
  ]), 2, 0.02));
check("exact data gives the exact slope, through the origin",
  close(metresPerGram([{ grams: 3, metres: 6 }, { grams: 7, metres: 14 }]), 2, 1e-12));
check("no data gives null rather than a divide by zero", metresPerGram([]) === null);

// --- choosing what to knit --------------------------------------------------

group("prescribing: in the round, knit only");

const roundOnly = prescribeSwatches({
  types: [{ name: "knit", current: 0.05 }],
  construction: "round",
  budget: 3000,
});

check("no turn unknown in a round-only calibration",
  roundOnly.unknowns.join(",") === "knit,setup", roundOnly.unknowns.join(","));
check("every prescribed swatch is circular",
  roundOnly.swatches.every(function (s) { return s.circular; }));
check("respects the 16-stitch floor for a workable tube",
  roundOnly.swatches.every(function (s) { return s.stitches >= MIN_ROUND_STITCHES; }));
check("stays inside the stitch budget", roundOnly.cost <= 3000, String(roundOnly.cost));
check("is solvable", roundOnly.solvable);
check("meets its targets", roundOnly.meetsTargets);
report(roundOnly);

group("prescribing: flat and round, knit + purl + slipped");

const full = prescribeSwatches({
  types: [
    { name: "knit", current: 0.05 },
    { name: "purl", current: 0.055 },
    { name: "slipped", current: 0.025, dependent: true },
  ],
  construction: "both",
  budget: 4000,
});

check("all five unknowns", full.unknowns.join(",") === "knit,purl,slipped,turn,setup",
  full.unknowns.join(","));
check("at least one swatch per unknown",
  full.swatches.length >= full.unknowns.length, String(full.swatches.length));
check("slipped never fills a swatch on its own — it has to be carried",
  full.swatches.every(function (s) {
    return !(s.pattern.length === 1 && s.pattern[0] === "slipped");
  }));
check("stays inside the stitch budget", full.cost <= 4000, String(full.cost));
check("is solvable", full.solvable);
report(full);

const solved = solveCalibration(
  full.swatches.map(function (s) {
    const row = swatchRow(s, full.unknowns);
    let used = 0;
    for (let i = 0; i < row.length; i++) used += row[i] * truth[full.unknowns[i]];
    return { swatch: s, used: used };
  }),
  full.unknowns
);
check("knitting exactly what it prescribed recovers the truth",
  solved.ok && full.unknowns.every(function (n) { return close(solved.values[n], truth[n], 1e-9); }),
  solved.ok ? "" : solved.reason);

group("a budget too small for even one swatch");

// Reachable, and it used to throw: with nothing chosen there is no matrix, and
// an empty one has no width to read.
const broke = prescribeSwatches({
  types: [{ name: "knit", current: 0.05 }],
  construction: "flat",
  budget: 60,
});
check("prescribes nothing rather than crashing", broke.swatches.length === 0,
  String(broke.swatches.length));
check("says it is not solvable", broke.solvable === false);
check("says it does not meet the targets", broke.meetsTargets === false);
check("still names every unknown", broke.unknowns.length === 3);
check("every figure is reported as unknown",
  broke.unknowns.every(function (n) { return broke.expected[n] === Infinity; }));

group("a tight budget still returns something usable");

// The trap here: greedy search will happily spend the whole budget on one big
// informative swatch and leave the system unsolvable — infinitely precise
// about nothing.
const tight = prescribeSwatches({
  types: [{ name: "knit", current: 0.05 }],
  construction: "flat",
  budget: 600,
});

check("budget respected", tight.cost <= 600, String(tight.cost));
check("did not spend everything on one swatch and leave it unsolvable", tight.solvable,
  tight.swatches.length + " swatches for " + tight.unknowns.length + " unknowns");
check("at least one swatch per unknown", tight.swatches.length >= tight.unknowns.length);
check("admits it fell short of the targets", tight.meetsTargets === false);
// Naming the worst unknown is what turns "not good enough" into something the
// knitter can act on, so it has to be the genuinely worst one.
check("names the unknown holding it back",
  tight.unknowns.every(function (n) {
    return tight.expected[n] / tight.targets[n] <=
      tight.expected[tight.limiting] / tight.targets[tight.limiting];
  }), tight.limiting);
check("a met prescription still names its tightest figure",
  roundOnly.limiting !== null && roundOnly.meetsTargets);
report(tight);

function report(prescription) {
  prescription.swatches.forEach(function (s) { say("        " + describeSwatch(s), "note"); });
  say("        " + prescription.cost + " stitches, targets met: " + prescription.meetsTargets, "note");
  Object.keys(prescription.expected).forEach(function (name) {
    say("        " + name.padEnd(8) + " +-" +
      (prescription.expected[name] * 100).toFixed(4) + "cm", "note");
  });
}

summary.textContent = failures === 0
  ? "all " + total + " checks passed"
  : failures + " of " + total + " checks FAILED";
summary.className = failures === 0 ? "pass" : "fail";
