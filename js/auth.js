/* js/auth.js  –  Login & Register page interactions */

(function () {
  'use strict';

  /* ── Password visibility toggle ─────────────────────────── */
  const toggleBtn = document.getElementById('toggle-pw');
  const pwInput   = document.getElementById('password');
  const eyeIcon   = document.getElementById('eye-icon');

  if (toggleBtn && pwInput) {
    toggleBtn.addEventListener('click', () => {
      const isText = pwInput.type === 'text';
      pwInput.type = isText ? 'password' : 'text';
      // Swap icon: open eye ↔ closed eye
      eyeIcon.innerHTML = isText
        ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
        : '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>' +
          '<path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>' +
          '<line x1="1" y1="1" x2="23" y2="23"/>';
    });
  }

  /* ── Demo credential fill-in (login page only) ───────────── */
  document.querySelectorAll('.demo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const identifierEl = document.getElementById('identifier');
      const passwordEl   = document.getElementById('password');
      if (identifierEl) identifierEl.value = btn.dataset.user;
      if (passwordEl)   passwordEl.value   = btn.dataset.pass;
    });
  });

  /* ── File input label update (register page) ─────────────── */
  const fileInput = document.getElementById('datafile');
  const fileLabel = document.getElementById('file-label');
  if (fileInput && fileLabel) {
    fileInput.addEventListener('change', () => {
      fileLabel.textContent = fileInput.files[0]
        ? fileInput.files[0].name
        : 'CSV, XLSX, XLS — max 20 MB';
    });
  }
})();
