// UI glue — not one of the four layers.
// Reads the form, runs the pipeline, hands the result to the renderer.
// The layers below know nothing about the page; this file is the only
// place that touches both.

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
const staleBadge      = document.getElementById("staleBadge");
const canvasWrap      = document.getElementById("canvasWrap");
const canvasArea      = document.querySelector(".canvasArea");
const constructionSet = document.getElementById("construction");
const castOnMethodInput = document.getElementById("castOnMethod");
const castOnInput = document.getElementById("castOnPerStitch");
const castOnMeasuredInput = document.getElementById("castOnMeasured");
const bindOffMeasuredInput = document.getElementById("bindOffMeasured");
const castOnUnitInput = document.getElementById("castOnUnit");
const turnInput = document.getElementById("turnPerRow");
const turnUnitInput = document.getElementById("turnUnit");

// The three figures the solver finds that are not stitches, named as
// calibration.js names them. Each lives with the thing it is an allowance for,
// so the app has to know where to put an answer.
const TURN_FIGURE = "turn";
const CAST_ON_FIGURE = "castOn";
const BIND_OFF_FIGURE = "bindOff";

function turnMetres() {
  return toMetres(num(turnInput), turnUnitInput.value);
}

function measuredCastOnMetres() {
  return toMetres(num(castOnMeasuredInput), castOnUnitInput.value);
}

function measuredBindOffMetres() {
  return toMetres(num(bindOffMeasuredInput), castOnUnitInput.value);
}
const stitchesLabel   = document.getElementById("stitchesLabel");

function isCircular() {
  return document.querySelector("input[name=construction]:checked").value === "circular";
}

// --- Which sections have their extra depth in force -------------------------
//
// There is no mode any more. Every question that used to be "is the mode
// advanced" was really a question about one section — is the stitch table in
// force, is the template, is the turning allowance — and they only ever agreed
// because one radio answered for all of them.
//
// Each section is a details element now, and opening it is what puts its
// contents in force. The rule is unchanged and only narrower: what you can see
// is what is in effect.
// Short names for talking about a section in a sentence. The summaries read
// as invitations ("More than one kind of stitch"), which is right on the
// control and wrong in prose.
const SECTION_NAMES = {
  display: "Display",
  stitchTypes: "Stitches",
  template: "Row template",
  turning: "Turning",
  castOn: "Cast on",
  calibration: "Calibration",
};

const SECTIONS = [
  "display",      // zoom
  "stitchTypes",  // the type table, in place of one yarn-per-stitch figure
  "template",     // rows built from a template
  "turning",      // yarn spent turning at each row end
  "castOn",       // the measured setup figure, in place of the method's
  "calibration",  // measuring your own figures from swatches
];

function sectionOpen(name) {
  if (!SECTIONS.includes(name)) {
    // A typo would otherwise read as "that section is closed" and quietly
    // change what is in force, which is the hardest kind of bug to see.
    console.warn("sectionOpen: no section called " + name);
  }

  let box = document.querySelector('[data-section="' + name + '"]');
  if (!box) return false;

  // A section inside a closed one is not in force whatever its own state.
  // This is what makes nesting do the work that dependency rules would
  // otherwise have to: a row template is written in stitch codes, so putting
  // the stitch table away has to take the template with it, and the shape
  // says so rather than the code remembering to.
  while (box) {
    if (!box.open) return false;
    box = box.parentElement && box.parentElement.closest("details");
  }
  return true;
}

// Mirror the section states onto the body so styling can follow them. The one
// yarn-per-stitch figure has to disappear when the table that replaces it is
// opened, or two controls would be claiming the same job and only one of them
// would be listened to.
// Open whatever a control sits inside, ancestors and all, and say which
// sections that was. A nested section needs its parents open to be in force,
// so opening one on its own would be no use.
function openSectionsAround(element) {
  const opened = [];
  let box = element.closest("details");

  while (box) {
    if (!box.open) {
      box.open = true;
      if (box.dataset.section) opened.push(SECTION_NAMES[box.dataset.section]);
    }
    box = box.parentElement && box.parentElement.closest("details");
  }
  return opened;
}

function reflectSections() {
  for (const box of document.querySelectorAll("[data-section]")) {
    const name = box.dataset.section;
    document.body.classList.toggle("open-" + name, sectionOpen(name));
  }
}

// Says what turning is actually costing, since one turn per row sounds small
// and is not: it accumulates down the whole fabric.
function updateTurningNote(perTurn, rows) {
  const note = document.getElementById("turningNote");
  document.body.classList.toggle("turning", perTurn > 0);

  if (!sectionOpen("turning")) { note.textContent = ""; return; }

  if (isCircular()) {
    note.textContent = "Knitting in the round never turns, so nothing is added.";
    return;
  }
  if (perTurn <= 0) {
    note.textContent = "";
    return;
  }

  const unit = turnUnitInput.value;
  const each = fromMetres(perTurn, unit);
  const total = perTurn * rows;
  note.textContent =
    "Adding " + each.toFixed(2) + " " + unit + " per row, " +
    total.toFixed(2) + " m over " + rows + " rows.";
}

