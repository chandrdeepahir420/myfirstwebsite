// ── State ─────────────────────────────────────────────
let isLoggedIn = false;
let currentFolderId = 'root';
let folderStack = []; // breadcrumb stack: [{id, name}]
let isGridView = true;
let ctxTarget = null; // current right-clicked file
let allFiles = []; // for search

// ── Boot ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Check session
  if (sessionStorage.getItem('td_auth') === 'true') {
    isLoggedIn = true;
    showDrive();
  } else {
    hideLoader();
    showLogin();
  }
});

function hideLoader() {
  setTimeout(() => {
    const ls = document.getElementById('loadingScreen');
    ls.classList.add('hide');
    setTimeout(() => ls.remove(), 600);
  }, 800);
}

function showLogin() {
  hideLoader();
  document.getElementById('loginScreen').style.display = 'flex';
}

function showDrive() {
  hideLoader();
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('driveContent').style.display = 'flex';
  loadCurrentFolder();
}

// ── Password Toggle ───────────────────────────────────
function togglePass() {
  const inp = document.getElementById('passwordInput');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ── LOGIN STEP 1: Request OTP ─────────────────────────
async function requestOTP() {
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value.trim();
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  if (!username || !password) {
    errEl.textContent = 'Username aur Password dono bharo!';
    return;
  }

  btn.classList.add('loading');
  btn.querySelector('span').textContent = 'Sending OTP...';
  errEl.textContent = '';

  try {
    const res = await fetch('/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      document.getElementById('step1').style.display = 'none';
      document.getElementById('step2').style.display = 'block';
    } else {
      errEl.textContent = data.message || 'Error!';
      shakeCard();
    }
  } catch (err) {
    errEl.textContent = 'Server se connect nahi ho pa raha!';
    shakeCard();
  } finally {
    btn.classList.remove('loading');
    btn.querySelector('span').textContent = 'Continue';
  }
}

// ── LOGIN STEP 2: Verify OTP ──────────────────────────
async function verifyOTP() {
  const code = document.getElementById('otpInput').value.trim();
  const errEl = document.getElementById('otpError');

  if (!code || code.length !== 6) {
    errEl.textContent = '6-digit OTP enter karo!';
    return;
  }

  errEl.textContent = '';

  try {
    const res = await fetch('/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      sessionStorage.setItem('td_auth', 'true');
      isLoggedIn = true;
      showDrive();
    } else {
      errEl.textContent = data.message || 'Galat OTP!';
      shakeCard();
    }
  } catch (err) {
    errEl.textContent = 'Server error!';
  }
}

function backToStep1() {
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step1').style.display = 'block';
  document.getElementById('otpInput').value = '';
  document.getElementById('otpError').textContent = '';
}

function shakeCard() {
  const card = document.querySelector('.login-card');
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
}

// ── LOGOUT ────────────────────────────────────────────
function logout() {
  sessionStorage.removeItem('td_auth');
  isLoggedIn = false;
  window.location.reload();
}

// ── NAVIGATION ────────────────────────────────────────
function navigateTo(folderId, folderName) {
  if (folderId === 'root') {
    currentFolderId = 'root';
    folderStack = [];
  } else {
    // Check if we're going back to a parent
    const idx = folderStack.findIndex(f => f.id === folderId);
    if (idx !== -1) {
      folderStack = folderStack.slice(0, idx + 1);
    } else {
      folderStack.push({ id: folderId, name: folderName });
    }
    currentFolderId = folderId;
  }
  updateBreadcrumb();
  loadCurrentFolder();
}

function updateBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  let html = `<span onclick="navigateTo('root')">My Drive</span>`;
  folderStack.forEach((f, i) => {
    html += `<span class="breadcrumb-sep"> › </span>`;
    if (i === folderStack.length - 1) {
      html += `<span>${f.name}</span>`;
    } else {
      html += `<span onclick="navigateTo('${f.id}','${f.name}')">${f.name}</span>`;
    }
  });
  el.innerHTML = html;
}

