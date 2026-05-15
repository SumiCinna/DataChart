/* js/staff.js  –  File management page interactions */

(function () {
  'use strict';

  /* ── Drag & drop on the staff upload zone ─────────────────── */
  const dz      = document.getElementById('drop-zone-staff');
  const input   = document.getElementById('datafile');
  const label   = document.getElementById('file-label');
  const form    = document.getElementById('upload-form');

  if (!dz || !input) return;

  dz.addEventListener('dragover', e => {
    e.preventDefault();
    dz.classList.add('drag-over');
  });

  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));

  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // Transfer to real input
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    updateLabel(file.name);
  });

  input.addEventListener('change', () => {
    if (input.files[0]) updateLabel(input.files[0].name);
  });

  function updateLabel(name) {
    if (label) label.textContent = name;
  }

  /* ── Confirm before delete (extra guard beyond PHP confirm) ── */
  // Already handled inline with onsubmit on each form.
})();
