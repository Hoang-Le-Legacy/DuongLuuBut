/**
 * Standalone "write for Dương" page (contribute.html) — a Google-Form-style
 * flow for anyone with a shared link, no password. Gated entirely by the
 * `?t=` token in the URL, verified against `/api/contribute`.
 *
 * The photo grid here mirrors js/editor.js's (upload/reorder/remove), kept
 * as its own small copy rather than a shared module — this page intentionally
 * has no dependency on editor.js/app.js/lightbox.js, since it's a different
 * (unauthenticated) trust boundary and should stay easy to reason about on
 * its own.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const API = window.SLUUBUT_API;
  const { MAX_IMAGES, TAPE_COLORS } = window.SLUUBUT_DATA;

  const token = new URLSearchParams(window.location.search).get('t') || '';

  const els = {
    loading: $('contribute-loading'),
    invalid: $('contribute-invalid'),
    form: $('contribute-form'),
    sender: $('contribute-sender'),
    date: $('contribute-date'),
    message: $('contribute-message'),
    wish: $('contribute-wish'),
    grid: $('contribute-photo-grid'),
    fileInput: $('contribute-photo-input'),
    status: $('contribute-photo-status'),
    error: $('contribute-error'),
    submit: $('contribute-submit'),
    success: $('contribute-success'),
    again: $('contribute-again'),
    viewPreview: $('contribute-view-preview')
  };

  const preview = {
    overlay: $('preview-overlay'),
    close: $('preview-close'),
    book: $('preview-book'),
    pageLabel: $('preview-page-label'),
    dots: $('preview-dots'),
    leaf: $('preview-leaf'),
    leafShadow: $('preview-leaf-shadow'),
    underShadow: $('preview-under-shadow'),
    wishesPage: $('preview-wishes-page'),
    wishesWall: $('preview-wishes-wall'),
    wishesEmpty: $('preview-wishes-empty'),
    leafContent: $('preview-leaf-content'),
    tape: $('preview-tape'),
    entryPhotos: $('preview-entry-photos'),
    entryMessage: $('preview-entry-message'),
    entryName: $('preview-entry-name'),
    coverWrap: $('preview-cover-wrap'),
    coverFlip: $('preview-cover-flip'),
    btnOpen: $('preview-btn-open'),
    btnPrev: $('preview-btn-prev'),
    btnNext: $('preview-btn-next')
  };

  let photos = []; // [{ url, pathname, position }]
  let uploadingCount = 0;
  let lastSubmission = null; // { sender, message, photos } — for reopening the preview

  function setError(msg) {
    els.error.hidden = !msg;
    els.error.textContent = msg || '';
  }

  function setStatus(msg) {
    els.status.hidden = !msg;
    els.status.textContent = msg || '';
  }

  function renumber() {
    photos = photos.map((p, i) => Object.assign({}, p, { position: i }));
  }

  function renderPhotoGrid() {
    els.grid.innerHTML = '';
    photos.forEach((photo, i) => {
      const tile = document.createElement('div');
      tile.className = 'editor__photo';

      const img = document.createElement('img');
      img.src = photo.url;
      img.alt = '';
      tile.appendChild(img);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'editor__photo-remove';
      removeBtn.setAttribute('aria-label', 'Xóa ảnh này');
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        photos.splice(i, 1);
        renumber();
        renderPhotoGrid();
      });
      tile.appendChild(removeBtn);

      if (photos.length > 1) {
        const moveWrap = document.createElement('div');
        moveWrap.className = 'editor__photo-move';
        if (i > 0) {
          const left = document.createElement('button');
          left.type = 'button';
          left.textContent = '‹';
          left.setAttribute('aria-label', 'Chuyển ảnh sang trước');
          left.addEventListener('click', () => {
            [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]];
            renumber();
            renderPhotoGrid();
          });
          moveWrap.appendChild(left);
        }
        if (i < photos.length - 1) {
          const right = document.createElement('button');
          right.type = 'button';
          right.textContent = '›';
          right.setAttribute('aria-label', 'Chuyển ảnh sang sau');
          right.addEventListener('click', () => {
            [photos[i + 1], photos[i]] = [photos[i], photos[i + 1]];
            renumber();
            renderPhotoGrid();
          });
          moveWrap.appendChild(right);
        }
        tile.appendChild(moveWrap);
      }

      els.grid.appendChild(tile);
    });

    if (photos.length < MAX_IMAGES) {
      const addTile = document.createElement('button');
      addTile.type = 'button';
      addTile.className = 'editor__photo-add';
      addTile.textContent = '+ ảnh';
      addTile.addEventListener('click', () => els.fileInput.click());
      els.grid.appendChild(addTile);
    }
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).slice(0, MAX_IMAGES - photos.length);
    if (files.length === 0) return;
    setError('');
    uploadingCount += files.length;
    setStatus(`Đang tải ${files.length} ảnh…`);
    for (const file of files) {
      try {
        const uploaded = await API.uploadContributionImage(file, token);
        photos.push({ url: uploaded.url, pathname: uploaded.pathname, position: photos.length });
        renumber();
        renderPhotoGrid();
      } catch (err) {
        setError('Không tải được ảnh — thử ảnh khác hoặc file nhỏ hơn nhé.');
      } finally {
        uploadingCount -= 1;
      }
    }
    setStatus(uploadingCount > 0 ? `Đang tải ${uploadingCount} ảnh…` : '');
  }

  // ---- post-submit preview: full-screen replica of the real book, scoped to
  // the 2 pages this guest can actually see — the public wishes wall and the
  // message they just sent. Deliberately no admin markup exists in this DOM
  // at all (no gear/admin-bar/entry-controls), and the flip state machine
  // below is its own small copy of app.js's cover/leaf phase logic, kept
  // separate for the same reason as the rest of this file (a different,
  // unauthenticated trust boundary that shouldn't depend on app.js).
  const { PHASE_MS } = window.SLUUBUT_DATA;
  const previewState = { opened: false, index: 0, turning: false, phase: 'idle', direction: 'next' };
  let previewDotEls = [];

  function renderPreviewBook() {
    const { opened, index, phase, direction } = previewState;

    preview.coverFlip.style.transform = opened ? 'rotateY(-155deg)' : 'rotateY(0deg)';
    preview.coverWrap.style.pointerEvents = opened ? 'none' : 'auto';
    preview.book.style.opacity = opened ? '1' : '0';
    preview.book.style.pointerEvents = opened ? 'auto' : 'none';

    preview.pageLabel.textContent = String(index + 1);
    previewDotEls.forEach((dot, i) => {
      dot.style.background = i === index ? 'oklch(48% 0.1 28)' : 'oklch(75% 0.03 50)';
    });

    const sign = direction === 'next' ? -1 : 1;
    let transform = 'rotateY(0deg) scaleY(1)';
    let transition = 'none';
    let shadowOpacity = 0;
    let underShadowOpacity = 0;
    let pageShadow = 'none';
    if (phase === 'closing') {
      transform = `rotateY(${sign * 92}deg) scaleY(0.985)`;
      transition = `transform ${PHASE_MS}ms cubic-bezier(.55,0,.85,.35)`;
      shadowOpacity = 1;
      underShadowOpacity = 0.6;
      pageShadow = `${sign * -14}px 4px 24px oklch(20% 0.03 40 / 0.35)`;
    } else if (phase === 'opening') {
      transition = `transform ${PHASE_MS}ms cubic-bezier(.15,.65,.45,1)`;
      pageShadow = '0 4px 24px oklch(20% 0.03 40 / 0.15)';
    }
    preview.leaf.style.transform = transform;
    preview.leaf.style.transition = transition;
    preview.leaf.style.boxShadow = pageShadow;
    preview.leafShadow.style.opacity = String(shadowOpacity);
    preview.underShadow.style.opacity = String(underShadowOpacity);
    preview.underShadow.style.transition = transition;

    preview.wishesPage.hidden = index !== 0;
    preview.leafContent.hidden = index !== 1;

    preview.btnPrev.disabled = index === 0;
    preview.btnNext.disabled = index === 1;
  }

  function previewSetState(patch) {
    Object.assign(previewState, patch);
    renderPreviewBook();
  }

  function previewOpenBook() {
    previewSetState({ opened: true });
  }

  function previewNext() {
    if (previewState.turning || previewState.index === 1) return;
    previewSetState({ turning: true, direction: 'next', phase: 'closing' });
    setTimeout(() => {
      previewSetState({ index: 1, phase: 'opening' });
      setTimeout(() => previewSetState({ turning: false, phase: 'idle' }), PHASE_MS);
    }, PHASE_MS);
  }

  function previewPrev() {
    if (previewState.turning || previewState.index === 0) return;
    previewSetState({ turning: true, direction: 'prev', phase: 'closing' });
    setTimeout(() => {
      previewSetState({ index: 0, phase: 'opening' });
      setTimeout(() => previewSetState({ turning: false, phase: 'idle' }), PHASE_MS);
    }, PHASE_MS);
  }

  function previewJump(index) {
    if (previewState.turning || index === previewState.index) return;
    if (index === 0) previewPrev();
    else previewNext();
  }

  function buildPreviewDots() {
    preview.dots.innerHTML = '';
    previewDotEls = [0, 1].map((i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'dot' + (i === 0 ? ' dot--wishes' : '');
      dot.setAttribute('aria-label', 'Trang ' + (i + 1));
      dot.addEventListener('click', () => previewJump(i));
      preview.dots.appendChild(dot);
      return dot;
    });
  }

  function renderPreviewWishesWall(wishes) {
    preview.wishesWall.innerHTML = '';
    preview.wishesEmpty.hidden = wishes.length > 0;
    wishes.forEach((wish, i) => {
      const card = document.createElement('div');
      card.className = 'wish-card';
      card.style.setProperty('--tilt', i % 2 === 0 ? '-1.6deg' : '1.4deg');
      card.style.background = TAPE_COLORS[i % TAPE_COLORS.length];

      const text = document.createElement('p');
      text.className = 'wish-card__text';
      text.textContent = wish.text;
      card.appendChild(text);

      const name = document.createElement('p');
      name.className = 'wish-card__name';
      name.textContent = '— ' + wish.sender;
      card.appendChild(name);

      preview.wishesWall.appendChild(card);
    });
  }

  function renderPreviewEntry(sender, message, entryPhotos) {
    preview.tape.style.background = TAPE_COLORS[0];
    preview.entryMessage.textContent = message;
    preview.entryName.textContent = '— ' + sender;

    preview.entryPhotos.innerHTML = '';
    preview.entryPhotos.hidden = entryPhotos.length === 0;
    entryPhotos.forEach((photo) => {
      const tile = document.createElement('div');
      tile.className = 'thumb';
      const img = document.createElement('img');
      img.src = photo.url;
      img.alt = '';
      tile.appendChild(img);
      preview.entryPhotos.appendChild(tile);
    });
  }

  function closePreview() {
    preview.overlay.hidden = true;
    document.body.style.overflow = '';
  }

  async function openPreview(sender, message, entryPhotos) {
    renderPreviewEntry(sender, message, entryPhotos);
    try {
      const data = await API.fetchWishes();
      renderPreviewWishesWall(data.wishes || []);
    } catch (err) {
      renderPreviewWishesWall([]);
    }
    buildPreviewDots();
    previewSetState({ opened: false, index: 0, phase: 'idle', turning: false, direction: 'next' });
    preview.overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  preview.btnOpen.addEventListener('click', previewOpenBook);
  preview.btnPrev.addEventListener('click', previewPrev);
  preview.btnNext.addEventListener('click', previewNext);
  preview.close.addEventListener('click', closePreview);
  document.addEventListener('keydown', (e) => {
    if (preview.overlay.hidden) return;
    if (e.key === 'Escape') { closePreview(); return; }
    if (!previewState.opened) return;
    if (e.key === 'ArrowRight') previewNext();
    else if (e.key === 'ArrowLeft') previewPrev();
  });

  function resetForm() {
    els.sender.value = '';
    els.date.value = '';
    els.message.value = '';
    els.wish.value = '';
    photos = [];
    renderPhotoGrid();
    setError('');
    setStatus('');
  }

  async function submit() {
    const sender = els.sender.value.trim();
    const message = els.message.value.trim();
    const wish = els.wish.value.trim();
    if (!sender) return setError('Cần điền tên của bạn.');
    if (!message) return setError('Cần viết lời nhắn.');
    if (uploadingCount > 0) return setError('Đợi ảnh tải xong nhé.');

    const payload = {
      token,
      sender,
      message,
      images: photos.map((p, i) => ({ url: p.url, pathname: p.pathname, position: i }))
    };
    if (els.date.value) payload.date = API.isoToMmDdYy(els.date.value);

    els.submit.disabled = true;
    setError('');
    try {
      await API.submitContribution(payload);
      // Best-effort: the wish is a separate, always-public content type from
      // the entry above — a failure here shouldn't undo the message that
      // already saved successfully.
      if (wish) {
        try {
          await API.submitWish({ token, sender, text: wish });
        } catch (err) {
          /* entry already saved; wish can be added another time */
        }
      }
      els.form.hidden = true;
      els.success.hidden = false;
      lastSubmission = { sender, message, photos };
      openPreview(sender, message, photos);
    } catch (err) {
      if (err && err.status === 401) {
        setError('Liên kết này đã bị thu hồi.');
      } else {
        setError('Không gửi được — thử lại nhé.');
      }
    } finally {
      els.submit.disabled = false;
    }
  }

  function insertTemplate(template) {
    const current = els.message.value;
    const insertion = current && !current.endsWith('\n') ? `${current}\n${template}` : current + template;
    els.message.value = insertion;
    els.message.focus();
    const blankStart = insertion.lastIndexOf('____');
    if (blankStart !== -1) {
      els.message.setSelectionRange(blankStart, blankStart + 4);
    } else {
      els.message.setSelectionRange(insertion.length, insertion.length);
    }
  }

  document.querySelectorAll('.generator__chip').forEach((chip) => {
    chip.addEventListener('click', () => insertTemplate(chip.dataset.template));
  });

  els.submit.addEventListener('click', submit);
  els.viewPreview.addEventListener('click', () => {
    if (lastSubmission) openPreview(lastSubmission.sender, lastSubmission.message, lastSubmission.photos);
  });
  els.again.addEventListener('click', () => {
    closePreview();
    resetForm();
    els.success.hidden = true;
    els.form.hidden = false;
    els.sender.focus();
  });
  els.fileInput.addEventListener('change', () => {
    handleFiles(els.fileInput.files);
    els.fileInput.value = '';
  });
  els.grid.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.grid.classList.add('editor__photo-grid--over');
  });
  els.grid.addEventListener('dragleave', () => els.grid.classList.remove('editor__photo-grid--over'));
  els.grid.addEventListener('drop', (e) => {
    e.preventDefault();
    els.grid.classList.remove('editor__photo-grid--over');
    handleFiles(e.dataTransfer && e.dataTransfer.files);
  });

  async function init() {
    renderPhotoGrid();
    if (!token) {
      els.loading.hidden = true;
      els.invalid.hidden = false;
      return;
    }
    try {
      const data = await API.checkContributeToken(token);
      els.loading.hidden = true;
      if (data.valid) {
        els.form.hidden = false;
        els.sender.focus();
      } else {
        els.invalid.hidden = false;
      }
    } catch (err) {
      els.loading.hidden = true;
      els.invalid.hidden = false;
    }
  }

  init();
})();
