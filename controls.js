// UI machinery for the yarn color rows.
// Creating and removing elements is browser boilerplate, not project logic.

const colorRows = document.getElementById("colorRows");

// Build one row: a color swatch, a length in metres, and a remove button.
function addColorRow(color, length) {
  const row = document.createElement("div");
  row.className = "colorRow";

  const swatch = document.createElement("input");
  swatch.type = "color";
  swatch.value = color;

  const len = document.createElement("input");
  len.type = "number";
  len.className = "length";
  len.value = length;
  len.step = "0.1";
  len.min = "0.1";
  // The visible "Length" heading is one column title above the whole list,
  // so each box carries its own label for anyone using a screen reader.
  len.setAttribute("aria-label", "Length");

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "remove";
  remove.addEventListener("click", function () {
    // A yarn with no colors makes no sense — always keep one row.
    if (colorRows.children.length > 1) {
      row.remove();
      draw();   // defined in app.js, which loads after this file
    }
  });

  row.appendChild(swatch);
  row.appendChild(len);
  row.appendChild(remove);
  colorRows.appendChild(row);
}

document.getElementById("addColor").addEventListener("click", function () {
  addColorRow("#cccccc", 1);
});

// Replace the whole list. The starting rows are no longer created here — they
// come from the saved settings, or from the defaults in settings.js.
function setColorRows(sequence) {
  colorRows.textContent = "";
  for (const band of sequence) {
    addColorRow(band.color, band.length);
  }
}

// --- Stitch type rows -------------------------------------------------------
// Same machinery as the colour rows: a name, a consumption, a remove button.

const typeRows = document.getElementById("typeRows");

function addTypeRow(name, code, perStitch) {
  const row = document.createElement("div");
  row.className = "typeRow";

  const nameBox = document.createElement("input");
  nameBox.type = "text";
  nameBox.className = "typeName";
  nameBox.value = name;
  nameBox.setAttribute("aria-label", "Stitch type name");

  // The short code is what the row template is written in.
  const codeBox = document.createElement("input");
  codeBox.type = "text";
  codeBox.className = "typeCode";
  codeBox.value = code;
  codeBox.size = 3;
  codeBox.setAttribute("aria-label", "Stitch type code");

  const amount = document.createElement("input");
  amount.type = "number";
  amount.className = "typeAmount";
  amount.value = perStitch;
  amount.step = "0.1";
  amount.min = "0.01";
  amount.setAttribute("aria-label", "Yarn per stitch");

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "remove";
  remove.addEventListener("click", function () {
    // The fabric has to be knitted in something.
    if (typeRows.children.length > 1) {
      row.remove();
      refreshTypeChoices();
      draw();
    }
  });

  row.appendChild(nameBox);
  row.appendChild(codeBox);
  row.appendChild(amount);
  row.appendChild(remove);
  typeRows.appendChild(row);
}

function setTypeRows(types) {
  typeRows.textContent = "";
  for (const t of types) {
    addTypeRow(t.name, t.code, t.perStitch);
  }
}

function readTypes() {
  return [...typeRows.querySelectorAll(".typeRow")].map(function (row) {
    return {
      name: row.querySelector(".typeName").value,
      code: row.querySelector(".typeCode").value.trim().toLowerCase(),
      perStitch: Number(row.querySelector(".typeAmount").value),
    };
  });
}

// { k: "knit", p: "purl", ... } for the template parser.
function typeNamesByCode() {
  const map = {};
  for (const t of readTypes()) {
    if (t.code) map[t.code] = t.name;
  }
  return map;
}

// The "stitch used" dropdown lists whatever types currently exist, so it has to
// be rebuilt whenever a type is added, removed or renamed.
function refreshTypeChoices() {
  const select = document.getElementById("activeType");
  const wanted = select.value;
  const wantedIndex = select.selectedIndex;
  const types = readTypes();

  select.textContent = "";
  for (const t of types) {
    const option = document.createElement("option");
    option.value = t.name;
    option.textContent = t.name;
    select.appendChild(option);
  }

  // Keep the selection if that name still exists. If it does not, the usual
  // cause is that the selected type was just renamed — so hold the same
  // position in the list rather than jumping back to the first type.
  const stillThere = types.some(function (t) { return t.name === wanted; });
  if (stillThere) {
    select.value = wanted;
  } else if (types.length) {
    select.selectedIndex = Math.min(Math.max(wantedIndex, 0), types.length - 1);
  }
}

