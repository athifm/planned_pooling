// UI glue — not one of the four layers.
// Reads the form, runs the pipeline, hands the result to the renderer.
// The layers below know nothing about the page; this file is the only
// place that touches both.

const modeSet         = document.getElementById("mode");
const zoomInput       = document.getElementById("zoom");
const stitchesInput   = document.getElementById("stitches");
const rowsInput       = document.getElementById("rows");
const perStitchInput  = document.getElementById("perStitch");
const perStitchUnitInput = document.getElementById("perStitchUnit");
const stitchWidthInput = document.getElementById("stitchWidth");
const rowHeightInput   = document.getElementById("rowHeight");
const gaugeUnitInput   = document.getElementById("gaugeUnit");
const swatchUnitInput  = document.getElementById("swatchUnit");
const readout         = document.getElementById("readout");
const yarnReadout     = document.getElementById("yarnReadout");
const skeinLengthInput = document.getElementById("skeinLength");
const joinRowInput    = document.getElementById("joinRow");
const joinStitchInput = document.getElementById("joinStitch");
const joinAdvice      = document.getElementById("joinAdvice");
const tailInput       = document.getElementById("tail");
const canvasWrap      = document.getElementById("canvasWrap");
const canvasArea      = document.querySelector(".canvasArea");
const constructionSet = document.getElementById("construction");
const stitchesLabel   = document.getElementById("stitchesLabel");

function isCircular() {
  return document.querySelector("input[name=construction]:checked").value === "circular";
}

function isAdvanced() {
  return document.querySelector("input[name=mode]:checked").value === "advanced";
}

// The settings actually in force, as opposed to the ones sitting in the form.
//
// Basic mode forces the simple values. Advanced controls keep their values —
// they are only hidden, so switching back restores them — but while basic is
// selected those values are NOT applied. The rule is that what you can see is
// what is in effect; a hidden control quietly changing the result is the bug
// this exists to prevent.
//
// Steps 3 to 5 add their entries here.
// Says what turning is actually costing, since one turn per row sounds small
// and is not: it accumulates down the whole fabric.
function updateTurningNote(turnMetres, rows) {
  const note = document.getElementById("turningNote");
  document.body.classList.toggle("turning", turnMetres > 0);

  if (!isAdvanced()) { note.textContent = ""; return; }

  if (isCircular()) {
    note.textContent = "Knitting in the round never turns, so nothing is added.";
    return;
  }
  if (turnMetres <= 0) {
    note.textContent = "";
    return;
  }

  const unit = document.getElementById("typeUnit").value;
  const each = fromMetres(turnMetres, unit);
  const total = turnMetres * rows;
  note.textContent =
    "Adding " + each.toFixed(2) + " " + unit + " per row from the turn stitch type, " +
    total.toFixed(2) + " m over " + rows + " rows.";
}

function templateActive() {
  return isAdvanced() && document.getElementById("useTemplate").checked;
}

function turningActive() {
  // Knitting in the round never turns the work, so there is nothing to charge.
  return isAdvanced() && document.getElementById("useTurning").checked && !isCircular();
}

function inEffect() {
  const advanced = isAdvanced();
  return {
    zoom: advanced ? num(zoomInput) : DEFAULT_SETTINGS.zoom,
    consumptionMetres: advanced
      ? activeTypeMetres()
      : toMetres(num(perStitchInput), perStitchUnitInput.value),
    template: templateActive(),
    turnMetres: turningActive() ? typeMetresByName()[TURN_TYPE_NAME] || 0 : 0,
  };
}

// How much yarn the currently selected stitch type uses, in metres.
function activeTypeMetres() {
  const types = readTypes();
  const wanted = document.getElementById("activeType").value;
  const chosen = types.find(function (t) { return t.name === wanted; }) || types[0];
  if (!chosen) return 0;
  return toMetres(chosen.perStitch, document.getElementById("typeUnit").value);
}

// { knit: 0.05, purl: 0.055, ... } in metres.
function typeMetresByName() {
  const unit = document.getElementById("typeUnit").value;
  const map = {};
  for (const t of readTypes()) {
    map[t.name] = toMetres(t.perStitch, unit);
  }
  return map;
}

