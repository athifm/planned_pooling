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
  for (let c = 0; c < grid[r].length; c++) {
    ctx.fillStyle = grid[r][c];      // the color at this cell; 
    ctx.fillRect(c * cellWidth, r * cellHeight, cellWidth, cellHeight);
  }
}

  
}

console.log("render.js loaded");