document.getElementById("addType").addEventListener("click", function () {
  addTypeRow("new stitch", "", 5);
  refreshTypeChoices();
});

// --- Row templates ----------------------------------------------------------
// Each row is a strip of one-token boxes with a running count above it, like a
// spreadsheet. Enter, space or Tab finishes a cell and moves on; backspace in
// an empty cell deletes it and steps back. There is always exactly one empty
// cell at the end to type into. The strip never wraps — it scrolls sideways,
// and the focused cell scrolls itself into view.

const templateRowsBox = document.getElementById("templateRows");

function cellStripOf(rowEl) {
  return rowEl.querySelector(".cellStrip");
}

function readRowTokens(rowEl) {
  return [...cellStripOf(rowEl).querySelectorAll(".templateCell")]
    .map(function (cell) { return cell.value.trim(); })
    .filter(function (token) { return token !== ""; });
}

function readTemplateRows() {
  return [...templateRowsBox.querySelectorAll(".templateRow")].map(function (rowEl) {
    return {
      tokens: readRowTokens(rowEl),
      repeatStart: rowEl.querySelector(".repeatStart").checked,
      repeatEnd: rowEl.querySelector(".repeatEnd").checked,
      repeatCount: Number(rowEl.querySelector(".repeatCount").value),
    };
  });
}

// Redraw the counter strip above one row's cells. Called on every keystroke,
// so it works from whatever is typed so far rather than demanding valid input.
function updateRowCounts(rowEl) {
  const counts = templateCounts(
    [...cellStripOf(rowEl).querySelectorAll(".templateCell")]
      .map(function (cell) { return cell.value.trim(); }),
    typeNamesByCode()
  );

  const strip = rowEl.querySelector(".countStrip");
  strip.textContent = "";

  for (const entry of counts) {
    const box = document.createElement("span");
    box.className = "countCell" + (entry.inGroup ? " inGroup" : "");
    box.textContent = entry.text;
    strip.appendChild(box);
  }
}

function ensureTrailingCell(rowEl) {
  const cells = cellStripOf(rowEl).querySelectorAll(".templateCell");
  const last = cells[cells.length - 1];
  if (!last || last.value.trim() !== "") addTemplateCell(rowEl, "");
}

