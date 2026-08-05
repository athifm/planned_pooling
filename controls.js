// UI machinery for the yarn color rows.
// Creating and removing elements is browser boilerplate, not project logic.

const colorRows = document.getElementById("colorRows");

// Build one row: a color swatch, a length, an optional fade, and a remove
// button.
function addColorRow(color, length, fade) {
  const row = document.createElement("div");
  row.className = "colorRow";

  const swatch = document.createElement("input");
  swatch.type = "color";
  swatch.value = color;

  const len = document.createElement("input");
  len.type = "number";
  len.className = "length";
  len.value = length;
  len.step = "0.1";
  len.min = "0.1";
  // The visible "Length" heading is one column title above the whole list,
  // so each box carries its own label for anyone using a screen reader.
  len.setAttribute("aria-label", "Length");

  // Where in this band the colour starts fading into the next one. Shown only
  // when fades are switched on.
  //
  // What the user sets is a *position*: "the red stays pure until here". What
  // gets stored is the *transition length* that implies, kept on the row as a
  // data attribute. Storing the length rather than the position is what makes
  // a sharp band stay sharp when its length is edited — a transition is a
  // property of the dyeing, so it should not grow because the band did.
  row.dataset.fade = String(fade || 0);

  // The band's colour stretched into a track, with a marker where the fade
  // begins. The track is painted with the gradient it describes, so it is a
  // picture of that stretch of yarn rather than an abstract level.
  const fadeTrack = document.createElement("div");
  fadeTrack.className = "fadeTrack fadeCell";

  const fadeSlider = document.createElement("input");
  fadeSlider.type = "range";
  fadeSlider.className = "fadeSlider";
  fadeSlider.min = "0";
  fadeSlider.max = "1000";
  fadeSlider.step = "1";
  fadeSlider.setAttribute("aria-label", "Point where the color starts fading");

  // Rides above the marker. Still typeable, because the whole measuring rule
  // was about entering what you measured with a tape.
  const startBox = document.createElement("input");
  startBox.type = "number";
  startBox.className = "fadeLabel";
  startBox.step = "0.1";
  startBox.min = "0";
  startBox.setAttribute("aria-label", "Starts fading into the next color at");

  // The pin is its own element rather than part of the slider thumb. Browsers
  // position a thumb relative to the track in their own way, so a thumb tall
  // enough to stand above the track kept dipping into it. Out here its
  // position is exactly what we set.
  //
  // Being outside the input means it gets no dragging for free, so it carries
  // its own — the same pointer-capture pattern as the resize grips.
  const fadePin = document.createElement("span");
  fadePin.className = "fadePin";

  fadePin.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    fadePin.setPointerCapture(e.pointerId);

    function moveTo(clientX) {
      const box = fadeSlider.getBoundingClientRect();
      if (!box.width) return;
      const band = Number(len.value) || 0;
      // The hairline can reach the very ends of the track, so the position is
      // a plain fraction of its width.
      const fraction = Math.min(Math.max((clientX - box.left) / box.width, 0), 1);
      setFade(band - fraction * band);
      draw();
    }

    function onMove(ev) { moveTo(ev.clientX); }

    function onUp() {
      fadePin.removeEventListener("pointermove", onMove);
      fadePin.removeEventListener("pointerup", onUp);
      fadePin.removeEventListener("pointercancel", onUp);
    }

    fadePin.addEventListener("pointermove", onMove);
    fadePin.addEventListener("pointerup", onUp);
    fadePin.addEventListener("pointercancel", onUp);

    moveTo(e.clientX);
  });

  fadeTrack.appendChild(startBox);
  fadeTrack.appendChild(fadePin);
  fadeTrack.appendChild(fadeSlider);

  // The slider runs in thousandths of this band's own length, so it behaves
  // the same whatever unit the lengths are in, and the clamp falls out of the
  // range instead of being enforced separately. All the way right is sharp.
  // keepTyped leaves the box's text alone, so a precise typed figure is not
  // rounded away under the cursor. The stored fade is exact either way — only
  // the display is shortened, because a floating box has room for four digits.
  function setFade(wanted, keepTyped) {
    const band = Number(len.value) || 0;
    const clamped = Math.max(0, Math.min(wanted, band));
    row.dataset.fade = String(clamped);
    const begins = band - clamped;
    if (!keepTyped) startBox.value = Number(begins.toFixed(2));
    fadeSlider.value = band > 0 ? Math.round((begins / band) * 1000) : 1000;
    paintFadeTrack(row);
    positionFadeLabel(row);
  }

  function currentFade() {
    return Number(row.dataset.fade) || 0;
  }

  // Typed values wait for Enter or blur, as everywhere else. A slider does not
  // need to: every position it passes through is a value you meant, so it can
  // redraw live.
  startBox.addEventListener("change", function () {
    const band = Number(len.value) || 0;
    const typed = Number(startBox.value) || 0;
    const begins = Math.max(0, Math.min(typed, band));
    // Keep whatever precision was typed, unless it had to be clamped — then
    // the box has to show the value actually in force.
    setFade(band - begins, begins === typed);
  });

  fadeSlider.addEventListener("input", function () {
    const band = Number(len.value) || 0;
    setFade(band - (Number(fadeSlider.value) / 1000) * band);
    draw();
  });

  // A longer band moves the fade's starting point, but not its length.
  len.addEventListener("change", function () { setFade(currentFade()); });

  setFade(fade || 0);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "remove";
  remove.addEventListener("click", function () {
    // A yarn with no colors makes no sense — always keep one row.
    if (colorRows.children.length > 1) {
      row.remove();
      draw();   // defined in app.js, which loads after this file
    }
  });

  // A row's track ends in the *next* row's colour, so changing any swatch
  // repaints its neighbour above as well as itself.
  swatch.addEventListener("input", refreshFadeVisuals);

  row.appendChild(swatch);
  row.appendChild(len);
  row.appendChild(fadeTrack);
  row.appendChild(remove);
  colorRows.appendChild(row);

  refreshFadeVisuals();
}