// What the cast-on is costing, and — the part worth spelling out — that it
// moves the whole pattern. Several metres go on the needles before the first
// stitch, so the fabric starts that far into the ball.
function updateCastOnNote(castOnPerStitch, allowancePerStitch, stitches) {
  const note = document.getElementById("castOnNote");
  const unit = castOnUnitInput.value;

  // The measured boxes share the unit dropdown a row above them, which is far
  // enough away to leave bare numbers sitting there in no unit at all.
  document.getElementById("castOnMeasuredTag").textContent = unit;
  document.getElementById("bindOffMeasuredTag").textContent = unit;

  if (!(castOnPerStitch > 0) || !(stitches > 0)) {
    note.textContent = "";
    return;
  }

  const start = castOnPerStitch * stitches;
  const bindOff = (allowancePerStitch - castOnPerStitch) * stitches;

  // Per stitch in the box's own unit, totals in metres — the same split the
  // turning note uses, because a few centimetres per stitch and a few metres
  // over a fabric are different sizes of thing.
  let text = "Casting on " + stitches + " stitches takes " +
    fromMetres(castOnPerStitch, unit).toFixed(2) + " " + unit + " each, " +
    start.toFixed(2) + " m in all — so the fabric begins that far into the " +
    "ball, and the colors shift with it.";

  text += sectionOpen("castOn")
    ? " Binding off adds " + bindOff.toFixed(2) + " m at the far end, which " +
      "changes the total but moves nothing."
    : " Binding off costs yarn as well; calibrate to count it.";

  note.textContent = text;
}

function templateActive() {
  return sectionOpen("template");
}

function turningActive() {
  // Opening the section is what switches this on — there is no separate tick,
  // because a checkbox inside a disclosure would be two ways to say the same
  // thing and could disagree.
  //
  // Knitting in the round never turns the work, so there is nothing to charge.
  return sectionOpen("turning") && !isCircular();
}

// Yarn per stitch spent casting on, in metres.
//
// This is the figure that moves the pattern, so it has to be the cast-on
// alone. A measured one replaces the method's guess outright — the method was
// only ever a stand-in for a number nobody had yet.
function castOnMetres() {
  return sectionOpen("castOn")
    ? measuredCastOnMetres()
    : toMetres(num(castOnInput), castOnUnitInput.value);
}

// Yarn per stitch spent at both ends together, for the total.
//
// Without measurements this knows only about casting on: a method says nothing
// about how you bind off, and inventing a second number would be worse than
// leaving it out and saying so.
function endAllowanceMetres() {
  return sectionOpen("castOn")
    ? measuredCastOnMetres() + measuredBindOffMetres()
    : toMetres(num(castOnInput), castOnUnitInput.value);
}

// The settings actually in force, as opposed to the ones sitting in the form.
//
// A closed section keeps its values — they are only hidden, so opening it
// again restores them — but while it is closed those values are NOT applied.
// The rule is that what you can see is what is in effect; a hidden control
// quietly changing the result is the bug this exists to prevent.
function inEffect() {
  return {
    zoom: sectionOpen("display") ? num(zoomInput) : DEFAULT_SETTINGS.zoom,
    consumptionMetres: sectionOpen("stitchTypes")
      ? activeTypeMetres()
      : toMetres(num(perStitchInput), perStitchUnitInput.value),
    template: templateActive(),
    turnMetres: turningActive() ? turnMetres() : 0,
    castOnMetres: castOnMetres(),
    endAllowanceMetres: endAllowanceMetres(),
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
// Why a reported join is not being shown, or null if there is nothing to say.
//
// Not a blocking problem — the fabric is perfectly drawable — but the marker
// silently vanishing when you type row 999 is no more helpful than a stale
// picture would be. Empty boxes are not a mistake; half-filled or out of range
// is.
function joinComplaint(stitches, rows) {
  const row = joinRowInput.value.trim();
  const stitch = joinStitchInput.value.trim();

  if (row === "" && stitch === "") return null;
  if (row === "" || stitch === "") return "Needs both a row and a stitch.";

  const r = Number(row);
  const s = Number(stitch);
  if (!Number.isFinite(r) || !Number.isFinite(s)) {
    return "Row and stitch both have to be numbers.";
  }
  if (r < 1 || r > rows) {
    return "Row " + r + " is outside this fabric, which has " + rows + ".";
  }
  if (s < 1 || s > stitches) {
    return "Stitch " + s + " is outside a row of " + stitches + ".";
  }
  return null;
}

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
function showJoinAdvice(sequence, usedMetres, complaint) {
  joinAdvice.textContent = "";
  joinAdvice.classList.toggle("bad", Boolean(complaint));

  if (complaint) {
    joinAdvice.textContent = complaint;
    return;
  }
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
    // A broken template is reported next to the boxes by syncTemplateState();
    // there is nothing sensible to draw until it is fixed.
    if (template.error) return;
    consumptionAt = blockConsumption(
      template.rows, typeMetresByName(), template.stitches
    );
  } else {
    consumptionAt = uniformConsumption(effective.consumptionMetres);
  }

  // Yarn gone before the first stitch, and yarn spent at both ends together.
  // They are different numbers: the first moves the pattern, the second only
  // adds to the bill.
  const startMetres = effective.castOnMetres * stitches;
  const allowance = effective.endAllowanceMetres * stitches;

  const sequence = readSequence();
  const grid = buildGrid(
    sequence, stitches, rows, consumptionAt, circular, effective.turnMetres, startMetres
  );

  const join = reportedJoin(stitches, rows);
  const boundary = join === null ? null : joinBoundaryFor(join, stitches, circular);

  drawGrid(
    grid, canvas.width / stitches, canvas.height / rows, seams, boundary
  );

  showYarnNeeded(
    consumedThrough(stitches * rows - 1, stitches, consumptionAt, effective.turnMetres) +
      allowance,
    sequence
  );
  // Where in the ball this point falls, which is what the next ball has to
  // match — so the cast-on counts, having come off the ball before any of it.
  showJoinAdvice(
    sequence,
    join === null
      ? null
      : startMetres +
        consumedThrough(join, stitches, consumptionAt, effective.turnMetres),
    joinComplaint(stitches, rows)
  );

  // Knitted in the round the fabric is a tube, so its width measurement is
  // the way round it, not the way across it.
  updateTurningNote(effective.turnMetres, rows);
  updateCastOnNote(effective.castOnMetres, effective.endAllowanceMetres, stitches);

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
    // We caused this by sizing the box from the counts, so the counts are
    // already right and reading them back could land one off what was typed.
    programmaticResize = false;
    regenerate({ sizeFrom: "none" });
  } else {
    regenerate({ sizeFrom: "pixels" });
  }
}).observe(canvasWrap);


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