function currentTemplate() {
  return expandBlock(readTemplateRows(), typeNamesByCode());
}

function num(input) {
  return Number(input.value);
}

// The gauge boxes may be showing millimetres or inches; everything that uses
// them wants millimetres, so convert in one place.
function gaugeMm() {
  const unit = gaugeUnitInput.value;
  return {
    stitchWidth: fromMetres(toMetres(num(stitchWidthInput), unit), "mm"),
    rowHeight: fromMetres(toMetres(num(rowHeightInput), unit), "mm"),
  };
}

// On-screen size of one cell in CSS pixels, straight from the gauge.
// Because both dimensions come from the same gauge, cells keep the
// fabric's true proportions instead of stretching to fill the canvas.
function cellSize() {
  const gauge = gaugeMm();
  const zoom = inEffect().zoom;
  const w = gauge.stitchWidth * zoom;
  const h = gauge.rowHeight * zoom;
  // An emptied gauge box gives 0, and dividing pixels by a 0-wide cell
  // yields Infinity stitches — which would hang the grid loop.
  return { w: w > 0 ? w : 1, h: h > 0 ? h : 1 };
}

// The join the knitter has reported, as a stitch number, or null.
// Row and stitch are given the way a pattern reads them: both 1-based, and the
// stitch is the nth worked in that row, not a column — on a reversed row those
// are different things.
function reportedJoin(stitches, rows) {
  const row = num(joinRowInput);
  const stitch = num(joinStitchInput);
  if (!Number.isFinite(row) || !Number.isFinite(stitch)) return null;
  if (row < 1 || stitch < 1 || row > rows || stitch > stitches) return null;
  return (row - 1) * stitches + (stitch - 1);
}

// Which part of the join row came off the ball that just ran out. Everything
// above the row did; below it did not; within it, it depends which way the row
// was worked.
function joinBoundaryFor(k, stitches, circular) {
  const row = Math.floor(k / stitches);
  const within = k % stitches;
  const leftToRight = circular || row % 2 === 0;

  return leftToRight
    ? { row: row, fromCol: 0, toCol: within }
    : { row: row, fromCol: stitches - 1 - within, toCol: stitches - 1 };
}

// A swatch rather than a hex code: the instruction gets followed while looking
// at yarn, not at a colour picker.
function colorChip(color) {
  const chip = document.createElement("span");
  chip.className = "inlineSwatch";
  chip.style.background = color;
  return chip;
}

function say(parent, text) {
  parent.appendChild(document.createTextNode(text));
}

// Where to begin the next ball, given as both landmarks — a new ball can start
// anywhere in the repeat, so there is no knowing which of the two is in front
// of the knitter.
function showJoinAdvice(sequence, usedMetres) {
  joinAdvice.textContent = "";
  if (usedMetres === null) return;

  const spot = landmarkFor(sequence, usedMetres);
  if (!spot) return;

  const unit = lengthUnitInput.value;
  const back = fromMetres(spot.before.offset, unit);
  const forward = fromMetres(spot.after.offset, unit);

  say(joinAdvice, "Start the next ball " + back.toFixed(2) + " " + unit + " before pure ");
  joinAdvice.appendChild(colorChip(spot.before.color));
  say(joinAdvice, " begins — or " + forward.toFixed(2) + " " + unit + " after pure ");
  joinAdvice.appendChild(colorChip(spot.after.color));
  say(joinAdvice, " begins. ");

  // The tail is cut from the yarn before that point, so the point has to have
  // yarn behind it. Where the ball actually starts is unknowable, so this is a
  // note rather than something the arithmetic can settle.
  const tail = num(tailInput);
  if (tail > 0) {
    const repeat = fromMetres(repeatLength(sequence), unit);
    say(joinAdvice,
      "Leave a " + tail.toFixed(2) + " " + unit +
      " tail before it; if the ball has less than that in front, move on one " +
      "whole repeat (" + repeat.toFixed(2) + " " + unit + ").");
  }
}

