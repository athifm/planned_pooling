// UI glue — not one of the four layers.
// Reads the form, runs the pipeline, hands the result to the renderer.
// The layers below know nothing about the page; this file is the only
// place that touches both.

function draw(){
const stitches = Number(document.getElementById("stitches").value);     
const perStitch = Number(document.getElementById("perStitch").value);
const rows = Number(document.getElementById("rows").value);
const grid = buildGrid(sequence, stitches, rows, perStitch);
const cellWidth = canvas.width / stitches;     // cell width
const cellHeight = canvas.height / rows;         // cell height
drawGrid(grid, cellWidth, cellHeight)};

document.getElementById("drawButton").addEventListener("click", draw);

console.log("app.js loaded");