// What the template does to the rest of the form: locks the count boxes, or
// gives them back. State only — no sizing and no drawing, so regenerate() can
// call it first and then do those once for everybody.
function syncTemplateState() {
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
}

// Everything that would stop the fabric being drawn, found in one pass.
//
// Blocking only. These are the cases where draw() has nothing to paint, which
// is precisely what used to leave the previous fabric on screen with nothing
// marking it stale. Problems that merely make a fabric incomplete — a
// half-filled swatch, a template whose rows disagree — are reported by the
// panel that owns them, in its own words, beside the control concerned.
function problems() {
  const found = [];
  function bad(element, message) {
    found.push({ element: element, message: message });
  }

  // Number("") is 0 and Number("abc") is NaN, and NaN fails every comparison —
  // so this has to test for finiteness rather than assume a "< 1" catches it.
  const stitches = num(stitchesInput);
  const rows = num(rowsInput);
  if (!Number.isFinite(stitches) || stitches < 1) {
    bad(stitchesInput, "Needs to be at least 1.");
  }
  if (!Number.isFinite(rows) || rows < 1) {
    bad(rowsInput, "Needs to be at least 1.");
  }

  // A stitch of no width gives a fabric of no size, and dividing the canvas
  // by it produces an infinite number of columns.
  if (!(num(stitchWidthInput) > 0)) {
    bad(stitchWidthInput, "A stitch has to have a width.");
  }
  if (!(num(rowHeightInput) > 0)) {
    bad(rowHeightInput, "A row has to have a height.");
  }

  if (sectionOpen("display") && !(num(zoomInput) > 0)) {
    bad(zoomInput, "Needs to be more than zero.");
  }

  // Yarn with no length has no colour anywhere: colorAt divides by the repeat.
  for (const row of colorRows.querySelectorAll(".colorRow")) {
    const box = row.querySelector(".length");
    if (!(Number(box.value) > 0)) bad(box, "Every color needs a length.");
  }

  // A stitch that eats no yarn never advances along the ball, so every stitch
  // after it would come out the same colour. The turning and cast-on
  // allowances may legitimately be zero, which is why they are not here.
  if (sectionOpen("stitchTypes")) {
    for (const row of typeRows.querySelectorAll(".typeRow")) {
      const box = row.querySelector(".typeAmount");
      if (!(Number(box.value) > 0)) bad(box, "A stitch has to use some yarn.");
    }
  } else if (!(num(perStitchInput) > 0)) {
    bad(perStitchInput, "A stitch has to use some yarn.");
  }

  // The template states the whole fabric, so if it cannot be read there is no
  // fabric. Its own message box already says what is wrong with it in detail.
  if (templateActive() && currentTemplate().error) {
    bad(
      document.querySelector('[data-section="template"] > summary'),
      "The template below cannot be read."
    );
  }

  return found;
}

// Mark what is wrong and where, then let the canvas say that something is.
//
// Both, deliberately: the mark beside the control says where, and the canvas
// says that — which is the half you need when the panel is scrolled away from
// the offending box.
function showProblems(found) {
  for (const marked of document.querySelectorAll(".problem")) {
    marked.classList.remove("problem");
  }
  for (const note of document.querySelectorAll(".problemNote")) note.remove();

  document.body.classList.toggle("invalid", found.length > 0);

  for (const problem of found) {
    if (!problem.element) continue;
    problem.element.classList.add("problem");

    // Hung on the nearest container that lays its children out in a row, so
    // the note can span it rather than being squeezed into a grid column.
    const host = problem.element.closest(
      ".fields, .colorRow, .typeRow, .dimension, fieldset"
    );
    if (!host) continue;

    const note = document.createElement("p");
    note.className = "problemNote";
    note.textContent = problem.message;
    host.appendChild(note);
  }

  staleBadge.textContent = found.length === 0
    ? ""
    : found.length === 1
      ? "Out of date — one thing needs fixing"
      : "Out of date — " + found.length + " things need fixing";
}

// The one way anything reaches the fabric.
//
// Every control used to carry its own list of follow-up steps, and some needed
// more than others — a gauge change has to resize the canvas box, a template
// change has to derive the counts first. Forgetting either when adding a
// control produced a fabric that was quietly out of date, and the list of
// controls only grows. So there is one path now, it always does everything,
// and a new control is covered the moment it exists.
//
// sizeFrom says where the fabric's size comes from on this pass:
//   "counts"  the boxes are right and the canvas should follow them
//   "pixels"  the box was dragged and the counts should follow it
//   "none"    neither moved, so touch neither
function regenerate(options) {
  const sizeFrom = (options && options.sizeFrom) || "counts";

  // First, because everything after it depends on which sections are in force.
  reflectSections();
  // Then this, because it decides what the counts are.
  syncTemplateState();

  const found = problems();
  showProblems(found);

  // Stop before touching the canvas, not after. Resizing its bitmap wipes it,
  // so anything past this point would leave an empty box rather than the last
  // fabric that made sense — and that fabric is what you were comparing
  // against when you started typing.
  if (found.length > 0) return;

  if (sizeFrom === "counts") sizeWrapperFromCounts();
  else if (sizeFrom === "pixels") countsFromWrapper();

  resizeCanvasToWrapper();
  draw();
}

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
  // The canvas is outside the panel, so this one has to ask for itself.
  regenerate();
});