// How many balls, given that each one after the first loses an unknown amount
// to reaching the right place in its colour sequence.
function showYarnNeeded(totalMetres, sequence) {
  const unit = lengthUnitInput.value;
  const total = fromMetres(totalMetres, unit);
  let text = "Needs " + total.toFixed(1) + " " + unit;

  const skein = toMetres(num(skeinLengthInput), unit);
  if (skein > 0) {
    // The first ball is not like the rest: you start knitting wherever it
    // starts, so none of it is spent reaching the right place in the sequence.
    // Every ball after it loses the tail, and up to a whole repeat on top if it
    // happens to begin just past the point the pattern needs.
    const repeat = repeatLength(sequence);
    const tail = toMetres(num(tailInput), unit);
    const bestLater = skein - tail;
    const worstLater = skein - repeat - tail;

    if (bestLater <= 0) {
      text += " — a ball this short is all tail";
    } else if (totalMetres <= skein) {
      text += " — 1 skein";
    } else {
      const rest = totalMetres - skein;
      const fewest = 1 + Math.ceil(rest / bestLater);
      const most = worstLater > 0 ? 1 + Math.ceil(rest / worstLater) : null;

      if (most === null) {
        text += " — " + fewest + " skeins at best, but a join can cost more " +
                "than a ball this short holds";
      } else if (fewest === most) {
        text += " — " + fewest + " skeins";
      } else {
        text += " — " + fewest + " to " + most + " skeins";
      }
    }
  }

  yarnReadout.textContent = text;
}

function draw() {
  const stitches = num(stitchesInput);
  const rows = num(rowsInput);
  // Number("") is 0 and Number("abc") is NaN. NaN < 1 is false, so a plain
  // "< 1" test would let NaN through into the loops.
  if (!Number.isFinite(stitches) || !Number.isFinite(rows)) return;
  if (stitches < 1 || rows < 1) return;

  const circular = isCircular();

  // In the round there is no row end, so the count is stitches per round,
  // and column 0 is the start of each round — the seam.
  stitchesLabel.textContent = circular ? "Stitches per round" : "Stitches";
  stitchesInput.setAttribute(
    "aria-label", circular ? "Stitches per round" : "Stitches per row"
  );

  // Unrolled, a tube's seam shows at both edges — they are the same line.
  const seams = circular ? [0, stitches] : null;
  canvasArea.classList.toggle("hasSeam", circular);

  // Layer 2 answers per stitch. With a template that answer varies across the
  // row; without one it is the same for every stitch.
  const effective = inEffect();
  let consumptionAt;

  if (effective.template) {
    const template = currentTemplate();
    // A broken template is reported next to the boxes by applyTemplate();
    // there is nothing sensible to draw until it is fixed.
    if (template.error) return;
    consumptionAt = blockConsumption(
      template.rows, typeMetresByName(), template.stitches
    );
  } else {
    consumptionAt = uniformConsumption(effective.consumptionMetres);
  }

  const sequence = readSequence();
  const grid = buildGrid(
    sequence, stitches, rows, consumptionAt, circular, effective.turnMetres
  );

  const join = reportedJoin(stitches, rows);
  const boundary = join === null ? null : joinBoundaryFor(join, stitches, circular);

  drawGrid(
    grid, canvas.width / stitches, canvas.height / rows, seams, boundary
  );

  showYarnNeeded(
    consumedThrough(stitches * rows - 1, stitches, consumptionAt, effective.turnMetres),
    sequence
  );
  showJoinAdvice(
    sequence,
    join === null
      ? null
      : consumedThrough(join, stitches, consumptionAt, effective.turnMetres)
  );

  // Knitted in the round the fabric is a tube, so its width measurement is
  // the way round it, not the way across it.
  updateTurningNote(effective.turnMetres, rows);

  const gauge = gaugeMm();
  const size = fabricSize(stitches, rows, gauge.stitchWidth, gauge.rowHeight);
  readout.textContent =
    size.widthCm.toFixed(1) + (circular ? " cm circumference, " : " cm wide, ") +
    size.heightCm.toFixed(1) + " cm tall";

  saveSoon();
}

// Match the canvas bitmap to the box the user sees. Without this the canvas
// keeps its default 300x150 bitmap and the browser stretches it, which looks
// blurry. devicePixelRatio keeps it sharp on high-density screens.
function resizeCanvasToWrapper() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(canvasWrap.clientWidth  * dpr);
  canvas.height = Math.round(canvasWrap.clientHeight * dpr);
}