// --- fade track painting ----------------------------------------------------

function nextRowOf(rowEl) {
  // The sequence repeats, so the last band grades into the first.
  return rowEl.nextElementSibling || colorRows.firstElementChild;
}

// Paint the track with the gradient it describes: this colour held pure up to
// the marker, then blending into the next band's colour.
function paintFadeTrack(rowEl) {
  const slider = rowEl.querySelector(".fadeSlider");
  if (!slider) return;

  const mine = rowEl.querySelector("input[type=color]").value;
  const next = nextRowOf(rowEl).querySelector("input[type=color]").value;
  const pct = Number(slider.value) / 10;

  slider.style.background =
    "linear-gradient(to right, " + mine + " 0%, " + mine + " " + pct + "%, " +
    next + " 100%)";
}

// Width of the slider's grab head. Must match the thumb width in style.css.
const FADE_THUMB_PX = 14;

// Put the floating length box over the marker.
//
// A thumb's centre does not travel the whole track: it runs from half its own
// width to the track width minus half. Placing the label at a plain percentage
// would leave it drifting off the head by up to half a thumb at each end.
function positionFadeLabel(rowEl) {
  const slider = rowEl.querySelector(".fadeSlider");
  const label = rowEl.querySelector(".fadeLabel");
  const pin = rowEl.querySelector(".fadePin");
  if (!slider || !label) return;

  const trackWidth = slider.offsetWidth;
  // Zero while the fade controls are hidden; positioned when they are shown.
  if (!trackWidth) return;

  const travel = trackWidth - FADE_THUMB_PX;
  const centre = FADE_THUMB_PX / 2 + (Number(slider.value) / 1000) * travel;

  // The pin marks the exact spot, so it is never clamped.
  if (pin) pin.style.left = centre + "px";

  // The label is only a readout, so it stops at the edges rather than hanging
  // off the row.
  const half = label.offsetWidth / 2;
  label.style.left = Math.min(Math.max(centre, half), trackWidth - half) + "px";
}

function refreshFadeVisuals() {
  for (const row of colorRows.querySelectorAll(".colorRow")) {
    paintFadeTrack(row);
    positionFadeLabel(row);
  }
}

// The labels are positioned in pixels, so anything that changes a track's width
// has to move them again.
//
// A window resize listener is not enough: dragging the splitter changes a CSS
// variable, the grid recomputes and the tracks get wider — with no event fired
// anywhere. Watching the element catches every cause, including ones nobody
// thought to wire up.
new ResizeObserver(refreshFadeVisuals).observe(colorRows);

document.getElementById("addColor").addEventListener("click", function () {
  addColorRow("#cccccc", 1);
});

