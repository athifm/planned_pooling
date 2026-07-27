// Layer 3 — the construction model.
// One question: where on the fabric does stitch k land?
// Flat serpentine: every odd row runs right-to-left.

function cellOf(k, stitchesPerRow){

let row = Math.floor( k / stitchesPerRow);
let col;
if (row % 2 === 1) {
  col = stitchesPerRow-1-(k % stitchesPerRow);}
else{
  col = k % stitchesPerRow;}

return { row: row, col: col }
}

function buildGrid(sequence, stitchesPerRow, rows, perStitch){

const grid = [];
for (let r = 0; r < rows; r++) {
  grid.push([]);    
}
let used = 0
for (let k = 0; k < stitchesPerRow * rows; k++) {
  let pos = cellOf(k, stitchesPerRow)
  grid[pos.row][pos.col] = colorAt(sequence,used); 
  used +=perStitch;
}
  return grid
}


console.log("construction.js loaded");

