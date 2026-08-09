// One definition of "the current settings", and how they survive a reload.
//
// Until now every value was read straight off its input whenever it was needed.
// That works while each value has exactly one editor. Advanced mode breaks that
// assumption, so from here there is a single place that says what the settings
// are, what they default to, and how they are stored.

const STORAGE_KEY = "planned-pooling";

// Bump this whenever the shape below changes. Saved data in an older shape is
// thrown away rather than half-read — a missing field would otherwise surface
// as NaN somewhere deep in the pipeline, long after the real cause.
const SETTINGS_VERSION = 24;

// Lengths here are in whatever unit the boxes are showing, not metres. Storing
// what was actually typed means a reload shows the same numbers back, rather
// than 2 becoming 1.9999999 after a round trip through a conversion.
const DEFAULT_SETTINGS = {
  version: SETTINGS_VERSION,
  // Width of the controls column in pixels. 28rem at the default font size.
  controlsWidth: 448,
  // Also the value basic mode forces zoom back to.
  zoom: 1.2,
  // fade is how far this colour grades in from the one before it, in the same
  // unit as length. Zero is a sharp change, which is how every yarn behaves
  // until someone switches fades on.
  sequence: [
    { color: "#ff0000", length: 2, fade: 0 },
    { color: "#0000ff", length: 1, fade: 0 },
    { color: "#008000", length: 4, fade: 0 },
  ],
  lengthUnit: "m",
  useFades: false,
  fadeAll: 0,
  skeinLength: 0,
  // Yarn reserved at the start of a new ball for weaving in, so unusable.
  tail: 0.15,
  // Empty until a ball actually runs out.
  joinRow: "",
  joinStitch: "",
  stitches: 140,
  rows: 50,
  stitchWidth: 4.5,
  rowHeight: 3.3,
  gaugeUnit: "mm",
  swatchWidth: 10,
  swatchHeight: 10,
  swatchStitches: 22,
  swatchRows: 30,
  swatchUnit: "cm",
  construction: "flat",

  // Rough placeholders throughout — the calibration solver is what turns them
  // into measurements.
  //
  // Stitches only. Turning and casting on are yarn the fabric really spends,
  // but neither makes a stitch, so each one lives with the thing it is an
  // allowance for rather than as a row here.
  types: [
    { name: "knit", code: "k", perStitch: 5 },
    { name: "purl", code: "p", perStitch: 5.5 },
    { name: "slipped", code: "s", perStitch: 2.5 },
  ],
  typeUnit: "cm",
  // Which of the two answers is in force, and which stitch the simple one
  // means.
  rowMode: "single",
  rowsAre: "knit",
  // Which sections have been opened. A closed section keeps its values but
  // does not apply them, so this is part of what is in force rather than a
  // note about the furniture.
  openSections: [],
  // Charged per row rather than per stitch, and zero until someone measures
  // it — which is how a knitter who never thinks about turning gets a fabric
  // that does not count it.
  turnPerRow: 0,
  // Not optional the way counting turns is — every fabric is cast on and bound
  // off, so there is no switch here, only how much each costs. They share a
  // unit, being the same kind of measurement side by side.
  castOnMeasured: 2.5,
  bindOffMeasured: 1.5,
  castOnUnit: "cm",

  // Which stitches to work out real figures for. "carried" means the stitch
  // cannot make a fabric on its own, so it has to share a swatch with one that
  // can — true of a slipped stitch by definition, not by preference.
  calTypes: [
    { name: "knit", use: true, carried: false },
    { name: "purl", use: true, carried: false },
    { name: "slipped", use: true, carried: true },
  ],
  calConstruction: "both",
  // Whether the search stops at a target precision or the moment the system
  // is solvable at all — see calibration.js's "minimal" flag.
  calSwatchMode: "target",
  calBudget: 3000,
  calPrecision: 1,
  calUnit: "cm",

  // The prescription, frozen when it was issued, and the measurements written
  // against it. Both have to survive a reload: knitting the swatches takes
  // days, and nobody is going to leave the tab open.
  calSwatches: [],
  calUnknowns: [],
  calMeasured: [],
  calMethod: "length",
  calWeights: [],
  // Kept apart because they rarely match: the cast-on tail is whatever was
  // guessed at the start, the bind-off tail is whatever happened to be left.
  calTailStart: 15,
  calTailEnd: 15,

  // 1 + 23 x 6 + 1 = 140 stitches, matching the default count. Two rows so the
  // block behaviour is visible straight away.
  // Two rows marked as a repeat, run 25 times: 140 stitches by 50 rows,
  // matching the counts above.
  template: [
    { tokens: ["s", "*3k", "3p*23", "s"], repeatStart: true, repeatEnd: false, repeatCount: 1 },
    { tokens: ["s", "*3p", "3k*23", "s"], repeatStart: false, repeatEnd: true, repeatCount: 25 },
  ],
};

