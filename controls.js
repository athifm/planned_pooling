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

// Start with the sequence we have been testing against.
addColorRow("#ff0000", 2);
addColorRow("#0000ff", 1);
addColorRow("#008000", 4);

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
