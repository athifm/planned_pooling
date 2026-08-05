// Layer 2 — the consumption model.
// One question: how much yarn does stitch k consume? Answers in metres.
//
// Until now this layer was a single number passed straight through. Making it
// a function is the whole change: layer 3 stops assuming every stitch is the
// same, and this file becomes the only place that decides otherwise.
//
// Today a fabric uses one stitch type throughout, so the answer ignores k.
// Step 4 makes a row a template of different types — and only this file and
// the form change, because layer 3 already asks per stitch.

function uniformConsumption(metresPerStitch) {
  return function (k) {
    return metresPerStitch;
  };
}

// Casting on costs yarn per stitch too, and how much depends entirely on the
// method: a backward loop is a twist over the needle, a tubular cast-on works
// two setup rows before the fabric starts.
//
// Centimetres, and rough — these are starting points for a worsted-weight yarn
// at about 4.5mm, the same kind of placeholder the stitch types ship with. The
// box they fill is editable, and the calibration solver measures the real
// figure. Ordered as they appear in the dropdown, commonest first.
const CAST_ON_METHODS = [
  { id: "longTail", name: "Long-tail", perStitch: 2.5 },
  { id: "cable", name: "Cable", perStitch: 3 },
  { id: "knitted", name: "Knitted-on", perStitch: 3 },
  { id: "backwardLoop", name: "Backward loop", perStitch: 1.2 },
  { id: "tubular", name: "Tubular", perStitch: 4 },
  // Picked automatically when the figure is edited by hand, so a typed number
  // is never silently attributed to a method that does not produce it.
  { id: "other", name: "Measured myself", perStitch: null },
];

function castOnMethod(id) {
  return CAST_ON_METHODS.find(function (m) { return m.id === id; }) || CAST_ON_METHODS[0];
}

// One cell can carry more than one thing: a group can open before a stitch and
// close after it, so "*3k" and "3p*23" are each a single cell. Splitting them
// back into atoms means the parser below only ever deals with one idea at a
// time, and the cell strip stays compact.
//
//   "*"       -> ["*"]
//   "s"       -> ["s"]
//   "*3k"     -> ["*", "3k"]
//   "3p*23"   -> ["3p", "*", "23"]
function splitCell(cell) {
  const text = String(cell).trim();
  if (text === "") return [];

  const parts = /^(\*?)(\d*[A-Za-z]+)?(\*)?(\d*)$/.exec(text);
  if (!parts) return [text];   // unreadable: hand it on so the parser says so

  const atoms = [];
  if (parts[1]) atoms.push("*");
  if (parts[2]) atoms.push(parts[2]);
  if (parts[3]) atoms.push("*");
  if (parts[4]) atoms.push(parts[4]);
  return atoms.length ? atoms : [text];
}

// Expand a row template into one entry per stitch.
//
// Cells are what the user typed. Once split into atoms, each is either
//   k, 3k, 12p   a stitch code, optionally with a count
//   *            opens a group, or closes the open one
//   3            how many times the group just closed should run
//
// so "s *k p*3 s" becomes slip, knit, purl, knit, purl, knit, purl, slip.
//
// Groups do not nest: once one is open the next * closes it. That is the
// price of using one character for both ends, and it matches how the notation
// reads aloud.
function parseTemplate(cells, namesByCode) {
  const tokens = [];
  for (const cell of cells) {
    for (const atom of splitCell(cell)) tokens.push(atom);
  }
  return parseTokens(tokens, namesByCode);
}

function parseTokens(tokens, namesByCode) {
  // stack[0] collects the row; a second entry appears while a group is open.
  const stack = [[]];

  for (let i = 0; i < tokens.length; i++) {
    const token = String(tokens[i]).trim();
    if (token === "") continue;

    if (token === "*") {
      if (stack.length > 1) {
        const group = stack.pop();
        let count = 1;

        // A bare number straight after the closing * is how many times.
        const next = String(tokens[i + 1] === undefined ? "" : tokens[i + 1]).trim();
        if (/^\d+$/.test(next)) {
          count = Number(next);
          i++;
        }
        if (count < 1) return { error: "A repeat has to happen at least once." };
        if (group.length === 0) return { error: "That group is empty." };

        for (let n = 0; n < count; n++) {
          for (const name of group) stack[stack.length - 1].push(name);
        }
      } else {
        stack.push([]);
      }
      continue;
    }

    const parts = /^(\d*)([A-Za-z]+)$/.exec(token);
    if (!parts) return { error: 'Cannot read "' + token + '".' };

    const count = parts[1] === "" ? 1 : Number(parts[1]);
    const code = parts[2].toLowerCase();

    if (count < 1) return { error: 'Counts start at 1, so "' + token + '" is not valid.' };
    if (!namesByCode[code]) return { error: 'No stitch type has the code "' + code + '".' };

    for (let n = 0; n < count; n++) stack[stack.length - 1].push(namesByCode[code]);
  }

  if (stack.length > 1) return { error: "A * was opened but never closed." };
  if (stack[0].length === 0) return { error: "The row template is empty." };

  return { stitches: stack[0], error: null };
}