document.getElementById("clearJoin").addEventListener("click", function () {
  joinRowInput.value = "";
  joinStitchInput.value = "";
  regenerate();
});

// Picking a method fills in what it costs. The figures are rough, so the box
// stays editable — and editing it moves the method to "measured myself", so a
// typed number is never left sitting under a label that did not produce it.
castOnMethodInput.addEventListener("change", function () {
  const method = castOnMethod(castOnMethodInput.value);
  if (method.perStitch !== null) {
    castOnInput.value = Number(
      fromMetres(toMetres(method.perStitch, "cm"), castOnUnitInput.value).toFixed(3)
    );
  }
});

castOnInput.addEventListener("change", function () {
  const method = castOnMethod(castOnMethodInput.value);
  const typed = toMetres(num(castOnInput), castOnUnitInput.value);
  if (method.perStitch !== null && Math.abs(typed - toMetres(method.perStitch, "cm")) > 1e-9) {
    castOnMethodInput.value = "other";
  }
});

let previousCastOnUnit = castOnUnitInput.value;

castOnUnitInput.addEventListener("change", function () {
  const unit = castOnUnitInput.value;
  convertBoxes(
    [castOnInput, castOnMeasuredInput, bindOffMeasuredInput], previousCastOnUnit, unit
  );
  previousCastOnUnit = unit;
});

let previousTurnUnit = turnUnitInput.value;

turnUnitInput.addEventListener("change", function () {
  const unit = turnUnitInput.value;
  convertBoxes([turnInput], previousTurnUnit, unit);
  previousTurnUnit = unit;
});

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

  // A click, not a change, so it asks for itself — and the cell size just
  // moved, which regenerate() takes care of along with everything else.
  regenerate();
});

// --- Calibration ------------------------------------------------------------
// calibration.js does the arithmetic and knows nothing about the page. This is
// the part that turns the panel into a request, and the answer back into words.

const calibrationSet = document.getElementById("calibration");
const prescriptionBox = document.getElementById("prescription");
const calUnitInput = document.getElementById("calUnit");
const calPrecisionInput = document.getElementById("calPrecision");
const calBudgetInput = document.getElementById("calBudget");

// Unknowns the solver has to find that nobody chose from the stitch table, so
// they need explaining wherever they turn up.
const CALIBRATION_NOTES = {
  castOn: "the yarn that goes on the needles before the first stitch",
  bindOff: "finishing the last row off, which no swatch can measure unless " +
    "another one is left unfinished",
  turn: "turning the work at the end of a flat row",
};

function calibrationRequest() {
  const unit = document.getElementById("typeUnit").value;
  const current = {};
  for (const t of readTypes()) current[t.name] = toMetres(t.perStitch, unit);

  return {
    types: readCalTypes()
      .filter(function (t) { return t.use; })
      .map(function (t) {
        return { name: t.name, dependent: t.carried, current: current[t.name] };
      }),
    construction: document.querySelector("input[name=calConstruction]:checked").value,
    budget: num(calBudgetInput),
    // How far one measurement can be out. This decides everything downstream:
    // what precision is reachable at all, and so what is worth knitting.
    sigma: toMetres(num(calPrecisionInput), calUnitInput.value),
    // The targets are a percentage of what the app currently believes, so
    // calibration is always asked to improve on the figure it is replacing.
    // These two are not in the stitch table, so they are read from where they
    // now live rather than from the map above.
    turnCurrent: turnMetres(),
    castOnCurrent: measuredCastOnMetres(),
    bindOffCurrent: measuredBindOffMetres(),
  };
}

function calNote(text) {
  const p = document.createElement("p");
  p.className = "hint";
  p.textContent = text;
  prescriptionBox.appendChild(p);
}

// Per-stitch figures are small, and their error bars are smaller still, so a
// fixed number of decimals either rounds them to nothing or buries the useful
// ones in noise.
function calAmount(metres, unit) {
  const value = fromMetres(metres, unit);
  // Size picks the precision; the sign is kept. Hiding it would turn an
  // impossible answer into a plausible-looking one, which is the one thing
  // this readout must never do.
  const size = Math.abs(value);
  const digits = size >= 1 ? 2 : size >= 0.01 ? 3 : 4;
  return value.toFixed(digits) + " " + unit;
}

