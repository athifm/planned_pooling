// Layer 1 — the yarn model.
// One question, nothing else: what color is the strand at position x metres?

console.log("yarn.js loaded");

function colorAt(sequence,x) {
  let rep_len = 0;
  
  for (const band of sequence) {
  rep_len += band.length;
}
   let pos = x % rep_len;
   let total = 0;
    for (const band of sequence) {
  total += band.length;
  if (total > pos) {
  return band.color;
}

}
}

  
