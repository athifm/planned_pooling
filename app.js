// UI glue — not one of the four layers.
// Reads the form, runs the pipeline, hands the result to the renderer.
// The layers below know nothing about the page; this file is the only
// place that touches both.

// On-screen zoom: how many pixels one millimetre of fabric occupies.
const PX_PER_MM = 1.2;

const stitchesInput   = document.getElementById("stitches");
const rowsInput       = document.getElementById("rows");
const perStitchInput  = document.getElementById("perStitch");
const stitchWidthInput = document.getElementById("stitchWidth");
const rowHeightInput   = document.getElementById("rowHeight");
const readout         = document.getElementById("readout");
const canvasWrap      = document.getElementById("canvasWrap");

function num(input) {
  return Number(input.value);
}

// On-screen size of one cell in CSS pixels, straight from the gauge.
// Because both dimensions come from the same gauge, cells keep the
// fabric's true proportions instead of stretching to fill the canvas.
function cellSize() {
  const w = num(stitchWidthInput) * PX_PER_MM;
  const h = num(rowHeightInput) * PX_PER_MM;
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

  const grid = buildGrid(readSequence(), stitches, rows, num(perStitchInput));
  drawGrid(grid, canvas.width / stitches, canvas.height / rows);

  const size = fabricSize(stitches, rows, num(stitchWidthInput), num(rowHeightInput));
  readout.textContent =
    size.widthCm.toFixed(1) + " cm wide, " + size.heightCm.toFixed(1) + " cm tall";
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

    function onMove(ev) {
      if (axis !== "y") {
        canvasWrap.style.width =
          Math.max(MIN_BOX_PX, startW + ev.clientX - startX) + "px";
      }
      if (axis !== "x") {
        canvasWrap.style.height =
          Math.max(MIN_BOX_PX, startH + ev.clientY - startY) + "px";
      }
      // The size change alone is enough — the observer below redraws.
    }

    function onUp() {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
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

// change bubbles, so one listener on the container covers every color row,
// including rows added later.
colorRows.addEventListener("change", draw);
document.getElementById("addColor").addEventListener("click", draw);

sizeWrapperFromCounts();
resizeCanvasToWrapper();
draw();

console.log("app.js loaded");
