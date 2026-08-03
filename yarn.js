// Layer 1 — the yarn model.
// One question, nothing else: what color is the strand at position x metres?

console.log("yarn.js loaded");

// --- colour blending --------------------------------------------------------
// Isolated on purpose: swapping this one function is the whole job if straight
// RGB turns out to look wrong and a perceptual space is wanted instead.

function parseHex(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(color).trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// t runs 0 (all "from") to 1 (all "to").
//
// Straight RGB interpolation, chosen deliberately rather than by default: dye
// bleeding on fibre really does go muddy through the middle, so the greyish
// purple between red and blue is closer to a real skein than an evenly bright
// perceptual blend would be.
function blendColors(from, to, t) {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return to;
  function mix(x, y) { return Math.round(x + (y - x) * t); }
  return "rgb(" + mix(a[0], b[0]) + "," + mix(a[1], b[1]) + "," + mix(a[2], b[2]) + ")";
}

function repeatLength(sequence) {
  let total = 0;
  for (const band of sequence) total += band.length;
  return total;
}

// Turn a position in the repeat into something findable on real yarn.
//
// A band runs from where its colour is pure, so a band start is the one point
// on a skein you can identify without a tape — "where pure green begins".
//
// Both neighbouring landmarks are reported, because a new ball can begin
// anywhere in the sequence and there is no telling which of them is actually
// present in the yarn you are holding. Measuring back from the colour ahead is
// the easier of the two — you watch it coming and stop short, rather than
// spotting a landmark, marking it, and measuring on past it — but only if that
// colour is in front of you.
function landmarkFor(sequence, phase) {
  const total = repeatLength(sequence);
  if (!(total > 0) || sequence.length === 0) return null;

  const pos = ((phase % total) + total) % total;

  let start = 0;
  for (let i = 0; i < sequence.length; i++) {
    const band = sequence[i];
    const end = start + band.length;

    if (pos < end || i === sequence.length - 1) {
      return {
        // The colour this point is inside, and how far past its start.
        after: { color: band.color, offset: pos - start },
        // The colour coming up, and how far short of it this point falls.
        before: { color: sequence[(i + 1) % sequence.length].color, offset: end - pos },
      };
    }
    start = end;
  }
  return null;
}

function colorAt(sequence, x) {
  const rep_len = repeatLength(sequence);
  const pos = x % rep_len;
  let total = 0;

  for (let i = 0; i < sequence.length; i++) {
    const band = sequence[i];
    total += band.length;

    if (total > pos) {
      // A band runs from where its colour is pure to where the next colour is
      // pure, and its fade sits at the END: the last `fade` of it grades into
      // the next colour. So a band's boundaries are the two points where the
      // yarn is unmistakably one colour — the easiest marks to find on a real
      // skein — and the fade is the stretch between them.
      //
      // The fade is taken out of the band, not added to it, so switching
      // gradients on softens the boundaries without changing the repeat
      // length and reorganising the whole pattern.
      const fade = band.fade || 0;
      const into = pos - (total - band.length);
      const fadeBegins = band.length - fade;

      if (fade > 0 && into >= fadeBegins) {
        const next = sequence[(i + 1) % sequence.length];
        return blendColors(band.color, next.color, (into - fadeBegins) / fade);
      }
      return band.color;
    }
  }
}

  