// Guard against the resize feedback loop: typing a count resizes the box,
// which fires the observer, which would otherwise recompute the count from
// the pixels and could land one off what was actually typed.
let programmaticResize = false;

// Counts changed, so the box has to change to suit.
function sizeWrapperFromCounts() {
  const cell = cellSize();
  programmaticResize = true;
  canvasWrap.style.width  = Math.round(num(stitchesInput) * cell.w) + "px";
  canvasWrap.style.height = Math.round(num(rowsInput) * cell.h) + "px";
}

// The box was dragged, so the counts have to change to suit.
function countsFromWrapper() {
  const cell = cellSize();
  const counts = countsFromPixels(
    canvasWrap.clientWidth, canvasWrap.clientHeight, cell.w, cell.h
  );
  // With a template the fabric's size is whatever the template says it is —
  // dragging must not overwrite either figure.
  if (templateActive()) return;
  stitchesInput.value = counts.stitches;
  rowsInput.value = counts.rows;
}

// Matches the min-width/min-height in style.css.
const MIN_BOX_PX = 24;

// How close to the window edge a drag has to get before the page starts
// scrolling, and how fast it then scrolls.
const EDGE_PX = 40;
const AUTOSCROLL_PX = 12;

// Wire one grip. axis is "x" (stitches only), "y" (rows only) or "both".
// Pointer events cover mouse, pen and touch with the same code.
function makeResizeHandle(handle, axis) {
  handle.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    // Capture means we keep getting moves even when the pointer slides off
    // the grip — without it, a fast drag drops the moment you outrun it.
    handle.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = canvasWrap.clientWidth;
    const startH = canvasWrap.clientHeight;

    // The pointer cannot leave the window, so a drag alone can never make the
    // fabric bigger than the viewport. Holding near an edge scrolls the page
    // and grows the fabric by the same amount, which keeps the grip under the
    // pointer while the fabric carries on past the edge.
    let boostX = 0;
    let boostY = 0;
    let pointerX = e.clientX;
    let pointerY = e.clientY;
    let frame = null;

    function step() {
      // A template states the fabric's size in both directions, so dragging
      // has nothing left to change.
      const growX = axis !== "y" && !templateActive();
      const growY = axis !== "x" && !templateActive();
      let scrollX = 0;
      let scrollY = 0;

      if (growX && pointerX > window.innerWidth - EDGE_PX) {
        scrollX = AUTOSCROLL_PX;
      } else if (growX && pointerX < EDGE_PX && window.scrollX > 0) {
        scrollX = -AUTOSCROLL_PX;
      }
      if (growY && pointerY > window.innerHeight - EDGE_PX) {
        scrollY = AUTOSCROLL_PX;
      } else if (growY && pointerY < EDGE_PX && window.scrollY > 0) {
        scrollY = -AUTOSCROLL_PX;
      }

      boostX += scrollX;
      boostY += scrollY;

      if (growX) {
        canvasWrap.style.width =
          Math.max(MIN_BOX_PX, startW + pointerX - startX + boostX) + "px";
      }
      if (growY) {
        canvasWrap.style.height =
          Math.max(MIN_BOX_PX, startH + pointerY - startY + boostY) + "px";
      }

      // Scrolling shifts the grip left by the same amount the fabric grew, so
      // the two cancel and the grip stays put under the pointer.
      if (scrollX || scrollY) window.scrollBy(scrollX, scrollY);

      frame = requestAnimationFrame(step);
    }

    function onMove(ev) {
      pointerX = ev.clientX;
      pointerY = ev.clientY;
      // Size is set in step(); the observer redraws when it actually changes.
    }

    function onUp() {
      cancelAnimationFrame(frame);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
    frame = requestAnimationFrame(step);
  });
}

// The divider between the controls and the fabric. It only changes how much
// of the fabric is visible — the canvas keeps whatever pixel size the gauge
// and stitch count give it, so nothing needs redrawing.
const pageBox = document.querySelector(".page");
const splitter = document.getElementById("splitter");
const MIN_CONTROLS_PX = 320;
const MIN_FABRIC_PX = 260;

