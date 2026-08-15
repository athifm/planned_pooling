// Layer 4 — the renderer.
// One question: given a finished grid of colors, how do we draw it?
// Knows nothing about yarn, stitches or consumption.

// Boilerplate: find the canvas in the page and get its drawing context.
// ctx is the object you paint with.
const canvas = document.getElementById("fabric");
const ctx = canvas.getContext("2d");

// seamColumns is an array of column boundaries to mark with a vertical line,
// or null for none. The renderer does not know what a seam is — it just draws
// lines where it is told, which keeps the knitting knowledge in layer 3.
// joinBoundary is { row, fromCol, toCol } or null: the line runs along the
// bottom of that row across those columns, steps, and continues along the top
// for the rest. Told which columns, the renderer needs to know nothing about
// serpentine or balls of yarn.
//
// castOnRow is an array of colors, one per stitch, or null — the cast-on is
// worked before row 0, so it is drawn above it, a row like any other. The
// renderer does not know it is a cast-on; it just draws one more row first.
function drawGrid(grid, cellWidth, cellHeight, seamColumns, joinBoundary, castOnRow){
ctx.clearRect(0, 0, canvas.width, canvas.height);
const bandPx = castOnRow ? Math.round(cellHeight) : 0;

if (castOnRow) {
  for (let c = 0; c < castOnRow.length; c++) {
    const x0 = Math.round(c * cellWidth);
    const x1 = Math.round((c + 1) * cellWidth);
    ctx.fillStyle = castOnRow[c];
    ctx.fillRect(x0, 0, x1 - x0, bandPx);
  }
}

for (let r = 0; r < grid.length; r++) {
  // Round each cell's edges to whole pixels so neighbours abut exactly.
  // Fractional edges get anti-aliased into semi-transparent seams.
  const y0 = Math.round(bandPx + r * cellHeight);
  const y1 = Math.round(bandPx + (r + 1) * cellHeight);

  for (let c = 0; c < grid[r].length; c++) {
    const x0 = Math.round(c * cellWidth);
    const x1 = Math.round((c + 1) * cellWidth);

    ctx.fillStyle = grid[r][c];      // the color at this cell;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
}

if (joinBoundary) drawJoinBoundary(joinBoundary, cellWidth, cellHeight, bandPx);

if (seamColumns) {
  // The canvas bitmap is bigger than its CSS size on high-density screens,
  // so scale the marker by that ratio — otherwise it shrinks on a retina
  // display and the label comes out unreadably small.
  const scale = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
  const half = 3 * scale;

  for (const col of seamColumns) {
    // A line exactly on an edge would be half outside the canvas.
    const x = Math.min(Math.max(Math.round(col * cellWidth), half), canvas.width - half);
    drawSeamMarker(x, scale);
  }
}
}

// Where one ball of yarn ended. The line steps mid-row because that is where
// the ball actually ran out — a straight rule across the fabric would claim a
// whole row came off one ball when half of it did not.
function drawJoinBoundary(boundary, cellWidth, cellHeight, bandPx) {
  const scale = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;

  const low = Math.round(bandPx + (boundary.row + 1) * cellHeight);
  const high = Math.round(bandPx + boundary.row * cellHeight);
  const stepStart = Math.round(boundary.fromCol * cellWidth);
  const stepEnd = Math.round((boundary.toCol + 1) * cellWidth);

  ctx.save();
  ctx.beginPath();

  // Below the join row for the stitches that came off this ball, above it for
  // the rest. Which side the step falls on depends on the row's direction, and
  // that is already baked into fromCol and toCol.
  if (stepStart > 0) {
    ctx.moveTo(0, high);
    ctx.lineTo(stepStart, high);
    ctx.lineTo(stepStart, low);
  } else {
    ctx.moveTo(0, low);
  }

  ctx.lineTo(stepEnd, low);

  if (stepEnd < canvas.width) {
    ctx.lineTo(stepEnd, high);
    ctx.lineTo(canvas.width, high);
  }

  ctx.lineWidth = 5 * scale;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.lineWidth = 3 * scale;
  ctx.strokeStyle = "#111";
  ctx.stroke();
  ctx.restore();
}

function drawSeamMarker(x, scale) {
  ctx.save();

  // Solid white underneath, black dashes over it, so the marker reads
  // whatever colors the fabric happens to be.
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, canvas.height);
  ctx.lineWidth = 6 * scale;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.lineWidth = 4 * scale;
  ctx.strokeStyle = "#111";
  ctx.setLineDash([9 * scale, 7 * scale]);
  ctx.stroke();
  ctx.setLineDash([]);

  // The "Seam" captions are HTML elements sitting outside the canvas —
  // see .seamLabel in style.css. Text beside a drawing is not the
  // renderer's job, and out there it stays crisp and selectable.
  ctx.restore();
}

console.log("render.js loaded");