function showPrescription() {
  prescriptionBox.textContent = "";
  const request = calibrationRequest();

  if (request.types.length === 0) {
    calNote("Tick at least one stitch to calibrate.");
    return;
  }
  if (request.types.every(function (t) { return t.dependent; })) {
    calNote("At least one stitch has to be workable on its own — a carried " +
            "stitch needs something to carry it.");
    return;
  }
  if (!(request.budget >= 1) || !(request.sigma > 0)) {
    calNote("The stitch budget and the measuring precision both need a number " +
            "greater than zero.");
    return;
  }

  const plan = prescribeSwatches(request);

  // Not solvable and merely imprecise are different failures. This one means
  // the swatches cannot produce the numbers at all, whatever they measure.
  if (plan.swatches.length === 0 || !plan.solvable) {
    calNote("No set of swatches within " + request.budget + " stitches can " +
            "separate these figures. Raise the budget, or calibrate fewer " +
            "stitches at once.");
    return;
  }

  prescriptionBox.appendChild(swatchListOf(plan.swatches));

  if (plan.swatches.some(function (s) { return s.finished === false; })) {
    calNote("Some of these are left on the needle. That is not an oversight: " +
      "an unfinished swatch has a cast-on and no bind-off, and that is the " +
      "only thing in the whole set that tells those two apart.");
  }

  calNote(plan.cost + " stitches in all. Leave a tail at each end you can hold " +
          "on to, and keep your usual tension — a swatch knitted more carefully " +
          "than the real thing calibrates a fabric you are not going to make.");

  // What this will actually buy, against what was asked for. Worth showing
  // before anything is knitted, because that is exactly when it can still be
  // changed.
  const unit = document.getElementById("typeUnit").value;
  const table = document.createElement("div");
  table.className = "precisionTable";

  for (const name of plan.unknowns) {
    const short = plan.expected[name] > plan.targets[name];

    const label = document.createElement("span");
    label.textContent = name;
    const got = document.createElement("span");
    got.textContent = "±" + calAmount(plan.expected[name], unit);
    const want = document.createElement("span");
    want.textContent = "wanted ±" + calAmount(plan.targets[name], unit);

    if (short) {
      got.className = "short";
      want.className = "short";
    }

    table.appendChild(label);
    table.appendChild(got);
    table.appendChild(want);
  }
  prescriptionBox.appendChild(table);

  for (const name of plan.unknowns) {
    if (CALIBRATION_NOTES[name]) {
      calNote(name.charAt(0).toUpperCase() + name.slice(1) + " is " +
              CALIBRATION_NOTES[name] + ".");
    }
  }

  if (!plan.meetsTargets) {
    calNote("Not everything reaches 1% of its current figure, and " +
            plan.limiting + " is what holds the set back. Raise the stitch " +
            "budget, measure more precisely, or accept a looser figure for it — " +
            "the others are unaffected either way.");
  }

  calNote("Knit these, then write down what each one measured underneath.");
  adoptPlan(plan);
}

// Grouped: this is a list of things to make, and three identical entries read
// as a mistake. The measurement list below ungroups them again, because there
// each line is a different physical swatch with its own number to write down.
function swatchListOf(swatches) {
  const list = document.createElement("ol");
  list.className = "swatchList";

  for (const entry of groupSwatches(swatches)) {
    const item = document.createElement("li");
    if (entry.count > 1) {
      const count = document.createElement("span");
      count.className = "swatchCount";
      count.textContent = entry.count + " of these — ";
      item.appendChild(count);
    }
    item.appendChild(document.createTextNode(describeSwatch(entry.swatch)));
    list.appendChild(item);
  }
  return list;
}

// --- The prescription, once it has been issued ------------------------------
//
// Measurements are written against a particular list of swatches, so that list
// has to stop moving the moment anyone starts knitting from it. This is the
// frozen copy: what the panel below is measuring, and what phase four will
// eventually solve.

let frozen = { swatches: [], unknowns: [] };

function frozenSwatches() { return frozen.swatches; }
function frozenUnknowns() { return frozen.unknowns; }

function setFrozen(swatches, unknowns, values) {
  frozen = { swatches: swatches, unknowns: unknowns };
  setMeasureRows(swatches, values);
  document.body.classList.toggle("prescribed", swatches.length > 0);
  updateCalUnitTags();
  updateMeasurementReadout();
}

function adoptPlan(plan) {
  // Running the search again nearly always produces the very same list — you
  // reopened the panel, or nudged a box and put it back. Keeping the
  // measurements when the swatches have not actually changed is the difference
  // between a stray click costing nothing and costing a week of knitting.
  const keep = sameSwatches(frozen.swatches, plan.swatches);
  setFrozen(plan.swatches, plan.unknowns, keep ? readMeasurements() : []);
}

function restorePrescription(swatches, unknowns, measured) {
  setFrozen(swatches, unknowns, measured);
  if (swatches.length === 0) return;
  prescriptionShowing = true;
  prescriptionBox.appendChild(swatchListOf(swatches));
  calNote("Prescribed earlier. Press Suggest swatches to work them out again.");
}

// A prescription is only true of the answers it was built from. While nothing
// has been measured it simply follows them, so it can never sit there going
// quietly out of date. Once there are measurements it stops: they describe
// these swatches, and silently swapping the swatches under them would make
// them wrong without anyone touching them.
let prescriptionShowing = false;

function anyMeasured() {
  return readMeasurements().some(function (v) { return v.trim() !== ""; });
}

function refreshPrescription() {
  if (!prescriptionShowing) return;

  if (anyMeasured()) {
    prescriptionBox.textContent = "";
    prescriptionBox.appendChild(swatchListOf(frozen.swatches));
    calNote("These were worked out from different answers. Press Suggest " +
            "swatches to redo them — measurements for any swatch that changes " +
            "will be cleared.");
    return;
  }

  showPrescription();
}

document.getElementById("prescribe").addEventListener("click", function () {
  prescriptionShowing = true;
  showPrescription();
});

calibrationSet.addEventListener("change", refreshPrescription);

// --- Writing the measurements down ------------------------------------------

const measurementSet = document.getElementById("measurement");
const calTailStartInput = document.getElementById("calTailStart");
const calTailEndInput = document.getElementById("calTailEnd");
const measureResult = document.getElementById("measureResult");
const weightResult = document.getElementById("weightResult");

function byWeight() {
  return document.querySelector("input[name=calMethod]:checked").value === "weight";
}

// Weighing means the boxes hold grams, not a length, so they cannot carry the
// calibration unit like everything else in the panel.
function updateCalUnitTags() {
  const unit = calUnitInput.value;
  const weighing = byWeight();
  for (const tag of measurementSet.querySelectorAll(".unitTag")) {
    tag.textContent = tag.classList.contains("measureUnit") && weighing ? "g" : unit;
  }
}