function setControlsWidth(px) {
  const room = Math.max(MIN_CONTROLS_PX, window.innerWidth - MIN_FABRIC_PX);
  const clamped = Math.min(Math.max(px, MIN_CONTROLS_PX), room);
  pageBox.style.setProperty("--controls-width", clamped + "px");
  return clamped;
}

splitter.addEventListener("pointerdown", function (e) {
  e.preventDefault();
  splitter.setPointerCapture(e.pointerId);
  splitter.classList.add("dragging");

  const startX = e.clientX;
  const startWidth = document.querySelector(".panel").getBoundingClientRect().width;

  function onMove(ev) {
    setControlsWidth(startWidth + ev.clientX - startX);
  }

  function onUp() {
    splitter.classList.remove("dragging");
    splitter.removeEventListener("pointermove", onMove);
    splitter.removeEventListener("pointerup", onUp);
    splitter.removeEventListener("pointercancel", onUp);
    saveSoon();
  }

  splitter.addEventListener("pointermove", onMove);
  splitter.addEventListener("pointerup", onUp);
  splitter.addEventListener("pointercancel", onUp);
});

makeResizeHandle(document.getElementById("handleRight"), "x");
makeResizeHandle(document.getElementById("handleBottom"), "y");
makeResizeHandle(document.getElementById("handleCorner"), "both");

new ResizeObserver(function () {
  if (programmaticResize) {
    programmaticResize = false;
  } else {
    countsFromWrapper();
  }
  resizeCanvasToWrapper();
  draw();
}).observe(canvasWrap);

// "change" fires on Enter or when the box loses focus — not on every
// keystroke, which would redraw a 1-stitch fabric while you type "140".
for (const input of [stitchesInput, rowsInput, stitchWidthInput, rowHeightInput]) {
  input.addEventListener("change", function () {
    sizeWrapperFromCounts();
    resizeCanvasToWrapper();
    draw();
  });
}

perStitchInput.addEventListener("change", draw);
constructionSet.addEventListener("change", draw);

// Switching mode changes which controls are visible AND which are in force,
// so both have to happen together — see inEffect().
function applyMode() {
  document.body.classList.toggle("advanced", isAdvanced());
  // Leaving advanced mode also turns any template off, so this has to run
  // first — it decides what the stitch count is.
  applyTemplate();
  // Zoom may have just come into or out of force, changing the cell size.
  sizeWrapperFromCounts();
  resizeCanvasToWrapper();
  draw();
}

// The size the user had before a template took the boxes over, so turning the
// template off gives them their fabric back rather than leaving them on
// whatever the template happened to be.
let sizeBeforeTemplate = null;

// Just the status line. Runs on every keystroke, so it must not resize
// anything — it only reports.
function updateTemplateMessage() {
  const box = document.getElementById("templateResult");
  if (!templateActive()) {
    box.textContent = "";
    return null;
  }

  const template = currentTemplate();
  box.textContent = template.error
    ? template.error
    : template.stitches + " stitches wide, " + template.rows.length + " rows tall.";
  return template;
}

function applyTemplate() {
  const active = templateActive();

  // A template states the fabric's size in both directions, so neither box is
  // the user's to edit and there is nothing for the grips to drag.
  stitchesInput.readOnly = active;
  rowsInput.readOnly = active;
  document.body.classList.toggle("templated", active);

  if (!active) {
    updateTemplateMessage();
    if (sizeBeforeTemplate !== null) {
      stitchesInput.value = sizeBeforeTemplate.stitches;
      rowsInput.value = sizeBeforeTemplate.rows;
      sizeBeforeTemplate = null;
      sizeWrapperFromCounts();
      resizeCanvasToWrapper();
      draw();
    }
    return;
  }

  const template = updateTemplateMessage();
  if (template.error) return;

  if (sizeBeforeTemplate === null) {
    sizeBeforeTemplate = { stitches: num(stitchesInput), rows: num(rowsInput) };
  }

  stitchesInput.value = template.stitches;
  rowsInput.value = template.rows.length;
  sizeWrapperFromCounts();
  resizeCanvasToWrapper();
  draw();
}

