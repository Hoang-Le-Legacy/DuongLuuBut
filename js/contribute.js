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
  const { MAX_IMAGES } = window.SLUUBUT_DATA;

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
    again: $('contribute-again')
  };

  let photos = []; // [{ url, pathname, position }]
  let uploadingCount = 0;

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
  els.again.addEventListener('click', () => {
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
