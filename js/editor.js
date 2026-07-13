/**
 * Add/edit modal for a single message — sender, date, text, privacy toggle,
 * and a 5-slot photo uploader (browse/drag → client-side downscale →
 * upload → thumbnail; reorder with ‹ › and remove with ×).
 *
 * Only ever opened when the caller has confirmed `state.unlocked` — the
 * server independently re-checks the token on every write, so this modal
 * is a convenience UI, not a security boundary.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const API = window.SLUUBUT_API;
  const { MAX_IMAGES } = window.SLUUBUT_DATA;

  let ready = false;
  let els = {};
  let currentEntry = null; // null => "add" mode
  let photos = []; // [{ url, pathname, position }]
  let uploadingCount = 0;
  let callbacks = null;

  function init() {
    if (ready) return;
    els = {
      scrim: $('editor-scrim'),
      title: $('editor-title'),
      sender: $('editor-sender'),
      date: $('editor-date'),
      message: $('editor-message'),
      isPrivate: $('editor-private'),
      grid: $('editor-photo-grid'),
      fileInput: $('editor-photo-input'),
      status: $('editor-photo-status'),
      error: $('editor-error'),
      cancel: $('editor-cancel'),
      delete: $('editor-delete'),
      save: $('editor-save')
    };
    if (!els.scrim) return;

    els.cancel.addEventListener('click', close);
    els.scrim.addEventListener('click', (e) => {
      if (e.target === els.scrim) close();
    });
    els.save.addEventListener('click', save);
    els.delete.addEventListener('click', removeEntry);
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
    document.addEventListener('keydown', (e) => {
      if (els.scrim.hidden) return;
      if (e.key === 'Escape') close();
    });

    ready = true;
  }

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
        const uploaded = await API.uploadImage(file);
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

  function open(entry, cb) {
    init();
    if (!els.scrim) return;
    currentEntry = entry || null;
    callbacks = cb || {};
    photos = entry && entry.images ? entry.images.map((img, i) => ({ url: img.url, pathname: img.pathname, position: i })) : [];

    els.title.textContent = entry ? 'Sửa lời nhắn' : 'Thêm lời nhắn ✍️';
    els.sender.value = entry ? entry.sender : '';
    els.date.value = entry && entry.date ? entry.date : '';
    els.message.value = entry ? entry.message : '';
    els.isPrivate.checked = entry ? !!entry.isPrivate : false;
    els.delete.hidden = !entry;
    setError('');
    setStatus('');
    renderPhotoGrid();

    els.scrim.hidden = false;
    setTimeout(() => els.sender.focus(), 0);
  }

  function close() {
    if (!els.scrim) return;
    els.scrim.hidden = true;
    currentEntry = null;
    callbacks = null;
    photos = [];
  }

  async function save() {
    const sender = els.sender.value.trim();
    const message = els.message.value.trim();
    if (!sender) return setError('Cần điền tên người gửi.');
    if (!message) return setError('Cần viết lời nhắn.');
    if (uploadingCount > 0) return setError('Đợi ảnh tải xong nhé.');

    const payload = {
      sender,
      message,
      isPrivate: !!els.isPrivate.checked,
      images: photos.map((p, i) => ({ url: p.url, pathname: p.pathname, position: i }))
    };
    if (els.date.value) payload.date = API.isoToMmDdYy(els.date.value);

    els.save.disabled = true;
    setError('');
    try {
      const result = currentEntry
        ? await API.updateEntry(currentEntry.id, payload)
        : await API.createEntry(payload);
      const savedEntry = result.entry;
      const cb = callbacks;
      close();
      if (cb && cb.onSave) cb.onSave(savedEntry, !currentEntry);
    } catch (err) {
      setError('Không lưu được — thử lại nhé.');
    } finally {
      els.save.disabled = false;
    }
  }

  async function removeEntry() {
    if (!currentEntry) return;
    if (!window.confirm('Xóa lời nhắn này? Không thể hoàn tác.')) return;
    const id = currentEntry.id;
    try {
      await API.deleteEntry(id);
      const cb = callbacks;
      close();
      if (cb && cb.onDelete) cb.onDelete(id);
    } catch (err) {
      setError('Không xóa được — thử lại nhé.');
    }
  }

  window.Editor = { open, close };
})();