// Metres per gram for this yarn, or null if the table cannot say yet.
function yarnConversion() {
  const unit = calUnitInput.value;
  const pairs = readWeightPairs()
    .map(function (p) {
      return { metres: toMetres(Number(p.length), unit), grams: Number(p.grams) };
    })
    // A pair with one box still empty is being typed, not being ignored.
    .filter(function (p) { return p.metres > 0 && p.grams > 0; });
  return pairs.length ? metresPerGram(pairs) : null;
}

function showConversion() {
  if (!byWeight()) {
    weightResult.textContent = "";
    return;
  }
  const perGram = yarnConversion();
  const unit = calUnitInput.value;
  weightResult.textContent = perGram === null
    ? "Fill in at least one pair — a length and what it weighed."
    : "This yarn runs " + fromMetres(perGram, unit).toFixed(2) + " " + unit +
      " to the gram.";
}

// What one swatch actually fed the fabric: what was typed, out of grams if it
// was weighed, with both tails taken off. Null means nothing usable was typed.
function usedMetres(typed) {
  const value = Number(typed);
  if (String(typed).trim() === "" || !Number.isFinite(value) || value <= 0) return null;

  const unit = calUnitInput.value;
  const tails = toMetres(num(calTailStartInput), unit) +
                toMetres(num(calTailEndInput), unit);

  if (byWeight()) {
    const perGram = yarnConversion();
    if (perGram === null) return null;
    return value * perGram - tails;
  }
  return toMetres(value, unit) - tails;
}

function updateMeasurementReadout() {
  const unit = calUnitInput.value;
  const rows = [...measureRows.querySelectorAll(".measureRow")];
  let done = 0;
  let impossible = 0;

  for (const row of rows) {
    const net = row.querySelector(".measureNet");
    const used = usedMetres(row.querySelector(".measureAmount").value);

    if (used === null) {
      net.textContent = "";
      net.classList.remove("bad");
      continue;
    }
    if (used <= 0) {
      // Two tails longer than the whole strand. Either the tail figure is
      // wrong or the measurement is, and both are worth catching now rather
      // than as a negative consumption three steps later.
      net.textContent = "shorter than its own tails";
      net.classList.add("bad");
      impossible++;
      continue;
    }

    net.classList.remove("bad");
    net.textContent = "= " + fromMetres(used, unit).toFixed(1) + " " + unit + " of fabric";
    done++;
  }

  if (rows.length === 0) {
    measureResult.textContent = "";
    return;
  }

  let text = done + " of " + rows.length + " measured.";
  if (impossible > 0) {
    text += " " + impossible + " cannot be right.";
  }
  measureResult.textContent = text;

  showSolution();
}

// --- Solving ----------------------------------------------------------------
//
// Live rather than behind a button: the answer follows the measurements as
// they are typed, the same way the fabric follows the controls. Applying it is
// the deliberate act, and that has a button — the same split as the swatch
// gauge, which predicts continuously and only writes when told.

const solutionBox = document.getElementById("solution");
const applyResult = document.getElementById("applyResult");

// Kept so the apply button works from what is on screen rather than solving a
// second time and risking a different answer.
let solution = null;

// The measurements in the shape the solver wants, skipping anything not filled
// in yet. The index rides along so a residual can be traced back to a line.
function measuredSwatches() {
  const values = readMeasurements();
  const out = [];
  frozen.swatches.forEach(function (swatch, i) {
    const used = usedMetres(values[i]);
    if (used !== null && used > 0) out.push({ swatch: swatch, used: used, index: i });
  });
  return out;
}

function assumedSigma() {
  return toMetres(num(calPrecisionInput), calUnitInput.value);
}

function solutionNote(text, className) {
  const p = document.createElement("p");
  p.className = className || "hint";
  p.textContent = text;
  solutionBox.appendChild(p);
}

