/**
 * Thin fetch wrapper around /api/* plus the client-side image downscale
 * (ported from the old ImageSlot canvas technique) so uploads stay under
 * the serverless body limit without needing a bundler / Blob SDK on the
 * client. The unlock token is cached in localStorage and sent as a Bearer
 * token on every request that needs it.
 */
(function () {
  'use strict';

  const { TOKEN_KEY, MAX_IMAGE_DIMENSION, MAX_UPLOAD_BYTES } = window.SLUUBUT_DATA;

  // ---- token -------------------------------------------------------------
  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || null;
    } catch (err) {
      return null;
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (err) {
      /* storage disabled */
    }
  }

  function clearToken() {
    setToken(null);
  }

  // ---- request helper ------------------------------------------------------
  class ApiError extends Error {
    constructor(status, code) {
      super(code || 'request_failed');
      this.status = status;
      this.code = code;
    }
  }

  async function request(path, { method = 'GET', body, auth = false } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
    }

    let res;
    try {
      res = await fetch(path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (err) {
      throw new ApiError(0, 'network_error');
    }

    let json = null;
    try {
      json = await res.json();
    } catch (err) {
      /* empty/invalid body */
    }

    if (res.status === 401) clearToken();

    if (!res.ok || !json || json.success !== true) {
      throw new ApiError(res.status, (json && json.error) || 'request_failed');
    }
    return json.data;
  }

  // ---- entries -------------------------------------------------------------
  function fetchEntries() {
    return request('/api/entries', { auth: true });
  }

  function createEntry(data) {
    return request('/api/entries', { method: 'POST', body: data, auth: true });
  }

  function updateEntry(id, data) {
    return request('/api/entries/' + encodeURIComponent(id), { method: 'PATCH', body: data, auth: true });
  }

  function deleteEntry(id) {
    return request('/api/entries/' + encodeURIComponent(id), { method: 'DELETE', auth: true });
  }

  // ---- auth ------------------------------------------------------------
  async function unlock(password) {
    const data = await request('/api/unlock', { method: 'POST', body: { password } });
    setToken(data.token);
    return data;
  }

  function changePassword(currentPassword, newPassword) {
    return request('/api/password', { method: 'POST', body: { currentPassword, newPassword }, auth: true });
  }

  function lock() {
    clearToken();
  }

  function isUnlockedLocally() {
    return !!getToken();
  }

  // ---- date formatting -------------------------------------------------
  // The API speaks ISO (`yyyy-mm-dd`, matching <input type="date">); the
  // book's date-stamp badge shows `mm-dd-yy` per the design.
  function isoToMmDdYy(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('-');
    if (!y || !m || !d) return '';
    return `${m}-${d}-${y.slice(2)}`;
  }

  // ---- image downscale + upload --------------------------------------------
  function readFileAsImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read_failed'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('decode_failed'));
        img.onload = () => resolve(img);
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function downscale(img, maxDim) {
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  function dataUrlByteLength(dataUrl) {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return Math.ceil((base64.length * 3) / 4);
  }

  /** Downscales an image file client-side, uploads it, returns `{url, pathname}`. */
  async function uploadImage(file) {
    if (!file || !/^image\//.test(file.type)) {
      throw new ApiError(400, 'not_an_image');
    }
    const img = await readFileAsImage(file);
    let dataUrl = downscale(img, MAX_IMAGE_DIMENSION);
    if (dataUrlByteLength(dataUrl) > MAX_UPLOAD_BYTES) {
      // one more pass at half the size if still too large after the first downscale
      dataUrl = downscale(img, Math.round(MAX_IMAGE_DIMENSION / 2));
    }
    return request('/api/upload', { method: 'POST', body: { image: dataUrl }, auth: true });
  }

  window.SLUUBUT_API = {
    ApiError,
    getToken,
    clearToken,
    isUnlockedLocally,
    fetchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    unlock,
    lock,
    changePassword,
    uploadImage,
    isoToMmDdYy
  };
})();
