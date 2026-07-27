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

// The user dragged the canvas to this pixel size — how many stitches and rows
// fit in it, given the on-screen size of one cell? Never returns less than 1:
// a fabric with no stitches would divide by zero further down.
function countsFromPixels(pixelWidth, pixelHeight, cellW, cellH) {
  return {
    stitches: Math.max(1, Math.round(pixelWidth / cellW)),
    rows: Math.max(1, Math.round(pixelHeight / cellH)),
  };
}