// Running counts for the strip above the cells, one entry per cell.
//
// Deliberately tolerant: this runs on every keystroke, against half-typed
// input, so anything it cannot read becomes "?" rather than an error.
//
// While a group is still open the running fabric total is not knowable — the
// repeat count has not been typed — so it reports the count *within* the
// group, which is what tells you how big one repeat is while you build it.
// The moment the group closes those interim figures are cleared: they were
// scaffolding, and leaving them up next to real totals only misleads.
function templateCounts(cells, namesByCode) {
  // Flatten to atoms, remembering which cell each came from.
  const atoms = [];
  for (let i = 0; i < cells.length; i++) {
    for (const atom of splitCell(cells[i])) atoms.push({ text: atom, cell: i });
  }

  const marks = atoms.map(function () { return { text: "", inGroup: false }; });
  let total = 0;
  let group = null;        // stitches so far inside the open group, or null
  let groupStart = -1;     // where to start clearing when it closes

  for (let i = 0; i < atoms.length; i++) {
    const token = atoms[i].text;

    if (token === "*") {
      if (group === null) {
        group = 0;
        groupStart = i;
        marks[i].inGroup = true;
      } else {
        const next = i + 1 < atoms.length ? atoms[i + 1].text : "";
        const hasCount = /^\d+$/.test(next);
        total += group * (hasCount ? Number(next) : 1);

        // The repeat is settled, so the interim group figures come down.
        for (let j = groupStart; j <= i; j++) {
          marks[j].text = "";
          marks[j].inGroup = false;
        }
        group = null;
        groupStart = -1;

        if (hasCount) {
          marks[i + 1].text = String(total);
          i++;
        } else {
          marks[i].text = String(total);
        }
      }
      continue;
    }

    const parts = /^(\d*)([A-Za-z]+)$/.exec(token);
    const known = parts && namesByCode[parts[2].toLowerCase()];
    if (!known) {
      marks[i].text = "?";
      marks[i].inGroup = group !== null;
      continue;
    }

    const count = parts[1] === "" ? 1 : Number(parts[1]);
    if (group === null) {
      total += count;
      marks[i].text = String(total);
    } else {
      group += count;
      marks[i].text = String(group);
      marks[i].inGroup = true;
    }
  }

  // A cell shows whatever its last meaningful atom worked out to.
  const out = cells.map(function () { return { text: "", inGroup: false }; });
  for (let i = 0; i < atoms.length; i++) {
    if (marks[i].text !== "" || marks[i].inGroup) out[atoms[i].cell] = marks[i];
  }
  return out;
}

// Expand a stack of row templates into the actual rows of the fabric.
//
// Rows are worked once unless they fall inside a marked repeat: a row can open
// a repeat, close one, or both at once for a single-row repeat. The row that
// closes it says how many times the whole block runs. Nothing repeats
// implicitly — the template states the fabric's full height.
//
// Every row has to come out the same width: layer 3 lays stitches into a
// rectangular grid with a fixed stitches-per-row, so rows of different widths
// would mean increases and decreases — shaping — which is a different project.
function expandBlock(rows, namesByCode) {
  const out = [];
  let block = null;      // rows gathered since a repeat opened, or null
  let width = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = "Row " + (i + 1);

    const parsed = parseTemplate(row.tokens, namesByCode);
    if (parsed.error) return { error: label + ": " + parsed.error };

    if (width === null) {
      width = parsed.stitches.length;
    } else if (parsed.stitches.length !== width) {
      return {
        error: label + " is " + parsed.stitches.length +
               " stitches but row 1 is " + width + ". Every row must match.",
      };
    }

    if (row.repeatStart) {
      if (block !== null) {
        return { error: label + " opens a repeat inside another one. Repeats cannot nest." };
      }
      block = [];
    }

    (block === null ? out : block).push(parsed.stitches);

    if (row.repeatEnd) {
      if (block === null) {
        return { error: label + " ends a repeat that was never started." };
      }
      const times = Math.max(1, Math.floor(row.repeatCount) || 1);
      for (let n = 0; n < times; n++) {
        for (const r of block) out.push(r);
      }
      block = null;
    }
  }

  if (block !== null) {
    return { error: "A repeat was opened but never closed." };
  }
  if (out.length === 0) return { error: "Add at least one template row." };

  return { rows: out, stitches: width, error: null };
}

// Row r uses the expanded template at r. The modulo is belt and braces: the
// row count is derived from the template, so it should never wrap.
function blockConsumption(rowTemplates, metresByName, stitchesPerRow) {
  return function (k) {
    const row = Math.floor(k / stitchesPerRow);
    const rowTypes = rowTemplates[row % rowTemplates.length];
    const name = rowTypes[k % stitchesPerRow];
    return metresByName[name] === undefined ? 0 : metresByName[name];
  };
}

console.log("consumption.js loaded");
