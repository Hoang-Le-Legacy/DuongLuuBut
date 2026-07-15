/**
 * Sổ Lưu Bút — Dương "Domino" — application logic.
 *
 * Same surgical-DOM-update engine as the original static build (single
 * persistent DOM tree, `setState`/`render()`, the page-flip phase machine)
 * — only the data layer changed: entries now live in Neon and are fetched
 * through js/api.js, private entries are filtered server-side, and Dương's
 * one shared password both reveals private messages and unlocks editing.
 */
(function () {
  'use strict';

  const { TAPE_COLORS, PHASE_MS } = window.SLUUBUT_DATA;
  const API = window.SLUUBUT_API;
  const $ = (id) => document.getElementById(id);

  const MODAL_TITLES = {
    unlock: 'Nhập mật khẩu 🔒',
    changePassword: 'Đổi mật khẩu'
  };

  const state = {
    opened: false,
    view: 'wishes',       // 'wishes' | 'entries' — the wishes wall is always the first page
    index: 0,
    turning: false,
    phase: 'idle',       // 'idle' | 'closing' | 'opening'
    direction: 'next',    // 'next' | 'prev'
    entries: [],
    wishes: [],
    unlocked: API.isUnlockedLocally(),
    loading: true,
    modal: null,           // { mode, error } | null
    share: null            // { token, loading, error, copied } | null (dialog closed)
  };

  let dotEls = [];

  function setState(patch) {
    const next = typeof patch === 'function' ? patch(state) : patch;
    Object.assign(state, next);
    render();
  }

  // ---- data loading --------------------------------------------------------
  async function loadEntries({ preserveIndex } = {}) {
    try {
      const data = await API.fetchEntries();
      const entries = data.entries || [];
      const maxIndex = Math.max(entries.length - 1, 0);
      const index = preserveIndex ? Math.min(state.index, maxIndex) : 0;
      rebuildDots(entries);
      setState({ entries, unlocked: !!data.unlocked, loading: false, index });
    } catch (err) {
      setState({ loading: false });
    }
  }

  async function loadWishes() {
    try {
      const data = await API.fetchWishes();
      setState({ wishes: data.wishes || [] });
    } catch (err) {
      setState({ wishes: [] });
    }
  }

  // Dot 0 is always the wishes wall (the permanent first page); dots 1..N
  // map to entries[0..N-1]. `jump()`/render() use this same virtual index.
  function rebuildDots(entries) {
    const container = $('dots');
    container.innerHTML = '';
    const wishesDot = document.createElement('button');
    wishesDot.type = 'button';
    wishesDot.className = 'dot dot--wishes';
    wishesDot.setAttribute('aria-label', 'Trang 1 (lời chúc)');
    wishesDot.addEventListener('click', () => jump(0));
    container.appendChild(wishesDot);

    const entryDots = entries.map((entry, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'dot';
      dot.classList.toggle('dot--locked', !!entry.locked);
      dot.setAttribute('aria-label', entry.locked ? 'Trang ' + (i + 2) + ' (riêng tư)' : 'Trang ' + (i + 2));
      dot.addEventListener('click', () => jump(i + 1));
      container.appendChild(dot);
      return dot;
    });
    dotEls = [wishesDot, ...entryDots];
  }

  // ---- navigation ----------------------------------------------------------
  // The wishes wall is a permanent virtual page 0; entries fill virtual
  // pages 1..entryPageCount (an empty book still reserves one page for the
  // "no messages yet" empty state, mirroring the pre-wishes-wall behavior).
  function getNavInfo(s) {
    const hasEntries = s.entries.length > 0;
    const entryPageCount = hasEntries ? s.entries.length : 1;
    const totalPages = entryPageCount + 1;
    const virtualIndex = s.view === 'wishes' ? 0 : s.index + 1;
    return { hasEntries, totalPages, virtualIndex, isFirst: virtualIndex === 0, isLast: virtualIndex === totalPages - 1 };
  }

  function openBook() { setState({ opened: true }); }

  function next() {
    if (state.turning || getNavInfo(state).isLast) return;
    setState({ turning: true, direction: 'next', phase: 'closing' });
    setTimeout(() => {
      setState((s) => (s.view === 'wishes'
        ? { view: 'entries', index: 0, phase: 'opening' }
        : { index: s.index + 1, phase: 'opening' }));
      setTimeout(() => setState({ turning: false, phase: 'idle' }), PHASE_MS);
    }, PHASE_MS);
  }

  function prev() {
    if (state.turning || getNavInfo(state).isFirst) return;
    setState({ turning: true, direction: 'prev', phase: 'closing' });
    setTimeout(() => {
      setState((s) => (s.view === 'entries' && s.index === 0
        ? { view: 'wishes', phase: 'opening' }
        : { index: s.index - 1, phase: 'opening' }));
      setTimeout(() => setState({ turning: false, phase: 'idle' }), PHASE_MS);
    }, PHASE_MS);
  }

  function jump(virtualIndex) {
    if (state.turning || virtualIndex === getNavInfo(state).virtualIndex) return;
    if (virtualIndex === 0) setState({ view: 'wishes' });
    else setState({ view: 'entries', index: virtualIndex - 1 });
  }

  // ---- password modal (unlock / change password) --------------------------
  function openModal(modal) {
    $('modal-input').value = '';
    $('modal-new-input').value = '';
    setState({ modal });
    setTimeout(() => $('modal-input').focus(), 0);
  }

  const requestUnlock = () => openModal({ mode: 'unlock', error: '' });
  const openChangePassword = () => openModal({ mode: 'changePassword', error: '' });
  const closeModal = () => setState({ modal: null });

  async function submitModal() {
    const m = state.modal;
    if (!m) return;

    if (m.mode === 'unlock') {
      const password = $('modal-input').value;
      try {
        await API.unlock(password);
        setState({ modal: null });
        loadEntries({ preserveIndex: true });
      } catch (err) {
        $('modal-input').value = '';
        setState({ modal: { ...m, error: 'Sai mật khẩu 🙈' } });
      }
      return;
    }

    if (m.mode === 'changePassword') {
      const current = $('modal-input').value;
      const nw = $('modal-new-input').value;
      if (!nw || nw.length < 4) {
        setState({ modal: { ...m, error: 'Mật khẩu mới cần ít nhất 4 ký tự' } });
        return;
      }
      try {
        await API.changePassword(current, nw);
        setState({ modal: null });
      } catch (err) {
        setState({ modal: { ...m, error: 'Mật khẩu hiện tại không đúng' } });
      }
    }
  }

  function lockAgain() {
    API.lock();
    setState({ unlocked: false });
    loadEntries({ preserveIndex: true });
  }

  // ---- share dialog (contribute link management) --------------------------
  async function openShare() {
    setState({ share: { token: null, loading: true, error: '', copied: false } });
    try {
      const data = await API.getContributeLink();
      setState((s) => ({ share: { ...s.share, token: data.token, loading: false } }));
    } catch (err) {
      setState((s) => ({ share: { ...s.share, loading: false, error: 'Không tải được liên kết — thử lại nhé.' } }));
    }
  }

  const closeShare = () => setState({ share: null });

  async function createOrRegenerateLink() {
    setState((s) => ({ share: { ...s.share, loading: true, error: '', copied: false } }));
    try {
      const data = await API.createContributeLink();
      setState((s) => ({ share: { ...s.share, token: data.token, loading: false } }));
    } catch (err) {
      setState((s) => ({ share: { ...s.share, loading: false, error: 'Không tạo được liên kết — thử lại nhé.' } }));
    }
  }

  async function revokeLink() {
    if (!window.confirm('Thu hồi liên kết? Liên kết đang chia sẻ sẽ không dùng được nữa.')) return;
    setState((s) => ({ share: { ...s.share, loading: true, error: '', copied: false } }));
    try {
      await API.revokeContributeLink();
      setState((s) => ({ share: { ...s.share, token: null, loading: false } }));
    } catch (err) {
      setState((s) => ({ share: { ...s.share, loading: false, error: 'Không thu hồi được — thử lại nhé.' } }));
    }
  }

  function contributeUrl(token) {
    return window.location.origin + '/contribute?t=' + token;
  }

  async function copyLink() {
    const url = $('share-url').value;
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      $('share-url').select();
      document.execCommand('copy');
    }
    setState((s) => ({ share: { ...s.share, copied: true } }));
  }

  // ---- edit mode: add / edit / delete --------------------------------------
  function openAddEntry() {
    window.Editor.open(null, {
      onSave: () => loadEntries({ preserveIndex: true })
    });
  }

  function openEditCurrentEntry() {
    const entry = state.entries[state.index];
    if (!entry) return;
    window.Editor.open(entry, {
      onSave: () => loadEntries({ preserveIndex: true }),
      onDelete: () => loadEntries({ preserveIndex: true })
    });
  }

  async function deleteCurrentEntry() {
    const entry = state.entries[state.index];
    if (!entry) return;
    if (!window.confirm('Xóa lời nhắn này? Không thể hoàn tác.')) return;
    try {
      await API.deleteEntry(entry.id);
      loadEntries({ preserveIndex: true });
    } catch (err) {
      window.alert('Không xóa được — thử lại nhé.');
    }
  }

  // ---- photo strip / lightbox ----------------------------------------------
  function renderPhotoStrip(images) {
    const strip = $('photo-strip');
    strip.innerHTML = '';
    strip.hidden = images.length === 0;
    images.forEach((img, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb';
      btn.setAttribute('aria-label', 'Xem ảnh ' + (i + 1));
      const thumbImg = document.createElement('img');
      thumbImg.src = img.url;
      thumbImg.alt = '';
      btn.appendChild(thumbImg);
      btn.addEventListener('click', () => window.Lightbox.open(images, i));
      strip.appendChild(btn);
    });
  }

  // ---- wishes wall (short, always-public farewell wishes) -------------------
  function renderWishesWall(wishes) {
    const wall = $('wishes-wall');
    wall.innerHTML = '';
    $('wishes-empty').hidden = wishes.length > 0;
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

      wall.appendChild(card);
    });
  }

  // ---- render ---------------------------------------------------------------
  function render() {
    const { opened, view, index, phase, direction, entries, wishes, modal, unlocked, loading } = state;
    const { hasEntries, totalPages, virtualIndex, isFirst, isLast } = getNavInfo(state);
    const entry = view === 'entries' && hasEntries ? entries[index] : null;

    // Cover + book visibility
    $('cover-flip').style.transform = opened ? 'rotateY(-155deg)' : 'rotateY(0deg)';
    $('cover-wrap').style.pointerEvents = opened ? 'none' : 'auto';
    const book = $('book');
    book.style.opacity = opened ? '1' : '0';
    book.style.pointerEvents = opened ? 'auto' : 'none';

    // Left page
    $('page-label').textContent = String(virtualIndex + 1);
    $('total-label').textContent = String(totalPages);
    dotEls.forEach((dot, i) => {
      dot.style.background = i === virtualIndex ? 'oklch(48% 0.1 28)' : 'oklch(75% 0.03 50)';
    });

    // Edit-mode admin controls
    $('gear').hidden = !unlocked;
    $('btn-unlock').hidden = unlocked;
    $('btn-add').hidden = !unlocked;
    $('btn-share').hidden = !unlocked;
    $('btn-lock').hidden = !unlocked;

    // Right leaf — flip mechanics
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

    const leaf = $('leaf');
    leaf.style.transform = transform;
    leaf.style.transition = transition;
    leaf.style.boxShadow = pageShadow;
    $('leaf-shadow').style.opacity = String(shadowOpacity);
    const underShadow = $('under-shadow');
    underShadow.style.opacity = String(underShadowOpacity);
    underShadow.style.transition = transition;

    // Right leaf — wishes wall (permanent first page) vs. entries content
    $('wishes-page').hidden = view !== 'wishes';
    if (view === 'wishes') renderWishesWall(wishes);

    $('empty-state').hidden = view !== 'entries' || hasEntries || loading;
    $('empty-state-add').hidden = !unlocked;
    $('leaf-content').hidden = view !== 'entries' || !hasEntries;

    if (view === 'entries' && hasEntries) {
      $('tape').style.background = TAPE_COLORS[index % TAPE_COLORS.length];

      const dateStamp = $('date-stamp');
      dateStamp.hidden = !entry.date;
      if (entry.date) dateStamp.textContent = API.isoToMmDdYy(entry.date);

      const pill = $('privacy-pill');
      pill.textContent = entry.isPrivate ? '🔒 Riêng tư' : '🌍 Công khai';
      pill.classList.toggle('is-private', entry.isPrivate);
      pill.classList.toggle('is-public', !entry.isPrivate);

      $('contributed-pill').hidden = !(unlocked && entry.contributed);

      const locked = !!entry.locked;
      $('message-block').classList.toggle('is-locked', locked);
      $('message-name').hidden = locked;
      if (locked) {
        $('message-text').textContent = 'Riêng tư — chỉ Dương mới đọc được lời nhắn này. Tò mò dữ hen 👀';
      } else {
        $('message-text').textContent = entry.message;
        $('message-name').textContent = '— ' + entry.sender;
      }

      renderPhotoStrip(entry.images || []);

      $('entry-controls').hidden = !unlocked;
    }

    // Nav buttons
    $('btn-prev').disabled = isFirst;
    $('btn-next').disabled = isLast;

    // Password modal
    $('modal-scrim').hidden = !modal;
    if (modal) {
      $('modal-title').textContent = MODAL_TITLES[modal.mode] || '';
      $('modal-new-row').hidden = modal.mode !== 'changePassword';
      $('modal-input').placeholder = modal.mode === 'changePassword' ? 'Mật khẩu hiện tại' : 'Mật khẩu';
      const err = $('modal-error');
      err.hidden = !modal.error;
      err.textContent = modal.error || '';
    }

    // Share dialog (contribute link)
    const share = state.share;
    $('share-scrim').hidden = !share;
    if (share) {
      const hasToken = !!share.token;
      $('share-row').hidden = !hasToken;
      $('share-empty').hidden = hasToken;
      if (hasToken) $('share-url').value = contributeUrl(share.token);
      $('share-copied').hidden = !share.copied || !hasToken;
      $('share-create').hidden = hasToken;
      $('share-regenerate').hidden = !hasToken;
      $('share-revoke').hidden = !hasToken;
      const btnsDisabled = !!share.loading;
      ['share-create', 'share-regenerate', 'share-revoke', 'share-copy'].forEach((id) => {
        $(id).disabled = btnsDisabled;
      });
      const err = $('share-error');
      err.hidden = !share.error;
      err.textContent = share.error || '';
    }
  }

  // ---- wire up static controls ----------------------------------------------
  $('btn-open').addEventListener('click', openBook);
  $('btn-prev').addEventListener('click', prev);
  $('btn-next').addEventListener('click', next);
  $('gear').addEventListener('click', openChangePassword);
  $('btn-unlock').addEventListener('click', requestUnlock);
  $('btn-lock').addEventListener('click', lockAgain);
  $('btn-add').addEventListener('click', openAddEntry);
  $('empty-state-add').addEventListener('click', openAddEntry);
  $('btn-edit-entry').addEventListener('click', openEditCurrentEntry);
  $('btn-delete-entry').addEventListener('click', deleteCurrentEntry);

  $('btn-share').addEventListener('click', openShare);
  $('share-close').addEventListener('click', closeShare);
  $('share-scrim').addEventListener('click', (e) => { if (e.target === $('share-scrim')) closeShare(); });
  $('share-create').addEventListener('click', createOrRegenerateLink);
  $('share-regenerate').addEventListener('click', createOrRegenerateLink);
  $('share-revoke').addEventListener('click', revokeLink);
  $('share-copy').addEventListener('click', copyLink);

  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-submit').addEventListener('click', submitModal);
  $('modal-scrim').addEventListener('click', (e) => { if (e.target === $('modal-scrim')) closeModal(); });

  ['modal-input', 'modal-new-input'].forEach((id) => {
    $(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitModal(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (state.share && e.key === 'Escape') { closeShare(); return; }
    const editorScrim = $('editor-scrim');
    const editorOpen = editorScrim && !editorScrim.hidden;
    if (!state.opened || state.modal || state.share || editorOpen) return;
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  });

  render();
  loadEntries();
  loadWishes();
})();