// Replace the whole list. The starting rows are no longer created here — they
// come from the saved settings, or from the defaults in settings.js.
// The visible position and the slider are both derived from the stored fade
// length, so anything that writes that from outside — a unit switch, "apply to
// all" — has to ask for a redisplay. Firing the length box's own change event
// reuses the row's wiring rather than duplicating the maths out here.
function resyncFadeSliders() {
  for (const row of colorRows.querySelectorAll(".colorRow")) {
    row.querySelector(".length").dispatchEvent(new Event("change"));
  }
  refreshFadeVisuals();
}

// Every row's transition length, in whatever unit the boxes are showing.
function setFadeOnAllRows(fade) {
  for (const row of colorRows.querySelectorAll(".colorRow")) {
    row.dataset.fade = String(fade);
  }
  resyncFadeSliders();
}

// Fades are lengths too, so a unit switch has to convert them alongside the
// band lengths — they live in a data attribute rather than a box, so
// convertBoxes cannot reach them.
function convertFades(from, to) {
  for (const row of colorRows.querySelectorAll(".colorRow")) {
    const fade = Number(row.dataset.fade) || 0;
    row.dataset.fade = String(Number(fromMetres(toMetres(fade, from), to).toFixed(4)));
  }
}

function setColorRows(sequence) {
  colorRows.textContent = "";
  for (const band of sequence) {
    addColorRow(band.color, band.length, band.fade);
  }
}

// --- Stitch type rows -------------------------------------------------------
// Same machinery as the colour rows: a name, a consumption, a remove button.

const typeRows = document.getElementById("typeRows");

function addTypeRow(name, code, perStitch) {
  const row = document.createElement("div");
  row.className = "typeRow";

  const nameBox = document.createElement("input");
  nameBox.type = "text";
  nameBox.className = "typeName";
  nameBox.value = name;
  nameBox.setAttribute("aria-label", "Stitch type name");

  // The short code is what the row template is written in.
  const codeBox = document.createElement("input");
  codeBox.type = "text";
  codeBox.className = "typeCode";
  codeBox.value = code;
  codeBox.size = 3;
  codeBox.setAttribute("aria-label", "Stitch type code");

  const amount = document.createElement("input");
  amount.type = "number";
  amount.className = "typeAmount";
  amount.value = perStitch;
  amount.step = "0.1";
  amount.min = "0.01";
  amount.setAttribute("aria-label", "Yarn per stitch");

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "remove";
  remove.addEventListener("click", function () {
    // The fabric has to be knitted in something.
    if (typeRows.children.length > 1) {
      row.remove();
      refreshTypeChoices();
      refreshCalTypes();
      updateAllRowCounts();
      draw();
    }
  });

  row.appendChild(nameBox);
  row.appendChild(codeBox);
  row.appendChild(amount);
  row.appendChild(remove);
  typeRows.appendChild(row);
}

function setTypeRows(types) {
  typeRows.textContent = "";
  for (const t of types) {
    addTypeRow(t.name, t.code, t.perStitch);
  }
}

function readTypes() {
  return [...typeRows.querySelectorAll(".typeRow")].map(function (row) {
    return {
      name: row.querySelector(".typeName").value,
      code: row.querySelector(".typeCode").value.trim().toLowerCase(),
      perStitch: Number(row.querySelector(".typeAmount").value),
    };
  });
}

// Two rows in the stitch table are not stitches. Both are yarn a fabric really
// spends, so they belong in the table where they can be measured and edited —
// but neither one occupies a place in the knitting, and everything that walks
// the fabric has to skip them.
//
// Matched by name, so it is the row in the table that decides.
const TURN_TYPE_NAME = "turn";
const SETUP_TYPE_NAME = "setup";

function typeNameOf(type) {
  return type.name.trim().toLowerCase();
}

function isTurnType(type) {
  return typeNameOf(type) === TURN_TYPE_NAME;
}

function isSetupType(type) {
  return typeNameOf(type) === SETUP_TYPE_NAME;
}

// Charged per row and per cast-on stitch respectively, rather than per stitch
// worked. A fabric cannot be made of either.
function isNotAStitch(type) {
  return isTurnType(type) || isSetupType(type);
}

// { k: "knit", p: "purl", ... } for the template parser.
//
// Turn and setup are left out on purpose. Neither produces a stitch, so either
// one in a row template would add a phantom column to the fabric and charge
// twice — once as a stitch, once as the allowance it already is.
function typeNamesByCode() {
  const map = {};
  for (const t of readTypes()) {
    if (t.code && !isNotAStitch(t)) map[t.code] = t.name;
  }
  return map;
}