modeSet.addEventListener("change", applyMode);
zoomInput.addEventListener("change", applyMode);
// Reporting a join. Clicking is the quick way in; the boxes make it exact and
// let you say "row 20, stitch 87" without hunting for a 5px cell.
canvas.addEventListener("click", function (e) {
  const stitches = num(stitchesInput);
  const rows = num(rowsInput);
  if (!(stitches >= 1) || !(rows >= 1)) return;

  const box = canvas.getBoundingClientRect();
  const col = Math.floor(((e.clientX - box.left) / box.width) * stitches);
  const row = Math.floor(((e.clientY - box.top) / box.height) * rows);
  if (col < 0 || col >= stitches || row < 0 || row >= rows) return;

  // A column is not a stitch number on a reversed row, so go through layer 3.
  const k = stitchAt(row, col, stitches, isCircular());
  joinRowInput.value = Math.floor(k / stitches) + 1;
  joinStitchInput.value = (k % stitches) + 1;
  draw();
});

document.getElementById("clearJoin").addEventListener("click", function () {
  joinRowInput.value = "";
  joinStitchInput.value = "";
  draw();
});

for (const input of [joinRowInput, joinStitchInput, skeinLengthInput, tailInput]) {
  input.addEventListener("change", draw);
}

document.getElementById("useTurning").addEventListener("change", draw);
document.getElementById("useTemplate").addEventListener("change", applyTemplate);
document.getElementById("templateRows").addEventListener("change", applyTemplate);

// Gauge from a knitted sample. The millimetre boxes stay the source of truth;
// this only fills them in, so the arithmetic stays visible rather than hidden.
const swatchResult = document.getElementById("swatchResult");

document.getElementById("applySwatch").addEventListener("click", function () {
  const s = num(document.getElementById("swatchStitches"));
  const r = num(document.getElementById("swatchRows"));
  const w = num(document.getElementById("swatchWidth"));
  const h = num(document.getElementById("swatchHeight"));

  if (!(s >= 1) || !(r >= 1) || !(w > 0) || !(h > 0)) {
    swatchResult.textContent = "Every box needs a number greater than zero.";
    return;
  }

  // The swatch was measured in its own unit and the gauge boxes show theirs,
  // so go through metres rather than assuming either.
  const swatchUnit = swatchUnitInput.value;
  const gaugeUnit = gaugeUnitInput.value;
  const g = gaugeFromSwatch(s, r, toMetres(w, swatchUnit), toMetres(h, swatchUnit));

  const stitchWidth = fromMetres(g.stitchWidth, gaugeUnit);
  const rowHeight = fromMetres(g.rowHeight, gaugeUnit);

  stitchWidthInput.value = Number(stitchWidth.toFixed(3));
  rowHeightInput.value = Number(rowHeight.toFixed(3));
  swatchResult.textContent =
    "Gauge set to " + stitchWidth.toFixed(2) + " " + gaugeUnit + " per stitch, " +
    rowHeight.toFixed(2) + " " + gaugeUnit + " per row.";

  // Cell size changed, so the canvas box has to change with it.
  sizeWrapperFromCounts();
  resizeCanvasToWrapper();
  draw();
});

// change bubbles, so one listener on the container covers every color row,
// including rows added later.
colorRows.addEventListener("change", draw);

// Switching units should describe the same physical length, not silently
// redefine it — so convert what is already typed rather than reinterpreting it.
function convertBoxes(boxes, from, to) {
  for (const box of boxes) {
    const metres = toMetres(Number(box.value), from);
    box.value = Number(fromMetres(metres, to).toFixed(4));
  }
}

const lengthUnitInput = document.getElementById("lengthUnit");
let previousLengthUnit = lengthUnitInput.value;

lengthUnitInput.addEventListener("change", function () {
  const unit = lengthUnitInput.value;
  // Fades are lengths in the same unit, so they convert alongside the bands.
  convertBoxes(document.querySelectorAll(".colorRow .length"), previousLengthUnit, unit);
  convertBoxes([document.getElementById("fadeAll")], previousLengthUnit, unit);
  convertBoxes([skeinLengthInput, tailInput], previousLengthUnit, unit);
  convertFades(previousLengthUnit, unit);
  resyncFadeSliders();
  previousLengthUnit = unit;
  draw();
});

// Fades are a property of the yarn, so they are offered in both modes — but
// hidden until asked for, to keep the basic panel uncluttered.
const useFadesInput = document.getElementById("useFades");

