// UI glue — not one of the four layers.
// Reads the form, runs the pipeline, hands the result to the renderer.
// The layers below know nothing about the page; this file is the only
// place that touches both.

// On-screen zoom: how many pixels one millimetre of fabric occupies.
const PX_PER_MM = 1.2;

const stitchesInput   = document.getElementById("stitches");
const rowsInput       = document.getElementById("rows");
const perStitchInput  = document.getElementById("perStitch");
const perStitchUnitInput = document.getElementById("perStitchUnit");
const stitchWidthInput = document.getElementById("stitchWidth");
const rowHeightInput   = document.getElementById("rowHeight");
const gaugeUnitInput   = document.getElementById("gaugeUnit");
const swatchUnitInput  = document.getElementById("swatchUnit");
const readout         = document.getElementById("readout");
const canvasWrap      = document.getElementById("canvasWrap");
const canvasArea      = document.querySelector(".canvasArea");
const constructionSet = document.getElementById("construction");
const stitchesLabel   = document.getElementById("stitchesLabel");

function isCircular() {
  return document.querySelector("input[name=construction]:checked").value === "circular";
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
  const w = gauge.stitchWidth * PX_PER_MM;
  const h = gauge.rowHeight * PX_PER_MM;
  // An emptied gauge box gives 0, and dividing pixels by a 0-wide cell
  // yields Infinity stitches — which would hang the grid loop.
  return { w: w > 0 ? w : 1, h: h > 0 ? h : 1 };
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

  // readSequence already returns metres, so consumption must be metres too.
  const perStitch = toMetres(num(perStitchInput), perStitchUnitInput.value);

  const grid = buildGrid(readSequence(), stitches, rows, perStitch, circular);
  drawGrid(grid, canvas.width / stitches, canvas.height / rows, seams);

  // Knitted in the round the fabric is a tube, so its width measurement is
  // the way round it, not the way across it.
  const gauge = gaugeMm();
  const size = fabricSize(stitches, rows, gauge.stitchWidth, gauge.rowHeight);
  readout.textContent =
    size.widthCm.toFixed(1) + (circular ? " cm circumference, " : " cm wide, ") +
    size.heightCm.toFixed(1) + " cm tall";
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
      const growX = axis !== "y";
      const growY = axis !== "x";
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
const lengthHeading = document.getElementById("lengthHeading");
let previousLengthUnit = lengthUnitInput.value;

lengthUnitInput.addEventListener("change", function () {
  const unit = lengthUnitInput.value;
  convertBoxes(document.querySelectorAll(".colorRow .length"), previousLengthUnit, unit);
  previousLengthUnit = unit;
  lengthHeading.textContent = "Length (" + unit + ")";
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

sizeWrapperFromCounts();
resizeCanvasToWrapper();
draw();

console.log("app.js loaded");