// The "stitch used" dropdown lists whatever types currently exist, so it has to
// be rebuilt whenever a type is added, removed or renamed.
function refreshTypeChoices() {
  const select = document.getElementById("activeType");
  const wanted = select.value;
  const wantedIndex = select.selectedIndex;
  const types = readTypes();

  select.textContent = "";
  for (const t of types) {
    // A fabric cannot be made entirely of turning the work, or of casting on.
    if (isNotAStitch(t)) continue;
    const option = document.createElement("option");
    option.value = t.name;
    option.textContent = t.name;
    select.appendChild(option);
  }

  // Keep the selection if that name still exists. If it does not, the usual
  // cause is that the selected type was just renamed — so hold the same
  // position in the list rather than jumping back to the first type.
  const stillThere = types.some(function (t) { return t.name === wanted; });
  if (stillThere) {
    select.value = wanted;
  } else if (types.length) {
    select.selectedIndex = Math.min(Math.max(wantedIndex, 0), types.length - 1);
  }
}

document.getElementById("addType").addEventListener("click", function () {
  addTypeRow("new stitch", "", 5);
  refreshTypeChoices();
  refreshCalTypes();
});

// --- Cast on ----------------------------------------------------------------

// Built from the table in layer 2 rather than written out in the HTML, so
// adding a method is a one-line change in the file that knows what one costs.
function fillCastOnMethods() {
  const select = document.getElementById("castOnMethod");
  select.textContent = "";
  for (const method of CAST_ON_METHODS) {
    const option = document.createElement("option");
    option.value = method.id;
    option.textContent = method.name;
    select.appendChild(option);
  }
}

fillCastOnMethods();

// --- Which stitches to calibrate --------------------------------------------
// A mirror of the stitch type table, so it has to be rebuilt whenever a type is
// added, removed or renamed — the same job as refreshTypeChoices, and for the
// same reason.

const calTypeList = document.getElementById("calTypes");

function addCalTypeRow(name, use, carried) {
  const row = document.createElement("div");
  row.className = "calTypeRow";
  // The name is the only handle on a type: it is what the solver's unknowns
  // are called and what a saved tick is matched against.
  row.dataset.name = name;

  const label = document.createElement("span");
  label.className = "calTypeName";
  label.textContent = name;

  const useLabel = document.createElement("label");
  useLabel.className = "calCheck";
  const useBox = document.createElement("input");
  useBox.type = "checkbox";
  useBox.className = "calUse";
  useBox.checked = use;
  useBox.setAttribute("aria-label", "Calibrate " + name);
  useLabel.appendChild(useBox);

  const carriedLabel = document.createElement("label");
  carriedLabel.className = "calCheck";
  const carriedBox = document.createElement("input");
  carriedBox.type = "checkbox";
  carriedBox.className = "calCarried";
  carriedBox.checked = carried;
  carriedBox.setAttribute("aria-label", name + " cannot fill a swatch on its own");
  carriedLabel.appendChild(carriedBox);

  // Whether a stitch needs carrying says nothing at all about a stitch that is
  // not being calibrated, so the box goes dead with it — the same rule as the
  // repeat marks. Its value survives, so unticking and reticking loses nothing.
  function syncCarried() {
    carriedBox.disabled = !useBox.checked;
    carriedLabel.classList.toggle("disabled", !useBox.checked);
  }
  useBox.addEventListener("change", syncCarried);
  syncCarried();

  row.appendChild(label);
  row.appendChild(useLabel);
  row.appendChild(carriedLabel);
  calTypeList.appendChild(row);
}

function readCalTypes() {
  return [...calTypeList.querySelectorAll(".calTypeRow")].map(function (row) {
    return {
      name: row.dataset.name,
      use: row.querySelector(".calUse").checked,
      carried: row.querySelector(".calCarried").checked,
    };
  });
}