function fieldValue(id) {
  return document.getElementById(id).value;
}

// Read back off the CSS variable the splitter writes, rather than measuring the
// panel — on a narrow screen the columns are stacked and the panel's measured
// width would have nothing to do with where the divider was left.
function currentControlsWidth() {
  const raw = document.querySelector(".page").style.getPropertyValue("--controls-width");
  return parseFloat(raw) || DEFAULT_SETTINGS.controlsWidth;
}

function fieldNumber(id) {
  return Number(document.getElementById(id).value);
}

// The form as it stands right now.
// Note this is not the same job as readSequence(): that one answers "what yarn
// is this, in metres" for the model. This one answers "what did the user type".
function readSettings() {
  return {
    version: SETTINGS_VERSION,
    controlsWidth: currentControlsWidth(),
    zoom: fieldNumber("zoom"),
    sequence: [...document.querySelectorAll(".colorRow")].map(function (row) {
      return {
        color: row.querySelector("input[type=color]").value,
        length: Number(row.querySelector(".length").value),
        fade: Number(row.dataset.fade) || 0,
      };
    }),
    lengthUnit: fieldValue("lengthUnit"),
    useFades: document.getElementById("useFades").checked,
    fadeAll: fieldNumber("fadeAll"),
    skeinLength: fieldNumber("skeinLength"),
    tail: fieldNumber("tail"),
    joinRow: fieldValue("joinRow"),
    joinStitch: fieldValue("joinStitch"),
    stitches: fieldNumber("stitches"),
    rows: fieldNumber("rows"),
    stitchWidth: fieldNumber("stitchWidth"),
    rowHeight: fieldNumber("rowHeight"),
    gaugeUnit: fieldValue("gaugeUnit"),
    swatchWidth: fieldNumber("swatchWidth"),
    swatchHeight: fieldNumber("swatchHeight"),
    swatchStitches: fieldNumber("swatchStitches"),
    swatchRows: fieldNumber("swatchRows"),
    swatchUnit: fieldValue("swatchUnit"),
    construction: document.querySelector("input[name=construction]:checked").value,
    types: readTypes(),
    typeUnit: fieldValue("typeUnit"),
    rowMode: document.querySelector("input[name=rowMode]:checked").value,
    rowsAre: fieldValue("rowsAre"),
    openSections: [...document.querySelectorAll("[data-section]")]
      .filter(function (box) { return box.open; })
      .map(function (box) { return box.dataset.section; }),
    turnPerRow: fieldNumber("turnPerRow"),
    castOnMeasured: fieldNumber("castOnMeasured"),
    bindOffMeasured: fieldNumber("bindOffMeasured"),
    castOnUnit: fieldValue("castOnUnit"),
    calTypes: readCalTypes(),
    calConstruction: document.querySelector("input[name=calConstruction]:checked").value,
    calSwatchMode: document.querySelector("input[name=calSwatchMode]:checked").value,
    calBudget: fieldNumber("calBudget"),
    calPrecision: fieldNumber("calPrecision"),
    calUnit: fieldValue("calUnit"),
    calSwatches: frozenSwatches(),
    calUnknowns: frozenUnknowns(),
    calMeasured: readMeasurements(),
    calMethod: document.querySelector("input[name=calMethod]:checked").value,
    calWeights: readWeightPairs(),
    calTailStart: fieldNumber("calTailStart"),
    calTailEnd: fieldNumber("calTailEnd"),
    template: readTemplateRows(),
  };
}

