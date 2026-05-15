/* js/admin.js  –  Admin page interactions (minimal; forms handle most actions) */

(function () {
  'use strict';

  /* Auto-dismiss flash alerts after 5 seconds */
  ['alert-success', 'alert-error'].forEach(cls => {
    document.querySelectorAll('.' + cls).forEach(el => {
      setTimeout(() => {
        el.style.transition = 'opacity 0.4s';
        el.style.opacity    = '0';
        setTimeout(() => el.remove(), 400);
      }, 5000);
    });
  });
})();
