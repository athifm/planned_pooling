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
function drawGrid(grid, cellWidth, cellHeight, seamColumns){
ctx.clearRect(0, 0, canvas.width, canvas.height);
for (let r = 0; r < grid.length; r++) {
  // Round each cell's edges to whole pixels so neighbours abut exactly.
  // Fractional edges get anti-aliased into semi-transparent seams.
  const y0 = Math.round(r * cellHeight);
  const y1 = Math.round((r + 1) * cellHeight);

  for (let c = 0; c < grid[r].length; c++) {
    const x0 = Math.round(c * cellWidth);
    const x1 = Math.round((c + 1) * cellWidth);

    ctx.fillStyle = grid[r][c];      // the color at this cell;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
}

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

  // Label runs parallel to the line and sits at the fabric's mid height.
  // It goes on whichever side of the line faces into the fabric.
  const fontPx = 26 * scale;
  const gap = 7 * scale;
  const towardsCentre = x < canvas.width / 2 ? 1 : -1;

  ctx.translate(x + towardsCentre * (gap + fontPx / 2), canvas.height / 2);
  ctx.rotate(-Math.PI / 2);

  ctx.font = "600 " + fontPx + "px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // No plate behind it, so outline the glyphs instead — otherwise the label
  // disappears wherever the fabric happens to be dark.
  ctx.lineWidth = 1.5 * scale;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#fff";
  ctx.strokeText("Seam", 0, 0);
  ctx.fillStyle = "#111";
  ctx.fillText("Seam", 0, 0);

  ctx.restore();
}

console.log("render.js loaded");