// Push a settings object back into the form.
function applySettings(s) {
  setColorRows(s.sequence);

  setControlsWidth(s.controlsWidth);
  document.getElementById("zoom").value = s.zoom;
  document.getElementById("useFades").checked = s.useFades;
  document.getElementById("fadeAll").value = s.fadeAll;
  document.getElementById("skeinLength").value = s.skeinLength;
  document.getElementById("tail").value = s.tail;
  document.getElementById("joinRow").value = s.joinRow;
  document.getElementById("joinStitch").value = s.joinStitch;
  document.getElementById("lengthUnit").value = s.lengthUnit;
  document.getElementById("stitches").value = s.stitches;
  document.getElementById("rows").value = s.rows;
  document.getElementById("stitchWidth").value = s.stitchWidth;
  document.getElementById("rowHeight").value = s.rowHeight;
  document.getElementById("gaugeUnit").value = s.gaugeUnit;
  document.getElementById("swatchWidth").value = s.swatchWidth;
  document.getElementById("swatchHeight").value = s.swatchHeight;
  document.getElementById("swatchStitches").value = s.swatchStitches;
  document.getElementById("swatchRows").value = s.swatchRows;
  document.getElementById("swatchUnit").value = s.swatchUnit;

  document.querySelector(
    "input[name=construction][value=" + s.construction + "]"
  ).checked = true;


  setTypeRows(s.types);
  document.getElementById("typeUnit").value = s.typeUnit;
  // The dropdown's options come from the rows, so it has to be rebuilt before
  // a value can be selected in it.
  refreshTypeChoices();
  document.querySelector("input[name=rowMode][value=" + s.rowMode + "]").checked = true;
  document.getElementById("rowsAre").value = s.rowsAre;

  // Mirrors the type table, so it can only be built once that exists.
  refreshCalTypes(s.calTypes);
  document.querySelector(
    "input[name=calConstruction][value=" + s.calConstruction + "]"
  ).checked = true;
  document.querySelector(
    "input[name=calSwatchMode][value=" + s.calSwatchMode + "]"
  ).checked = true;
  document.getElementById("calBudget").value = s.calBudget;
  document.getElementById("calPrecision").value = s.calPrecision;
  document.getElementById("calUnit").value = s.calUnit;

  document.querySelector(
    "input[name=calMethod][value=" + s.calMethod + "]"
  ).checked = true;
  setWeightRows(s.calWeights);
  document.getElementById("calTailStart").value = s.calTailStart;
  document.getElementById("calTailEnd").value = s.calTailEnd;
  restorePrescription(s.calSwatches, s.calUnknowns, s.calMeasured);

  const open = s.openSections || [];
  for (const box of document.querySelectorAll("[data-section]")) {
    box.open = open.includes(box.dataset.section);
  }

  document.getElementById("turnPerRow").value = s.turnPerRow;
  document.getElementById("castOnMeasured").value = s.castOnMeasured;
  document.getElementById("bindOffMeasured").value = s.bindOffMeasured;
  document.getElementById("castOnUnit").value = s.castOnUnit;
  setTemplateRows(s.template);
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readSettings()));
  } catch (e) {
    // Private browsing modes and a full quota both throw here. Being unable to
    // save is annoying, not fatal — it must not take the app down with it.
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const saved = JSON.parse(raw);
    if (!saved || saved.version !== SETTINGS_VERSION) return DEFAULT_SETTINGS;
    if (!Array.isArray(saved.sequence) || saved.sequence.length === 0) {
      return DEFAULT_SETTINGS;
    }
    if (!Array.isArray(saved.types) || saved.types.length === 0) {
      return DEFAULT_SETTINGS;
    }
    if (!Array.isArray(saved.template) || saved.template.length === 0) {
      return DEFAULT_SETTINGS;
    }
    // An empty list is legitimate here — a type table of nothing but turn would
    // produce one — so only the wrong shape is a reason to give up.
    if (!Array.isArray(saved.calTypes)) return DEFAULT_SETTINGS;
    // A half-restored prescription would be worse than none: measurements
    // would end up written against swatches nobody was told to knit.
    if (!Array.isArray(saved.calSwatches) || !Array.isArray(saved.calMeasured) ||
        !Array.isArray(saved.calUnknowns) || !Array.isArray(saved.calWeights) ||
        saved.calMeasured.length !== saved.calSwatches.length) {
      return DEFAULT_SETTINGS;
    }
    return saved;
  } catch (e) {
    // Corrupt or hand-edited storage. Defaults are always better than a crash.
    return DEFAULT_SETTINGS;
  }
}

// Dragging a resize grip changes the settings on every animation frame.
// Writing to localStorage is synchronous, so saving on each one would be a lot
// of wasted work; waiting for a pause collapses a whole drag into one save.
let saveTimer = null;

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSettings, 300);
}

console.log("settings.js loaded");