// Rebuild the list from the stitch type table, keeping whatever was ticked.
//
// Ticks are matched by name, so renaming a type loses its ticks. That is the
// honest outcome: from out here a rename and a replacement look identical, and
// carrying a "cannot fill a swatch on its own" flag onto what might be a
// different stitch would be worse than asking again.
function refreshCalTypes(saved) {
  const previous = new Map();
  for (const t of saved || readCalTypes()) previous.set(t.name, t);

  calTypeList.textContent = "";
  for (const t of readTypes()) {
    // Neither is a stitch you can choose to calibrate. Turn is solved for
    // whenever a flat swatch is allowed and setup always, because every swatch
    // contains a cast-on whether anyone asked for one or not.
    if (isNotAStitch(t)) continue;
    const was = previous.get(t.name);
    addCalTypeRow(t.name, was ? was.use : true, was ? !!was.carried : false);
  }
}

// --- Length against weight --------------------------------------------------
// Same machinery as the colour rows: a pair of numbers and a remove button.

const weightRows = document.getElementById("weightRows");

function addWeightRow(length, grams) {
  const row = document.createElement("div");
  row.className = "weightRow";

  const lengthBox = document.createElement("input");
  lengthBox.type = "number";
  lengthBox.className = "weightLength";
  lengthBox.value = length;
  lengthBox.step = "0.1";
  lengthBox.min = "0";
  lengthBox.setAttribute("aria-label", "Length of yarn");

  const gramsBox = document.createElement("input");
  gramsBox.type = "number";
  gramsBox.className = "weightGrams";
  gramsBox.value = grams;
  gramsBox.step = "0.1";
  gramsBox.min = "0";
  gramsBox.setAttribute("aria-label", "What that length weighs, in grams");

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "remove";
  remove.addEventListener("click", function () {
    row.remove();
    showConversion();
    updateMeasurementReadout();
    saveSoon();
  });

  row.appendChild(lengthBox);
  row.appendChild(gramsBox);
  row.appendChild(remove);
  weightRows.appendChild(row);
}

function setWeightRows(pairs) {
  weightRows.textContent = "";
  for (const pair of pairs) addWeightRow(pair.length, pair.grams);
}

// Exactly as typed, in whatever unit the calibration boxes are showing — the
// caller converts, the same rule the colour rows follow.
//
// Strings, not numbers: a half-filled pair is a normal thing to have on screen,
// and Number("") is 0, which would save an empty row as a real measurement of
// nothing and bring it back looking like data.
function readWeightPairs() {
  return [...weightRows.querySelectorAll(".weightRow")].map(function (row) {
    return {
      length: row.querySelector(".weightLength").value,
      grams: row.querySelector(".weightGrams").value,
    };
  });
}

document.getElementById("addWeight").addEventListener("click", function () {
  addWeightRow("", "");
});

// --- One line per swatch knitted --------------------------------------------
// Not a list anyone adds to: it is the prescription, turned into somewhere to
// write the answers down. Duplicates are listed separately rather than grouped,
// because each one is a different physical object with its own measurement —
// the opposite of the prescription above, which is a list of things to make.

const measureRows = document.getElementById("measureRows");

function addMeasureRow(swatch, index, value, position, outOf) {
  const row = document.createElement("div");
  row.className = "measureRow";

  const what = document.createElement("div");
  what.className = "measureWhat";
  what.textContent = (index + 1) + ". " + describeSwatch(swatch) +
    (outOf > 1 ? " (" + position + " of " + outOf + ")" : "");

  const entry = document.createElement("div");
  entry.className = "measureEntry";

  const amount = document.createElement("input");
  amount.type = "number";
  amount.className = "measureAmount";
  amount.value = value === undefined ? "" : value;
  amount.step = "0.1";
  amount.min = "0";
  amount.setAttribute("aria-label", "What swatch " + (index + 1) + " measured");

  // Marked out from the other unit tags because this box holds grams when the
  // swatches are being weighed, not a length.
  const tag = document.createElement("span");
  tag.className = "unitTag measureUnit";

  // What the solver will actually be given: the measurement with both tails
  // taken off, and grams turned into length if that is how it was weighed.
  // Shown because it is not what was typed, and a figure the app changed
  // behind your back is a figure you cannot check.
  const net = document.createElement("span");
  net.className = "measureNet";

  entry.appendChild(amount);
  entry.appendChild(tag);
  entry.appendChild(net);

  row.appendChild(what);
  row.appendChild(entry);
  measureRows.appendChild(row);
}