function showSolution() {
  solutionBox.textContent = "";
  applyResult.textContent = "";
  document.body.classList.remove("solved");
  solution = null;

  const unknowns = frozen.unknowns;
  if (frozen.swatches.length === 0 || unknowns.length === 0) return;

  const measured = measuredSwatches();
  const short = unknowns.length - measured.length;
  if (short > 0) {
    // Not an error — just not finished. Saying how many more are needed beats
    // silence, because the number is not obvious: it is one per unknown, and
    // two of the unknowns were never asked for.
    solutionNote(short + " more " + (short === 1 ? "swatch" : "swatches") +
      " before there is enough to solve — one for each of the " +
      unknowns.length + " figures being worked out.");
    return;
  }

  const result = solveCalibration(measured, unknowns, { sigma: assumedSigma() });
  if (!result.ok) {
    solutionNote(result.reason);
    return;
  }

  const unit = document.getElementById("typeUnit").value;
  const table = document.createElement("div");
  table.className = "solutionTable";

  for (const name of unknowns) {
    const bad = result.suspect.includes(name);

    const label = document.createElement("span");
    label.textContent = name;
    const value = document.createElement("span");
    value.className = "solutionValue";
    value.textContent = calAmount(result.values[name], unit);
    const spread = document.createElement("span");
    spread.textContent = "± " + calAmount(result.uncertainty[name], unit);

    if (bad) {
      label.className = "short";
      value.className += " short";
      spread.className = "short";
    }

    table.appendChild(label);
    table.appendChild(value);
    table.appendChild(spread);
  }
  solutionBox.appendChild(table);

  // How much the measurements disagree among themselves, which is a check on
  // the precision claimed earlier — and the only independent check there is.
  if (result.measuredNoise) {
    const said = assumedSigma();
    const unit = calUnitInput.value;
    // Zero disagreement is a real answer, not a broken one — it means every
    // measurement sits exactly where the others predict. Printing it as
    // "0.0000 cm" makes a clean result look like a failure.
    const exact = result.scatter <= said / 100;

    let text;
    if (exact) {
      text = "Your swatches agree with each other exactly.";
    } else if (said > 0 && result.scatter > said * 2) {
      text = "Your swatches disagree by about " + calAmount(result.scatter, unit) +
        ", more than twice the " + calAmount(said, unit) + " you said you could " +
        "measure to. Either something was mismeasured or the tension varied " +
        "between them.";
    } else {
      text = "Your swatches disagree by about " + calAmount(result.scatter, unit) +
        ", which is about what measuring to " + calAmount(said, unit) +
        " would produce.";
    }

    if (result.scatter < said) {
      // The error bars come from the claimed precision, not from this — worth
      // saying, or they look needlessly pessimistic next to a tidy result.
      text += " The error bars above still allow for the tape, since a few " +
              "swatches cannot show better than you can measure.";
    }
    solutionNote(text);

    // A spare swatch is only a check if it is a different shape. Repeats of a
    // shape already in the set can tell you whether two identical swatches
    // measured the same and nothing else, which is the weakest check there is
    // — and it passes automatically if the same number was typed twice.
    const shapes = new Set(measured.map(function (m) { return swatchKey(m.swatch); }));
    if (shapes.size <= unknowns.length) {
      solutionNote("The spare swatches are repeats of shapes already in the " +
        "set, so all they can check is whether two identical swatches came out " +
        "the same. A differently shaped one would check more.");
    }

    // With spare swatches the fit can be checked against each one. A single
    // wild residual is far more likely to be one bad swatch than a bad model,
    // and re-measuring it is cheap next to re-knitting everything.
    let worst = null;
    result.residuals.forEach(function (r, i) {
      if (!worst || Math.abs(r) > Math.abs(worst.residual)) {
        worst = { residual: r, line: measured[i].index + 1 };
      }
    });
    if (worst && result.sigma > 0 && Math.abs(worst.residual) > 3 * result.sigma) {
      solutionNote("Swatch " + worst.line + " is " +
        calAmount(worst.residual, calUnitInput.value) +
        " away from what the others predict. Worth measuring again before " +
        "trusting any of this.");
    }
  } else {
    solutionNote("Exactly enough swatches to solve, so there is nothing left " +
      "over to check them with — every measurement is taken at face value.");
  }

  if (result.suspect.length > 0) {
    // Negative consumption is arithmetically fine and physically impossible.
    // It means the fit went looking for cancellation, which is what happens
    // when the swatches genuinely disagree.
    solutionNote("Marked in red: a stitch cannot eat a negative length of " +
      "yarn. The swatches disagree badly enough that the arithmetic has gone " +
      "looking for cancellation, so none of these figures can be used.", "hint bad");
    return;
  }

  solution = result;
  document.body.classList.add("solved");
}

// Where a solved figure gets written back to, and in what unit.
//
// Stitches go to their row in the table. The other two are not stitches and
// are not in it — each lives with the thing it is an allowance for, so this is
// the one place that has to know the difference.
function destinationFor(name) {
  if (name === TURN_FIGURE) {
    return { input: turnInput, unit: turnUnitInput.value };
  }
  if (name === CAST_ON_FIGURE) {
    return { input: castOnMeasuredInput, unit: castOnUnitInput.value };
  }
  if (name === BIND_OFF_FIGURE) {
    return { input: bindOffMeasuredInput, unit: castOnUnitInput.value };
  }

  const unit = document.getElementById("typeUnit").value;
  for (const row of typeRows.querySelectorAll(".typeRow")) {
    if (row.querySelector(".typeName").value === name) {
      return { input: row.querySelector(".typeAmount"), unit: unit };
    }
  }
  return null;
}

document.getElementById("applyCalibration").addEventListener("click", function () {
  if (!solution) return;

  const applied = [];
  const spare = [];
  const opened = [];

  for (const name of frozen.unknowns) {
    const target = destinationFor(name);
    if (!target) {
      spare.push(name);
      continue;
    }
    target.input.value = Number(
      fromMetres(solution.values[name], target.unit).toFixed(3)
    );
    applied.push(name);

    // Writing a figure into a closed section would leave it out of force, so
    // the button would report success and change nothing — which is what it
    // used to do. "Use these figures" has to mean used.
    for (const name of openSectionsAround(target.input)) {
      if (!opened.includes(name)) opened.push(name);
    }
  }

  let text = applied.length === 0
    ? "None of these have anywhere to be written."
    : applied.join(", ") + " written in.";
  if (opened.length > 0) {
    text += " Opened " + opened.join(", ") + " so they take effect.";
  }
  if (spare.length > 0) {
    text += " " + spare.join(", ") + " has no box to go in, so it has been " +
            "left out — it is solved again from the same measurements whenever " +
            "this panel is opened.";
  }
  applyResult.textContent = text;

  // Setting the boxes from code fires no events, so everything the table feeds
  // has to be told by hand — the same hazard as restoring saved settings.
  refreshTypeChoices();
  refreshCalTypes();
  updateAllRowCounts();
  regenerate();
});

function applyCalMethod() {
  document.body.classList.toggle("weighing", byWeight());
  updateCalUnitTags();

  // Grams and centimetres are not the same number, so an entry made one way
  // means nothing the other. Emptying the boxes is the only honest option.
  let cleared = false;
  for (const box of measureRows.querySelectorAll(".measureAmount")) {
    if (box.value !== "") {
      box.value = "";
      cleared = true;
    }
  }

  showConversion();
  updateMeasurementReadout();

  if (cleared) {
    measureResult.textContent =
      "Measurements cleared — grams and " + calUnitInput.value +
      " are not the same number.";
  }
}

