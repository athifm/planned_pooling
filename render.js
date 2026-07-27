// Layer 4 — the renderer.
// One question: given a finished grid of colors, how do we draw it?
// Knows nothing about yarn, stitches or consumption.

// Boilerplate: find the canvas in the page and get its drawing context.
// ctx is the object you paint with.
const canvas = document.getElementById("fabric");
const ctx = canvas.getContext("2d");

function drawGrid(grid, cellWidth, cellHeight){
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

  
}

console.log("render.js loaded");