function setMeasureRows(swatches, values) {
  measureRows.textContent = "";

  // "2 of 3" ties a line back to the grouped prescription above it, so it is
  // clear which pile of identical swatches this one came from.
  const totals = new Map();
  for (const swatch of swatches) {
    const key = swatchKey(swatch);
    totals.set(key, (totals.get(key) || 0) + 1);
  }

  const seen = new Map();
  swatches.forEach(function (swatch, i) {
    const key = swatchKey(swatch);
    const position = (seen.get(key) || 0) + 1;
    seen.set(key, position);
    addMeasureRow(swatch, i, values ? values[i] : "", position, totals.get(key));
  });
}

function readMeasurements() {
  return [...measureRows.querySelectorAll(".measureAmount")].map(function (box) {
    return box.value;
  });
}

// --- Row templates ----------------------------------------------------------
// Each row is a strip of one-token boxes with a running count above it, like a
// spreadsheet. Enter, space or Tab finishes a cell and moves on; backspace in
// an empty cell deletes it and steps back. There is always exactly one empty
// cell at the end to type into. The strip never wraps — it scrolls sideways,
// and the focused cell scrolls itself into view.

const templateRowsBox = document.getElementById("templateRows");

function cellStripOf(rowEl) {
  return rowEl.querySelector(".cellStrip");
}

function readRowTokens(rowEl) {
  return [...cellStripOf(rowEl).querySelectorAll(".templateCell")]
    .map(function (cell) { return cell.value.trim(); })
    .filter(function (token) { return token !== ""; });
}

function readTemplateRows() {
  return [...templateRowsBox.querySelectorAll(".templateRow")].map(function (rowEl) {
    return {
      tokens: readRowTokens(rowEl),
      repeatStart: rowEl.querySelector(".repeatStart").checked,
      repeatEnd: rowEl.querySelector(".repeatEnd").checked,
      repeatCount: Number(rowEl.querySelector(".repeatCount").value),
    };
  });
}

// Redraw the counter strip above one row's cells. Called on every keystroke,
// so it works from whatever is typed so far rather than demanding valid input.
function updateRowCounts(rowEl) {
  const counts = templateCounts(
    [...cellStripOf(rowEl).querySelectorAll(".templateCell")]
      .map(function (cell) { return cell.value.trim(); }),
    typeNamesByCode()
  );

  const strip = rowEl.querySelector(".countStrip");
  strip.textContent = "";

  for (const entry of counts) {
    const box = document.createElement("span");
    box.className = "countCell" + (entry.inGroup ? " inGroup" : "");
    box.textContent = entry.text;
    strip.appendChild(box);
  }
}

function ensureTrailingCell(rowEl) {
  const cells = cellStripOf(rowEl).querySelectorAll(".templateCell");
  const last = cells[cells.length - 1];
  if (!last || last.value.trim() !== "") addTemplateCell(rowEl, "");
}

