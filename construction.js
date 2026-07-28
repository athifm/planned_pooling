// Layer 3 — the construction model.
// One question: where on the fabric does stitch k land?
// Flat serpentine: every odd row runs right-to-left.
// Circular: no turning, so the strand spirals — see cellOf.

function cellOf(k, stitchesPerRow, circular){

let row = Math.floor( k / stitchesPerRow);
let col;
// Knitting in the round never turns the work, so there is no flip: the
// column is just the position within the round. This is really a helix,
// and floor(k / n) already lands each new round one row up — so the
// one-round drift at the seam comes out of the arithmetic for free.
if (circular) {
  col = k % stitchesPerRow;}
else if (row % 2 === 1) {
  col = stitchesPerRow-1-(k % stitchesPerRow);}
else{
  col = k % stitchesPerRow;}

return { row: row, col: col }
}

// consumptionAt(k) comes from layer 2 and answers in metres. Passing a
// function rather than a number is what lets stitches differ from each other.
function buildGrid(sequence, stitchesPerRow, rows, consumptionAt, circular){

const grid = [];
for (let r = 0; r < rows; r++) {
  grid.push([]);
}

// Adding 0.05 to itself thousands of times drifts, because 0.05 has no exact
// binary representation — the error accumulates until stitches near a colour
// boundary fall on the wrong side of it. Converting to whole micrometres once
// makes the running total integer arithmetic, which is exact. colorAt does not
// care what the unit is, so long as positions and band lengths share one.
const UM = 1000000;
const sequenceUm = sequence.map(function (band) {
  return { color: band.color, length: Math.round(band.length * UM) };
});

let used = 0
for (let k = 0; k < stitchesPerRow * rows; k++) {
  let pos = cellOf(k, stitchesPerRow, circular)
  grid[pos.row][pos.col] = colorAt(sequenceUm,used);
  // Round each stitch to whole micrometres before adding it on, so the total
  // stays exact even when consecutive stitches consume different amounts.
  used += Math.round(consumptionAt(k) * UM);
}
  return grid
}


console.log("construction.js loaded");

