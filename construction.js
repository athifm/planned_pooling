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

// Which stitch lands on a given cell — the inverse of cellOf. Keeping it here
// means nothing above layer 3 has to know the serpentine exists.
function stitchAt(row, col, stitchesPerRow, circular) {
  const within = (circular || row % 2 === 0) ? col : stitchesPerRow - 1 - col;
  return row * stitchesPerRow + within;
}

// Yarn used through stitch k inclusive, turns included. The same walk buildGrid
// does, so the two cannot disagree about what a fabric costs.
//
// The stitches only. Whatever went on the needles before the first one is the
// caller's to add, because the two answers it feeds want different things: a
// yarn total wants casting on and binding off both, while a position in the
// ball wants only what came before this point.
function consumedThrough(k, stitchesPerRow, consumptionAt, extraPerRow) {
  const UM = 1000000;
  const extraUm = Math.round((extraPerRow || 0) * UM);
  let used = 0;

  for (let i = 0; i <= k; i++) {
    used += Math.round(consumptionAt(i) * UM);
    if (extraUm && (i + 1) % stitchesPerRow === 0) used += extraUm;
  }
  return used / UM;
}

// consumptionAt(k) comes from layer 2 and answers in metres. Passing a
// function rather than a number is what lets stitches differ from each other.
//
// extraPerRow is yarn spent at each row end without producing a stitch —
// turning the work in flat knitting. It is charged between rows rather than at
// a stitch, because a turn occupies no place in the fabric: it moves the yarn
// on without adding a column.
//
// startMetres is yarn already gone before the first stitch — where in its
// colour cycle the ball was when the knitter picked it up, plus the cast-on
// that has come off it since. It comes off the ball like everything else, so
// the whole pattern begins that far in. Passed as a starting position rather
// than folded into the first stitch, because it belongs to no stitch and
// must not colour one.
//
// Adding 0.05 to itself thousands of times drifts, because 0.05 has no exact
// binary representation — the error accumulates until stitches near a colour
// boundary fall on the wrong side of it. Converting to whole micrometres once
// makes the running total integer arithmetic, which is exact. colorAt does not
// care what the unit is, so long as positions and band lengths share one.
const UM = 1000000;
function sequenceToUm(sequence) {
  return sequence.map(function (band) {
    return {
      color: band.color,
      length: Math.round(band.length * UM),
      fade: Math.round((band.fade || 0) * UM),
    };
  });
}

function buildGrid(sequence, stitchesPerRow, rows, consumptionAt, circular, extraPerRow, startMetres){

const grid = [];
for (let r = 0; r < rows; r++) {
  grid.push([]);
}

const sequenceUm = sequenceToUm(sequence);
const extraUm = Math.round((extraPerRow || 0) * UM);

let used = Math.round((startMetres || 0) * UM)
for (let k = 0; k < stitchesPerRow * rows; k++) {
  let pos = cellOf(k, stitchesPerRow, circular)
  // Round each stitch to whole micrometres before adding it on, so the total
  // stays exact even when consecutive stitches consume different amounts.
  const stitchUm = Math.round(consumptionAt(k) * UM);
  // Sample the middle of the stitch, not its start. A stitch spans a few
  // centimetres of yarn, so its colour should be the one at its centre —
  // which matters once a fade can run across several stitches.
  grid[pos.row][pos.col] = colorAt(sequenceUm, used + Math.floor(stitchUm / 2));
  used += stitchUm;
  // The row's last stitch has just been worked, so this is where the turn goes.
  if (extraUm && (k + 1) % stitchesPerRow === 0) used += extraUm;
}
  return grid
}

// The cast-on: seen and worked before row 0, so it is technically the fabric's
// first row, not just a length subtracted from where the pattern starts.
// Always left to right and never turns — a cast-on is one pass, not a knitted
// row — so there is no serpentine here the way there is in buildGrid.
function buildCastOnRow(sequence, stitches, castOnStitchMetres, startMetres) {
  const sequenceUm = sequenceToUm(sequence);
  const stitchUm = Math.round((castOnStitchMetres || 0) * UM);
  let used = Math.round((startMetres || 0) * UM);
  const row = [];
  for (let c = 0; c < stitches; c++) {
    row.push(colorAt(sequenceUm, used + Math.floor(stitchUm / 2)));
    used += stitchUm;
  }
  return row
}


console.log("construction.js loaded");