// ── LOAD FOLDER ───────────────────────────────────────
async function loadCurrentFolder() {
  try {
    const [filesRes, foldersRes] = await Promise.all([
      fetch(`/files?folderId=${currentFolderId}`),
      fetch(`/folders?parentId=${currentFolderId}`)
    ]);
    const files = await filesRes.json();
    const folders = await foldersRes.json();
    renderItems(folders, files);
  } catch (err) {
    console.error('Load error:', err);
  }
}

function renderItems(folders, files) {
  const listEl = document.getElementById('fileList');
  const emptyEl = document.getElementById('emptyState');
  listEl.className = `file-grid${isGridView ? '' : ' list-view'}`;
  listEl.innerHTML = '';

  if (folders.length === 0 && files.length === 0) {
    emptyEl.style.display = 'flex';
    return;
  }
  emptyEl.style.display = 'none';

  if (folders.length > 0) {
    const lbl = document.createElement('div');
    lbl.className = 'section-label';
    lbl.textContent = 'Folders';
    lbl.style.gridColumn = '1 / -1';
    listEl.appendChild(lbl);

    folders.forEach(f => listEl.appendChild(makeFolderCard(f)));
  }

  if (files.length > 0) {
    const lbl = document.createElement('div');
    lbl.className = 'section-label';
    lbl.textContent = 'Files';
    lbl.style.gridColumn = '1 / -1';
    listEl.appendChild(lbl);

    files.forEach(f => listEl.appendChild(makeFileCard(f)));
  }
}

function makeFolderCard(folder) {
  const div = document.createElement('div');
  div.className = 'folder-card';
  div.innerHTML = `
    <div class="folder-icon">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="#f6c26b"/></svg>
    </div>
    <div class="folder-name">${folder.name}</div>
    <button class="folder-delete" onclick="deleteFolder(event,'${folder._id}')" title="Delete folder">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
    </button>
  `;
  div.addEventListener('click', () => navigateTo(folder._id, folder.name));
  return div;
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    pdf: '📄', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
    mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬',
    mp3: '🎵', wav: '🎵', flac: '🎵', aac: '🎵',
    zip: '🗜️', rar: '🗜️', '7z': '🗜️',
    doc: '📝', docx: '📝', txt: '📝',
    xls: '📊', xlsx: '📊', csv: '📊',
    ppt: '📋', pptx: '📋',
    apk: '📱', exe: '⚙️',
  };
  return map[ext] || '📁';
}

function makeFileCard(file) {
  const div = document.createElement('div');
  div.className = 'file-card';
  div.innerHTML = `
    <div class="file-icon">${getFileIcon(file.name)}</div>
    <div class="file-info">
      <div class="file-name" title="${file.name}">${file.name}</div>
      <div class="file-size">${file.size}</div>
    </div>
    <div class="file-actions">
      <a class="btn-dl" href="${file.url}" target="_blank" download>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Download
      </a>
      <button class="btn-del" onclick="deleteFile('${file._id}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        Delete
      </button>
    </div>
  `;
  div.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ctxTarget = file;
    showContextMenu(e.clientX, e.clientY);
  });
  return div;
}

// ── UPLOAD ────────────────────────────────────────────
document.getElementById('filePicker').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  e.target.value = '';

  for (const file of files) {
    await uploadFile(file);
  }
});

async function uploadFile(file) {
  const bar = document.getElementById('uploadProgressBar');
  const fillEl = document.getElementById('progressFill');
  const pctEl = document.getElementById('progressPct');
  const nameEl = document.getElementById('uploadFileName');

  bar.style.display = 'block';
  nameEl.textContent = file.name;
  fillEl.style.width = '0%';
  pctEl.textContent = '0%';

  return new Promise((resolve) => {
    const formData = new FormData();
    formData.append('myFile', file);
    formData.append('folderId', currentFolderId);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 90);
        fillEl.style.width = pct + '%';
        pctEl.textContent = pct + '%';
      }
    });

    xhr.addEventListener('load', () => {
      fillEl.style.width = '100%';
      pctEl.textContent = '100%';
      setTimeout(() => {
        bar.style.display = 'none';
        loadCurrentFolder();
        resolve();
      }, 600);
    });

    xhr.addEventListener('error', () => {
      bar.style.display = 'none';
      alert('Upload fail ho gaya!');
      resolve();
    });

    xhr.open('POST', '/upload');
    xhr.send(formData);
  });
}