function addTemplateCell(rowEl, value) {
  const cell = document.createElement("input");
  cell.type = "text";
  cell.className = "templateCell";
  cell.value = value;
  cell.setAttribute("aria-label", "Row template entry");

  cell.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      // Space separates cells here; it is never a character in a token.
      e.preventDefault();
      if (cell.value.trim() !== "") {
        ensureTrailingCell(rowEl);
        if (cell.nextElementSibling) cell.nextElementSibling.focus();
      }
      applyTemplate();
      return;
    }

    if (e.key === "Backspace" && cell.value === "") {
      const previous = cell.previousElementSibling;
      if (previous) {
        e.preventDefault();
        cell.remove();
        previous.focus();
        previous.setSelectionRange(previous.value.length, previous.value.length);
        updateRowCounts(rowEl);
        updateRowTotals();
        applyTemplate();
      }
    }
  });

  cell.addEventListener("input", function () {
    ensureTrailingCell(rowEl);
    updateRowCounts(rowEl);
    updateRowTotals();
    // The counters refresh on every keystroke, so the message has to as well —
    // otherwise it sits there contradicting them until the cell loses focus.
    updateTemplateMessage();
  });

  // Without this the caret walks off the right-hand edge and out of sight.
  cell.addEventListener("focus", function () {
    cell.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  // The turn chip always sits at the end of the row, so new cells go before it.
  const strip = cellStripOf(rowEl);
  const chip = strip.querySelector(".turnChip");
  if (chip) strip.insertBefore(cell, chip);
  else strip.appendChild(cell);
  return cell;
}

function addTemplateRow(row) {
  const tokens = row.tokens || [];
  const rowEl = document.createElement("div");
  rowEl.className = "templateRow";

  // Counter strip and cells share one scrolling box so they stay aligned.
  const scroller = document.createElement("div");
  scroller.className = "templateScroll";

  const counts = document.createElement("div");
  counts.className = "countStrip";

  const cells = document.createElement("div");
  cells.className = "cellStrip";

  // Shown only while turning is switched on. Not an input: the turn is added
  // to every row automatically, and it is here to make that visible rather
  // than to be edited.
  const turnChip = document.createElement("span");
  turnChip.className = "turnChip";
  turnChip.textContent = "t";
  turnChip.title = "Turning the work — costs yarn but makes no stitch";
  cells.appendChild(turnChip);

  scroller.appendChild(counts);
  scroller.appendChild(cells);

  // Repeat markers. A row can open a repeat, close one, or do both for a
  // single-row repeat. The count only means anything on the closing row, so it
  // only appears there.
  const marks = document.createElement("span");
  marks.className = "repeatMarks";

  const startLabel = document.createElement("label");
  startLabel.className = "repeatMark";
  const startBox = document.createElement("input");
  startBox.type = "checkbox";
  startBox.className = "repeatStart";
  startBox.checked = !!row.repeatStart;
  startBox.setAttribute("aria-label", "Start a repeat at this row");
  startLabel.appendChild(startBox);
  startLabel.appendChild(document.createTextNode("start"));

  const endLabel = document.createElement("label");
  endLabel.className = "repeatMark";
  const endBox = document.createElement("input");
  endBox.type = "checkbox";
  endBox.className = "repeatEnd";
  endBox.checked = !!row.repeatEnd;
  endBox.setAttribute("aria-label", "End a repeat at this row");
  endLabel.appendChild(endBox);
  endLabel.appendChild(document.createTextNode("end"));

  const countLabel = document.createElement("label");
  countLabel.className = "repeatCountLabel";
  countLabel.textContent = "x";
  const countBox = document.createElement("input");
  countBox.type = "number";
  countBox.className = "repeatCount";
  countBox.min = "1";
  countBox.value = row.repeatCount === undefined ? 1 : row.repeatCount;
  countBox.setAttribute("aria-label", "How many times the block repeats");
  countLabel.appendChild(countBox);

  startBox.addEventListener("change", updateRepeatAvailability);
  endBox.addEventListener("change", updateRepeatAvailability);

  marks.appendChild(startLabel);
  marks.appendChild(endLabel);
  marks.appendChild(countLabel);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "remove";
  remove.addEventListener("click", function () {
    // A block with no rows is not a pattern.
    if (templateRowsBox.children.length > 1) {
      rowEl.remove();
      // Removing a row can leave a later "end" with nothing open above it.
      updateRepeatAvailability();
      updateRowTotals();
      applyTemplate();
    }
  });

  const controls = document.createElement("div");
  controls.className = "templateControls";
  controls.appendChild(marks);
  controls.appendChild(remove);

  // The row's stitch count, outside the scroller so it stays put however far
  // the strip is scrolled. Rows must all come out the same width, so having
  // the figures in a column makes a mismatch obvious without reading the
  // error line underneath.
  const total = document.createElement("span");
  total.className = "rowTotal";

  // Controls first, then the strip, then the total: the controls then sit in
  // the same place on every row instead of shifting as the strip grows.
  rowEl.appendChild(controls);
  rowEl.appendChild(scroller);
  rowEl.appendChild(total);
  templateRowsBox.appendChild(rowEl);

  for (const token of tokens) addTemplateCell(rowEl, token);
  ensureTrailingCell(rowEl);
  updateRowCounts(rowEl);
  return rowEl;
}

function setTemplateRows(rows) {
  templateRowsBox.textContent = "";
  for (const row of rows) addTemplateRow(row);
  updateRepeatAvailability();
  updateRowTotals();
}

// Walking the rows in order says where each mark is legal, so the illegal
// states are unreachable rather than merely reported: "end" is offered only
// where a repeat is open, and "start" only where none is. Between them that
// makes an unmatched end and a nested repeat impossible to click into.
//
// Also owns the count box's visibility, since a repeat count means nothing
// except on a closing row.
function updateRepeatAvailability() {
  let open = false;

  for (const rowEl of templateRowsBox.querySelectorAll(".templateRow")) {
    const start = rowEl.querySelector(".repeatStart");
    const end = rowEl.querySelector(".repeatEnd");
    const countLabel = rowEl.querySelector(".repeatCountLabel");

    // Repeats do not nest, so a second start cannot be opened while one is
    // running. An already-checked one stays enabled whatever the state — a box
    // the user cannot untick is a trap, and settings saved before this rule
    // existed could still arrive nested.
    const canStart = !open || start.checked;
    start.disabled = !canStart;
    start.parentElement.classList.toggle("disabled", !canStart);
    start.parentElement.title = canStart
      ? "Start a repeat at this row"
      : "A repeat is already open — close it with end first";

    // A row may open and close its own repeat, so its own start counts first.
    if (start.checked) open = true;

    end.disabled = !open;
    end.parentElement.classList.toggle("disabled", !open);
    end.parentElement.title = open
      ? "Close the repeat at this row"
      : "No repeat is open — tick start on an earlier row first";

    // A disabled control must never hold a value the user cannot clear.
    if (!open && end.checked) end.checked = false;

    if (end.checked) open = false;

    countLabel.style.visibility = end.checked ? "visible" : "hidden";
  }
}

// Every row's stitch count, and whether it agrees with the first row.
function updateRowTotals() {
  const codes = typeNamesByCode();
  const rows = [...templateRowsBox.querySelectorAll(".templateRow")];

  const totals = rows.map(function (rowEl) {
    const cells = [...cellStripOf(rowEl).querySelectorAll(".templateCell")]
      .map(function (cell) { return cell.value.trim(); });
    const parsed = parseTemplate(cells, codes);
    return parsed.error ? null : parsed.stitches.length;
  });

  // Compare against the commonest width, not the first row's.
  //
  // Half-typed input often parses as a valid but short row — "s *3k 3p*" reads
  // as 7 stitches until the repeat count arrives — so using the first row as
  // the reference would flag every other row red while you edited row 1. The
  // majority is stable: whichever row you are editing is the odd one out.
  const tally = new Map();
  for (const n of totals) {
    if (n !== null) tally.set(n, (tally.get(n) || 0) + 1);
  }
  let reference;
  let best = 0;
  for (const [width, count] of tally) {
    if (count > best) { best = count; reference = width; }
  }

  rows.forEach(function (rowEl, i) {
    const box = rowEl.querySelector(".rowTotal");
    const n = totals[i];

    if (n === null) {
      box.textContent = "—";
      box.title = "This row cannot be read yet";
      box.classList.add("bad");
      return;
    }

    const mismatch = reference !== undefined && n !== reference;
    box.textContent = String(n);
    box.title = mismatch
      ? n + " stitches — does not match the first row's " + reference
      : n + " stitches";
    box.classList.toggle("bad", mismatch);
  });
}

// Recount every row — needed when a stitch code changes, since that changes
// what the existing tokens mean.
function updateAllRowCounts() {
  for (const rowEl of templateRowsBox.querySelectorAll(".templateRow")) {
    updateRowCounts(rowEl);
  }
  updateRowTotals();
}

document.getElementById("addTemplateRow").addEventListener("click", function () {
  // Copy the row above: the next row is nearly always a variation on the last
  // one, and retyping a long template is the main friction here.
  const existing = readTemplateRows();
  const previous = existing[existing.length - 1];
  addTemplateRow({
    tokens: previous ? previous.tokens.slice() : [],
    repeatStart: false,
    repeatEnd: false,
    repeatCount: 1,
  });
  // A new row may be the first place an open repeat can be closed.
  updateRepeatAvailability();
  updateRowTotals();
  applyTemplate();
});

// Read the rows back off the page as [{ color, length }, ...].
// Lengths come back in metres whatever unit the boxes are showing, so nothing
// downstream has to know a unit exists.
function readSequence() {
  const crows = document.querySelectorAll(".colorRow");
  const unit = document.getElementById("lengthUnit").value;
  const out = [];

  const fading = document.getElementById("useFades").checked;

  for (const row of crows) {
    const col = row.querySelector("input[type=color]").value;
    const len = Number(row.querySelector(".length").value);
    // The fade values stay on the rows when the toggle is off, so they are
    // still there when it goes back on — but they are not applied.
    const fade = fading ? Number(row.dataset.fade) || 0 : 0;
    out.push({
      color: col,
      length: toMetres(len, unit),
      fade: toMetres(fade, unit),
    });
  }

  return out;
}

console.log("controls.js loaded");