function applyFades() {
  document.body.classList.toggle("fades", useFadesInput.checked);
  // Track widths are zero while the controls are hidden, so the labels can
  // only be placed once the class has made them visible.
  refreshFadeVisuals();
  draw();
}

useFadesInput.addEventListener("change", applyFades);

// A one-shot fill rather than a global setting that stays in force: a
// persistent global would have to be reconciled with the per-row values every
// time either changed. This writes the rows and gets out of the way.
document.getElementById("applyFadeAll").addEventListener("click", function () {
  const value = num(document.getElementById("fadeAll"));
  if (!Number.isFinite(value) || value < 0) return;
  // Sets the transition *length* on every row — the bulk operation worth
  // having is "all my transitions are about this long", not "they all start
  // at the same point", which would mean different things per band.
  setFadeOnAllRows(value);
  draw();
});

let previousPerStitchUnit = perStitchUnitInput.value;

perStitchUnitInput.addEventListener("change", function () {
  const unit = perStitchUnitInput.value;
  convertBoxes([perStitchInput], previousPerStitchUnit, unit);
  previousPerStitchUnit = unit;
  draw();
});

// Gauge boxes: converting them keeps the fabric the same size on screen, so
// switching to inches is purely a change of notation.
let previousGaugeUnit = gaugeUnitInput.value;

gaugeUnitInput.addEventListener("change", function () {
  const unit = gaugeUnitInput.value;
  convertBoxes([stitchWidthInput, rowHeightInput], previousGaugeUnit, unit);
  previousGaugeUnit = unit;
  draw();
});

// The swatch boxes feed nothing until "Use this gauge" is pressed, so
// converting them is only about not making the knitter re-measure.
let previousSwatchUnit = swatchUnitInput.value;

swatchUnitInput.addEventListener("change", function () {
  const unit = swatchUnitInput.value;
  convertBoxes(
    [document.getElementById("swatchWidth"), document.getElementById("swatchHeight")],
    previousSwatchUnit, unit
  );
  previousSwatchUnit = unit;
});
document.getElementById("addColor").addEventListener("click", draw);

// Stitch types. Renaming one changes what the "stitch used" dropdown offers,
// so the list is rebuilt on any change inside the table.
const typeUnitInput = document.getElementById("typeUnit");
let previousTypeUnit = typeUnitInput.value;

typeUnitInput.addEventListener("change", function () {
  const unit = typeUnitInput.value;
  convertBoxes(typeRows.querySelectorAll(".typeAmount"), previousTypeUnit, unit);
  previousTypeUnit = unit;
  draw();
});

typeRows.addEventListener("change", function () {
  refreshTypeChoices();
  // A code may have changed, which changes what every existing token means.
  updateAllRowCounts();
  applyTemplate();
  draw();
});

document.getElementById("activeType").addEventListener("change", draw);
document.getElementById("addType").addEventListener("click", draw);

// Anything changing anywhere in the controls is worth saving. "change" bubbles,
// so one listener covers every input and select in the panel, including colour
// rows added later. Dragging a grip is covered by the saveSoon() inside draw().
document.querySelector(".panel").addEventListener("change", saveSoon);

// Each unit dropdown remembers what it was showing, so it can convert from the
// old unit to the new one. Restoring saved settings changes those dropdowns
// without firing a change event, which would leave the remembered values
// pointing at the wrong unit — the next switch would then convert from it and
// silently mangle the numbers. So re-read the baselines after restoring.
function syncUnitBaselines() {
  previousLengthUnit = lengthUnitInput.value;
  previousPerStitchUnit = perStitchUnitInput.value;
  previousGaugeUnit = gaugeUnitInput.value;
  previousSwatchUnit = swatchUnitInput.value;
  previousTypeUnit = typeUnitInput.value;
}

applySettings(loadSettings());
syncUnitBaselines();
// Restoring the radio does not fire a change event, so the body class has to
// be set explicitly — the same hazard as the unit baselines above.
document.body.classList.toggle("advanced", isAdvanced());
document.body.classList.toggle("fades", useFadesInput.checked);
refreshFadeVisuals();
applyTemplate();

sizeWrapperFromCounts();
resizeCanvasToWrapper();
draw();

console.log("app.js loaded");