function addTemplateCell(rowEl, value) {
  const cell = document.createElement("input");
  cell.type = "text";
  cell.className = "templateCell";
  cell.value = value;
  cell.setAttribute("aria-label", "Row template entry");

  cell.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      // Space separates cells here; it is never a character in a token.
      e.preventDefault();
      if (cell.value.trim() !== "") {
        ensureTrailingCell(rowEl);
        if (cell.nextElementSibling) cell.nextElementSibling.focus();
      }
      applyTemplate();
      return;
    }

    if (e.key === "Backspace" && cell.value === "") {
      const previous = cell.previousElementSibling;
      if (previous) {
        e.preventDefault();
        cell.remove();
        previous.focus();
        previous.setSelectionRange(previous.value.length, previous.value.length);
        updateRowCounts(rowEl);
        applyTemplate();
      }
    }
  });

  cell.addEventListener("input", function () {
    ensureTrailingCell(rowEl);
    updateRowCounts(rowEl);
    // The counters refresh on every keystroke, so the message has to as well —
    // otherwise it sits there contradicting them until the cell loses focus.
    updateTemplateMessage();
  });

  // Without this the caret walks off the right-hand edge and out of sight.
  cell.addEventListener("focus", function () {
    cell.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  cellStripOf(rowEl).appendChild(cell);
  return cell;
}

function addTemplateRow(row) {
  const tokens = row.tokens || [];
  const rowEl = document.createElement("div");
  rowEl.className = "templateRow";

  // Counter strip and cells share one scrolling box so they stay aligned.
  const scroller = document.createElement("div");
  scroller.className = "templateScroll";

  const counts = document.createElement("div");
  counts.className = "countStrip";

  const cells = document.createElement("div");
  cells.className = "cellStrip";

  scroller.appendChild(counts);
  scroller.appendChild(cells);

  // Repeat markers. A row can open a repeat, close one, or do both for a
  // single-row repeat. The count only means anything on the closing row, so it
  // only appears there.
  const marks = document.createElement("span");
  marks.className = "repeatMarks";

  const startLabel = document.createElement("label");
  startLabel.className = "repeatMark";
  const startBox = document.createElement("input");
  startBox.type = "checkbox";
  startBox.className = "repeatStart";
  startBox.checked = !!row.repeatStart;
  startBox.setAttribute("aria-label", "Start a repeat at this row");
  startLabel.appendChild(startBox);
  startLabel.appendChild(document.createTextNode("start"));

  const endLabel = document.createElement("label");
  endLabel.className = "repeatMark";
  const endBox = document.createElement("input");
  endBox.type = "checkbox";
  endBox.className = "repeatEnd";
  endBox.checked = !!row.repeatEnd;
  endBox.setAttribute("aria-label", "End a repeat at this row");
  endLabel.appendChild(endBox);
  endLabel.appendChild(document.createTextNode("end"));

  const countLabel = document.createElement("label");
  countLabel.className = "repeatCountLabel";
  countLabel.textContent = "x";
  const countBox = document.createElement("input");
  countBox.type = "number";
  countBox.className = "repeatCount";
  countBox.min = "1";
  countBox.value = row.repeatCount === undefined ? 1 : row.repeatCount;
  countBox.setAttribute("aria-label", "How many times the block repeats");
  countLabel.appendChild(countBox);

  function showCount() {
    countLabel.style.visibility = endBox.checked ? "visible" : "hidden";
  }
  endBox.addEventListener("change", showCount);
  showCount();

  marks.appendChild(startLabel);
  marks.appendChild(endLabel);
  marks.appendChild(countLabel);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "remove";
  remove.addEventListener("click", function () {
    // A block with no rows is not a pattern.
    if (templateRowsBox.children.length > 1) {
      rowEl.remove();
      applyTemplate();
    }
  });

  const controls = document.createElement("div");
  controls.className = "templateControls";
  controls.appendChild(marks);
  controls.appendChild(remove);

  rowEl.appendChild(scroller);
  rowEl.appendChild(controls);
  templateRowsBox.appendChild(rowEl);

  for (const token of tokens) addTemplateCell(rowEl, token);
  ensureTrailingCell(rowEl);
  updateRowCounts(rowEl);
  return rowEl;
}

function setTemplateRows(rows) {
  templateRowsBox.textContent = "";
  for (const row of rows) addTemplateRow(row);
}

// Recount every row — needed when a stitch code changes, since that changes
// what the existing tokens mean.
function updateAllRowCounts() {
  for (const rowEl of templateRowsBox.querySelectorAll(".templateRow")) {
    updateRowCounts(rowEl);
  }
}

document.getElementById("addTemplateRow").addEventListener("click", function () {
  // Copy the row above: the next row is nearly always a variation on the last
  // one, and retyping a long template is the main friction here.
  const existing = readTemplateRows();
  const previous = existing[existing.length - 1];
  addTemplateRow({
    tokens: previous ? previous.tokens.slice() : [],
    repeatStart: false,
    repeatEnd: false,
    repeatCount: 1,
  });
  applyTemplate();
});

// Read the rows back off the page as [{ color, length }, ...].
// Lengths come back in metres whatever unit the boxes are showing, so nothing
// downstream has to know a unit exists.
function readSequence() {
  const crows = document.querySelectorAll(".colorRow");
  const unit = document.getElementById("lengthUnit").value;
  const out = [];

  for (const row of crows) {
    const col = row.querySelector("input[type=color]").value;
    const len = Number(row.querySelector(".length").value);
    out.push({ color: col, length: toMetres(len, unit) });
  }

  return out;
}

console.log("controls.js loaded");
