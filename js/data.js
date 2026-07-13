/**
 * Configuration for the "Sổ Lưu Bút — Dương Domino" farewell book.
 * Messages themselves now live in Neon (via the /api endpoints, see js/api.js)
 * — this file only holds display config and the localStorage keys used to
 * cache the unlock token in the visitor's browser.
 */
(function () {
  'use strict';

  /** Washi-tape tints, cycled per page. */
  const TAPE_COLORS = [
    'oklch(78% 0.09 45 / 0.55)',
    'oklch(80% 0.08 90 / 0.55)',
    'oklch(75% 0.1 25 / 0.5)'
  ];

  window.SLUUBUT_DATA = Object.freeze({
    TAPE_COLORS,
    TOKEN_KEY: 'sluubut_token',
    PHASE_MS: 260,
    MAX_IMAGES: 5,
    MAX_IMAGE_DIMENSION: 1600,
    MAX_UPLOAD_BYTES: 5 * 1024 * 1024
  });
})();