// ── DELETE FILE ───────────────────────────────────────
async function deleteFile(id) {
  if (!confirm('Is file ko delete karna chahte ho?')) return;
  try {
    await fetch(`/files/${id}`, { method: 'DELETE' });
    loadCurrentFolder();
  } catch (err) { alert('Delete fail!'); }
}

// ── CREATE FOLDER ─────────────────────────────────────
async function createFolder() {
  const name = prompt('Folder ka naam:');
  if (!name || !name.trim()) return;
  try {
    await fetch('/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), parentId: currentFolderId })
    });
    loadCurrentFolder();
  } catch (err) { alert('Folder create fail!'); }
}

// ── DELETE FOLDER ─────────────────────────────────────
async function deleteFolder(e, id) {
  e.stopPropagation();
  if (!confirm('Is folder ko delete karna chahte ho? Iske files root mein aa jayengi.')) return;
  try {
    await fetch(`/folders/${id}`, { method: 'DELETE' });
    loadCurrentFolder();
  } catch (err) { alert('Delete fail!'); }
}

// ── CONTEXT MENU ──────────────────────────────────────
function showContextMenu(x, y) {
  const menu = document.getElementById('contextMenu');
  menu.classList.add('show');
  menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 150) + 'px';
}

document.addEventListener('click', () => {
  document.getElementById('contextMenu').classList.remove('show');
});

function ctxDownload() {
  if (ctxTarget) window.open(ctxTarget.url, '_blank');
}

function ctxDelete() {
  if (ctxTarget) deleteFile(ctxTarget._id);
}

async function ctxMove() {
  if (!ctxTarget) return;
  // Load all folders for picker
  try {
    const res = await fetch('/folders?parentId=root');
    const folders = await res.json();
    const listEl = document.getElementById('folderPickerList');
    listEl.innerHTML = '';

    // Root option
    const rootItem = document.createElement('div');
    rootItem.className = 'modal-folder-item';
    rootItem.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#6c63ff" opacity="0.7"/></svg> My Drive (root)`;
    rootItem.onclick = () => moveFileTo('root');
    listEl.appendChild(rootItem);

    folders.forEach(f => {
      const item = document.createElement('div');
      item.className = 'modal-folder-item';
      item.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#f6c26b"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> ${f.name}`;
      item.onclick = () => moveFileTo(f._id);
      listEl.appendChild(item);
    });

    document.getElementById('moveModal').style.display = 'flex';
  } catch (err) { alert('Error loading folders!'); }
}

async function moveFileTo(folderId) {
  if (!ctxTarget) return;
  document.getElementById('moveModal').style.display = 'none';
  try {
    await fetch(`/files/${ctxTarget._id}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId })
    });
    loadCurrentFolder();
  } catch (err) { alert('Move fail!'); }
}

function closeMoveModal(e) {
  if (e.target === document.getElementById('moveModal')) {
    document.getElementById('moveModal').style.display = 'none';
  }
}

// ── VIEW TOGGLE ───────────────────────────────────────
function toggleView() {
  isGridView = !isGridView;
  loadCurrentFolder();
  const btn = document.getElementById('viewToggle');
  btn.innerHTML = isGridView
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
}

// ── SEARCH ────────────────────────────────────────────
async function showSearch() {
  document.getElementById('searchBox').style.display = 'flex';
  document.getElementById('searchToggle').style.display = 'none';
  document.getElementById('searchInput').focus();
  // Load all files for search
  try {
    const res = await fetch('/files/all');
    allFiles = await res.json();
  } catch (err) {}
}

function hideSearch() {
  document.getElementById('searchBox').style.display = 'none';
  document.getElementById('searchToggle').style.display = 'flex';
  document.getElementById('searchInput').value = '';
  loadCurrentFolder();
}

function searchFiles() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) { loadCurrentFolder(); return; }
  const results = allFiles.filter(f => f.name.toLowerCase().includes(q));
  renderItems([], results);
}
