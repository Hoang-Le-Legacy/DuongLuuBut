/**
 * Full-size photo viewer for a message's photo strip. Uses the native
 * <dialog> element (`showModal()` gives us a free focus trap + top-layer
 * stacking); Esc closes it natively. Adds prev/next, arrow-key nav, and
 * swipe-to-navigate on touch.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let dialogEl, imgEl, counterEl, prevBtn, nextBtn, closeBtn;
  let images = [];
  let index = 0;
  let touchStartX = null;
  let ready = false;

  function init() {
    if (ready) return;
    dialogEl = $('lightbox');
    imgEl = $('lightbox-img');
    counterEl = $('lightbox-counter');
    prevBtn = $('lightbox-prev');
    nextBtn = $('lightbox-next');
    closeBtn = $('lightbox-close');
    if (!dialogEl) return;

    prevBtn.addEventListener('click', showPrev);
    nextBtn.addEventListener('click', showNext);
    closeBtn.addEventListener('click', close);
    dialogEl.addEventListener('click', (e) => {
      if (e.target === dialogEl) close();
    });
    dialogEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        showPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        showNext();
      }
    });
    dialogEl.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    dialogEl.addEventListener('touchend', (e) => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) < 40) return;
      if (dx > 0) showPrev();
      else showNext();
    }, { passive: true });

    ready = true;
  }

  function render() {
    if (!images.length) return;
    imgEl.src = images[index].url;
    counterEl.textContent = `${index + 1} / ${images.length}`;
    const multi = images.length > 1;
    prevBtn.hidden = !multi;
    nextBtn.hidden = !multi;
  }

  function showPrev() {
    if (!images.length) return;
    index = (index - 1 + images.length) % images.length;
    render();
  }

  function showNext() {
    if (!images.length) return;
    index = (index + 1) % images.length;
    render();
  }

  function open(imgs, startIndex) {
    init();
    if (!dialogEl || !imgs || !imgs.length) return;
    images = imgs;
    index = Math.min(Math.max(startIndex || 0, 0), images.length - 1);
    render();
    if (typeof dialogEl.showModal === 'function') dialogEl.showModal();
    else dialogEl.setAttribute('open', '');
  }

  function close() {
    if (!dialogEl) return;
    if (dialogEl.open && typeof dialogEl.close === 'function') dialogEl.close();
    else dialogEl.removeAttribute('open');
  }

  window.Lightbox = { open, close };
})();