// One listener for the whole panel, so a weight pair added later is covered
// the moment it exists.
measurementSet.addEventListener("change", function (e) {
  if (e.target.name === "calMethod") {
    applyCalMethod();
  } else {
    showConversion();
    updateMeasurementReadout();
  }
});

let previousCalUnit = calUnitInput.value;

calUnitInput.addEventListener("change", function () {
  const unit = calUnitInput.value;
  convertBoxes(
    [calPrecisionInput, calTailStartInput, calTailEndInput], previousCalUnit, unit
  );
  convertBoxes(weightRows.querySelectorAll(".weightLength"), previousCalUnit, unit);
  // While weighing, those boxes hold grams, which no change of length unit
  // touches.
  if (!byWeight()) {
    convertBoxes(measureRows.querySelectorAll(".measureAmount"), previousCalUnit, unit);
  }
  previousCalUnit = unit;

  updateCalUnitTags();
  showConversion();
  updateMeasurementReadout();
  // The prescription redisplay comes from the fieldset's own listener, which
  // runs after this one and finds the boxes already converted.
});

// Switching units should describe the same physical length, not silently
// redefine it — so convert what is already typed rather than reinterpreting it.
function convertBoxes(boxes, from, to) {
  for (const box of boxes) {
    // An empty box is empty in every unit. Converting it would write a 0 into
    // a measurement nobody has taken yet.
    if (box.value.trim() === "") continue;
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
});

// Fades are a property of the yarn, so they are offered in both modes — but
// hidden until asked for, to keep the basic panel uncluttered.
const useFadesInput = document.getElementById("useFades");

function applyFades() {
  document.body.classList.toggle("fades", useFadesInput.checked);
  // Track widths are zero while the controls are hidden, so the labels can
  // only be placed once the class has made them visible.
  refreshFadeVisuals();
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
  regenerate();
});

let previousPerStitchUnit = perStitchUnitInput.value;

perStitchUnitInput.addEventListener("change", function () {
  const unit = perStitchUnitInput.value;
  convertBoxes([perStitchInput], previousPerStitchUnit, unit);
  previousPerStitchUnit = unit;
});

// Gauge boxes: converting them keeps the fabric the same size on screen, so
// switching to inches is purely a change of notation.
let previousGaugeUnit = gaugeUnitInput.value;

gaugeUnitInput.addEventListener("change", function () {
  const unit = gaugeUnitInput.value;
  convertBoxes([stitchWidthInput, rowHeightInput], previousGaugeUnit, unit);
  previousGaugeUnit = unit;
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

document.getElementById("addColor").addEventListener("click", regenerate);

// Stitch types. Renaming one changes what the "stitch used" dropdown offers,
// so the list is rebuilt on any change inside the table.
const typeUnitInput = document.getElementById("typeUnit");
let previousTypeUnit = typeUnitInput.value;

typeUnitInput.addEventListener("change", function () {
  const unit = typeUnitInput.value;
  convertBoxes(typeRows.querySelectorAll(".typeAmount"), previousTypeUnit, unit);
  previousTypeUnit = unit;
  // Converting leaves every consumption the same physical length, so the plan
  // does not change — but it is reported in this unit, so it has to be redrawn.
  refreshPrescription();
});

typeRows.addEventListener("change", function () {
  refreshTypeChoices();
  // A rename changes what the calibration list is offering to measure, and a
  // changed figure moves the targets, which are a percentage of it.
  refreshCalTypes();
  refreshPrescription();
  // A code may have changed, which changes what every existing token means.
  updateAllRowCounts();
});

document.getElementById("addType").addEventListener("click", function () {
  refreshPrescription();
  regenerate();
});

// --- The one way in ---------------------------------------------------------
//
// Everything above this line only prepares: converts a unit, rebuilds a
// dependent list, toggles a body class. None of them redraw. The event then
// bubbles to here, and this regenerates once — so a control added tomorrow is
// covered without anyone remembering to wire it up.
//
// Buttons are the exception, because a click is not a change; each one asks
// for itself, and they are few.
//
// Listening on the page rather than the panel: the stitch and row boxes sit
// beside the fabric, not among the controls, and delegating to the panel
// quietly missed them. One container that holds everything is the only version
// of this that cannot have a hole in it.
pageBox.addEventListener("change", function () {
  regenerate();
  saveSoon();
});

// Typed boxes wait for Enter or blur — redrawing a 1-stitch fabric while
// someone types "140" is no use to anyone. A slider is different: every
// position it passes through is a value that was meant, so it updates live.
pageBox.addEventListener("input", function (e) {
  if (e.target.type !== "range") return;
  regenerate();
  saveSoon();
});

// Opening a section puts its contents in force, so it is a change like any
// other. Captured rather than bubbled: a details element's toggle event does
// not bubble, and capture is what reaches it without a listener per section.
pageBox.addEventListener("toggle", function () {
  regenerate();
  saveSoon();
}, true);

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
  previousCalUnit = calUnitInput.value;
  previousCastOnUnit = castOnUnitInput.value;
  previousTurnUnit = turnUnitInput.value;
}

applySettings(loadSettings());
syncUnitBaselines();
// Restoring a checkbox does not fire a change event, so the body classes have
// to be set explicitly — the same hazard as the unit baselines above.
document.body.classList.toggle("fades", useFadesInput.checked);
document.body.classList.toggle("weighing", byWeight());
updateCalUnitTags();
showConversion();
updateMeasurementReadout();
refreshFadeVisuals();

regenerate();

console.log("app.js loaded");
