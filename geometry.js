// Geometry — converts between stitch counts, real-world size and screen pixels.
// Pure arithmetic: touches no DOM and no canvas.

// How big is a fabric of this many stitches and rows, given the gauge?
// stitchWidth and rowHeight are in millimetres; the answer is in centimetres.
function fabricSize(stitches, rows, stitchWidth, rowHeight) {
  return {
    widthCm: (stitches * stitchWidth) / 10,
    heightCm: (rows * rowHeight) / 10,
  };
}

// Yarn lengths can be entered in whatever unit the knitter's ball band or tape
// measure uses. Everything downstream works in metres, so conversion happens
// once, at the point the form is read.
const METRES_PER_UNIT = {
  m:  1,
  cm: 0.01,
  mm: 0.001,
  ft: 0.3048,
  yd: 0.9144,
  in: 0.0254,
};

function toMetres(value, unit) {
  return value * METRES_PER_UNIT[unit];
}

function fromMetres(metres, unit) {
  return metres / METRES_PER_UNIT[unit];
}

// Gauge from a knitted sample: count the stitches and rows in it, measure how
// big it came out, and divide. Works in metres both in and out, so it does not
// care which unit the knitter measured with — the caller converts.
function gaugeFromSwatch(stitches, rows, widthM, heightM) {
  return {
    stitchWidth: widthM / stitches,
    rowHeight: heightM / rows,
  };
}

// The user dragged the canvas to this pixel size — how many stitches and rows
// fit in it, given the on-screen size of one cell? Never returns less than 1:
// a fabric with no stitches would divide by zero further down.
function countsFromPixels(pixelWidth, pixelHeight, cellW, cellH) {
  return {
    stitches: Math.max(1, Math.round(pixelWidth / cellW)),
    rows: Math.max(1, Math.round(pixelHeight / cellH)),
  };
}
