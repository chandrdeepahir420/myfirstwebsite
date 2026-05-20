let isLoggedIn = false;
let currentFolderId = 'root';
let folderStack = []; 
let isGridView = true;
let ctxTarget = null; 
let allFiles = []; 
let selectedIds = new Set();
let isDark = true;
let inactiveTimer = null;
let toastCountdown = null;
const INACTIVE_LIMIT = 30 * 60 * 1000; // 30 mins
const WARN_BEFORE = 60 * 1000; // 60 seconds warning

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('td_theme') || 'dark';
  applyTheme(saved);

  if (sessionStorage.getItem('td_auth') === 'true') {
    isLoggedIn = true;
    showDrive();
  } else {
    hideLoader();
    showLogin();
  }

  setupOTPBoxes();

  // Next input logic via Enter key
  document.getElementById('usernameInput').addEventListener('keydown', e => { 
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('passwordInput').focus(); } 
  });
  document.getElementById('passwordInput').addEventListener('keydown', e => { 
      if (e.key === 'Enter') { e.preventDefault(); requestOTP(); } 
  });

  document.addEventListener('click', () => document.getElementById('contextMenu').classList.remove('show'));
});

function hideLoader() {
  const ls = document.getElementById('loadingScreen');
  if (ls) ls.classList.add('hide');
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
}

function showDrive() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('driveContent').style.display = 'flex';
  hideLoader();
  loadCurrentFolder();
  startInactivityTimer();

  ['mousemove', 'touchstart', 'keydown', 'click'].forEach(evt => {
      document.addEventListener(evt, resetInactivity);
  });
}

function toggleTheme() {
  isDark = !isDark;
  const t = isDark ? 'dark' : 'light';
  applyTheme(t);
  localStorage.setItem('td_theme', t);
}

function applyTheme(t) {
  isDark = t === 'dark';
  document.body.className = t;
  ['themeIconLogin', 'themeIconSidebar', 'themeBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = isDark ? '🌙' : '☀️';
  });
}

function togglePass() {
  const inp = document.getElementById('passwordInput');
  const icon = document.getElementById('eyeIcon');
  if(inp.type === 'password') {
      inp.type = 'text';
      icon.className = 'fa-solid fa-eye-slash';
  } else {
      inp.type = 'password';
      icon.className = 'fa-solid fa-eye';
  }
}

function setupOTPBoxes() {
  const boxes = document.querySelectorAll('.otp-box');
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '');
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      if (getOTPValue().length === 6) verifyOTP();
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !box.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; }
    });
  });
}

function getOTPValue() { 
    return Array.from(document.querySelectorAll('.otp-box')).map(b => b.value).join(''); 
}

async function requestOTP() {
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value.trim();
  const errEl = document.getElementById('loginError');
  if (!username || !password) return;

  const btn = document.getElementById('loginBtn');
  btn.innerText = 'Sending OTP...';
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
      document.querySelector('.otp-box').focus();
    } else { errEl.textContent = data.message || 'Verification Error'; shakeCard(); }
  } catch { errEl.textContent = 'Server network unreachable.'; shakeCard(); }
  finally { btn.innerText = 'Continue'; }
}

async function verifyOTP() {
  const code = getOTPValue();
  const errEl = document.getElementById('otpError');
  if (code.length !== 6) return;

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
    } else { errEl.textContent = data.message || 'Invalid OTP token.'; shakeCard(); }
  } catch { errEl.textContent = 'Server authentication failed.'; }
}

function backToStep1() {
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step1').style.display = 'block';
}

function shakeCard() {
  const card = document.querySelector('.login-card');
  card.classList.add('shake');
  setTimeout(() => card.classList.remove('shake'), 400);
}

function logout() {
  sessionStorage.removeItem('td_auth');
  window.location.reload();
}

function startInactivityTimer() {
  clearTimeout(inactiveTimer);
  inactiveTimer = setTimeout(() => {
    let secs = 60;
    const toast = document.getElementById('inactiveToast');
    const timerSpan = document.getElementById('toastTimer');
    toast.style.display = 'flex';
    timerSpan.textContent = secs;
    
    toastCountdown = setInterval(() => {
      secs--;
      timerSpan.textContent = secs;
      if (secs <= 0) { logout(); }
    }, 1000);
  }, INACTIVE_LIMIT - WARN_BEFORE);
}

function resetInactivity() {
  const toast = document.getElementById('inactiveToast');
  if (toast) toast.style.display = 'none';
  clearInterval(toastCountdown);
  startInactivityTimer();
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const sbo = document.getElementById('sidebarOverlay');
  sb.classList.toggle('open');
  sbo.classList.toggle('show');
}

function navigateTo(folderId, folderName) {
  clearSelection();
  if (folderId === 'root') { currentFolderId = 'root'; folderStack = []; } 
  else {
    const idx = folderStack.findIndex(f => f.id === folderId);
    if (idx !== -1) folderStack = folderStack.slice(0, idx + 1);
    else folderStack.push({ id: folderId, name: folderName });
    currentFolderId = folderId;
  }
  updateBreadcrumb(); 
  loadCurrentFolder();
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

function updateBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  let html = `<span onclick="navigateTo('root')">My Drive</span>`;
  folderStack.forEach((f, i) => {
    html += `<span class="breadcrumb-sep"> › </span>`;
    if (i === folderStack.length - 1) html += `<span>${f.name}</span>`;
    else html += `<span onclick="navigateTo('${f.id}','${f.name}')">${f.name}</span>`;
  });
  el.innerHTML = html;
}

async function loadCurrentFolder() {
  try {
    const [fr, flr] = await Promise.all([
      fetch(`/files?folderId=${currentFolderId}`),
      fetch(`/folders?parentId=${currentFolderId}`)
    ]);
    renderItems(await flr.json(), await fr.json());
  } catch (err) { console.error('Directory sync failed:', err); }
}

function renderItems(folders, files) {
  const listEl = document.getElementById('fileList');
  const emptyEl = document.getElementById('emptyState');
  listEl.className = `file-grid${isGridView ? '' : ' list-view'}`;
  listEl.innerHTML = '';

  if (folders.length === 0 && files.length === 0) { emptyEl.style.display = 'flex'; return; }
  emptyEl.style.display = 'none';

  if (folders.length > 0) {
    addSectionLabel(listEl, 'Folders');
    folders.forEach(f => listEl.appendChild(makeFolderCard(f)));
  }
  if (files.length > 0) {
    addSectionLabel(listEl, 'Files');
    files.forEach(f => listEl.appendChild(makeFileCard(f)));
  }
}

function addSectionLabel(parent, text) {
  const d = document.createElement('div'); d.className = 'section-label'; d.textContent = text;
  parent.appendChild(d);
}

function makeFolderCard(folder) {
  const div = document.createElement('div');
  div.className = `folder-card ${selectedIds.has(folder._id) ? 'selected' : ''}`; 
  div.dataset.id = folder._id; div.dataset.type = 'folder';
  div.innerHTML = `
    <div class="select-check">✓</div>
    <div class="folder-name"><i class="fa-solid fa-folder text-amber-500 mr-1.5"></i> ${folder.name}</div>
    <button class="folder-delete" onclick="deleteFolder(event,'${folder._id}')"><i class="fa-solid fa-trash-can"></i></button>`;
    
  div.addEventListener('click', e => {
    if (e.target.closest('.folder-delete')) return;
    if (selectedIds.size > 0) { toggleSelect(folder._id, div); return; }
    navigateTo(folder._id, folder.name);
  });
  return div;
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    pdf: 'fa-file-pdf text-red-500', jpg: 'fa-file-image text-green-500', jpeg: 'fa-file-image text-green-500', png: 'fa-file-image text-green-500', gif: 'fa-file-image text-emerald-500', webp: 'fa-file-image text-emerald-500',
    mp4: 'fa-file-video text-blue-500', mov: 'fa-file-video text-blue-500', avi: 'fa-file-video text-blue-500', mkv: 'fa-file-video text-blue-500',
    mp3: 'fa-file-audio text-purple-500', wav: 'fa-file-audio text-purple-500', flac: 'fa-file-audio text-purple-500',
    zip: 'fa-file-zipper text-yellow-600', rar: 'fa-file-zipper text-yellow-600', '7z': 'fa-file-zipper text-yellow-600',
    doc: 'fa-file-word text-blue-600', docx: 'fa-file-word text-blue-600', txt: 'fa-file-lines text-slate-400',
    xls: 'fa-file-excel text-emerald-600', xlsx: 'fa-file-excel text-emerald-600',
    apk: 'fa-android text-lime-500', exe: 'fa-laptop-code text-cyan-500',
  };
  return map[ext] || 'fa-file text-slate-400';
}

function makeFileCard(file) {
  const div = document.createElement('div');
  div.className = `file-card ${selectedIds.has(file._id) ? 'selected' : ''}`; 
  div.dataset.id = file._id; div.dataset.type = 'file';
  div.innerHTML = `
    <div class="select-check">✓</div>
    <div class="file-icon"><i class="fa-solid ${getFileIcon(file.name)}"></i></div>
    <div>
      <div class="file-name" title="${file.name}">${file.name}</div>
      <div class="file-size">${file.size}</div>
    </div>
    <div class="file-actions">
      <a class="btn-dl" href="${file.url}" target="_blank"><i class="fa-solid fa-download"></i></a>
      <button class="btn-del" onclick="deleteFile(event,'${file._id}')"><i class="fa-solid fa-trash"></i></button>
    </div>`;

  div.addEventListener('click', (e) => {
      if(e.target.closest('.file-actions')) return;
      toggleSelect(file._id, div);
  });
  
  div.addEventListener('contextmenu', e => {
      e.preventDefault(); ctxTarget = file;
      const menu = document.getElementById('contextMenu');
      menu.classList.add('show'); menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
  });
  return div;
}

function toggleSelect(id, el) {
  if (selectedIds.has(id)) { selectedIds.delete(id); el.classList.remove('selected'); } 
  else { selectedIds.add(id); el.classList.add('selected'); }
  updateActionBar();
}

function updateActionBar() {
  const bar = document.getElementById('actionBar');
  bar.style.display = selectedIds.size > 0 ? 'flex' : 'none';
  document.getElementById('selectedCount').textContent = `${selectedIds.size} selected`;
}

function clearSelection() {
  selectedIds.clear();
  document.querySelectorAll('.file-card, .folder-card').forEach(el => el.classList.remove('selected'));
  updateActionBar();
}

function selectAll() {
  document.querySelectorAll('.file-card, .folder-card').forEach(el => {
    selectedIds.add(el.dataset.id); el.classList.add('selected');
  });
  updateActionBar();
}

// ⬆️ PARALLEL ACCURATE MULTI-UPLOAD SPEED LOGIC ENGINE
document.getElementById('filePicker').addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const queue = document.getElementById('uploadQueue');
  queue.style.display = 'flex';

  const slots = files.map(file => {
      const el = document.createElement('div'); el.className = 'upload-item';
      el.innerHTML = `
        <div class="upload-item-name">${file.name}</div>
        <div class="upload-item-meta">0%</div>
        <div class="upload-item-speed">Connecting...</div>
        <div class="progress-track"><div class="progress-fill"></div></div>`;
      queue.appendChild(el);
      return {
        el, fill: el.querySelector('.progress-fill'),
        meta: el.querySelector('.upload-item-meta'), speed: el.querySelector('.upload-item-speed')
      };
  });

  await Promise.all(files.map((file, i) => {
      return new Promise(resolve => {
        const formData = new FormData();
        formData.append('myFile', file);
        formData.append('folderId', currentFolderId);

        const xhr = new XMLHttpRequest();
        let startTime = Date.now();

        xhr.upload.addEventListener('progress', e => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 100);
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = e.loaded / elapsed;
          
          slots[i].fill.style.width = pct + '%';
          slots[i].meta.textContent = `${pct}% · ${(e.loaded/(1024*1024)).toFixed(1)}MB / ${(e.total/(1024*1024)).toFixed(1)}MB`;
          slots[i].speed.textContent = `${(speed/(1024*1024)).toFixed(1)} MB/s`;
        });

        xhr.addEventListener('load', () => { slots[i].speed.textContent = '✓ Done'; resolve(); });
        xhr.addEventListener('error', () => { slots[i].speed.textContent = '✗ Failed'; resolve(); });
        xhr.open('POST', '/upload'); xhr.send(formData);
      });
  }));

  setTimeout(() => { queue.style.display = 'none'; queue.innerHTML = ''; loadCurrentFolder(); }, 1000);
});

async function deleteFile(e, id) {
  if(e) e.stopPropagation();
  if (!confirm('File delete kar dein?')) return;
  await fetch(`/files/${id}`, { method: 'DELETE' }); loadCurrentFolder();
}

async function createFolder() {
  const name = prompt('Folder name:');
  if (!name || !name.trim()) return;
  await fetch('/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), parentId: currentFolderId })
  });
  loadCurrentFolder();
}

async function deleteFolder(e, id) {
  if(e) e.stopPropagation();
  if (!confirm('Folder delete kar dein? Files bahar aa jayengi.')) return;
  await fetch(`/folders/${id}`, { method: 'DELETE' }); loadCurrentFolder();
}

function ctxDownload() { if(ctxTarget) window.open(ctxTarget.url, '_blank'); }
function ctxDelete() { if(ctxTarget) fetch(`/files/${ctxTarget._id}`, { method: 'DELETE' }).then(() => loadCurrentFolder()); }

function ctxMove() {
  if (!ctxTarget) return;
  openFolderPicker(async folderId => {
    await fetch(`/files/${ctxTarget._id}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId })
    });
    loadCurrentFolder();
  });
}

async function bulkDelete() {
  if (!confirm('Selected items delete kar dein?')) return;
  for (const id of selectedIds) {
    const el = document.querySelector(`[data-id="${id}"]`);
    if(!el) continue;
    const route = el.dataset.type === 'folder' ? `/folders/${id}` : `/files/${id}`;
    await fetch(route, { method: 'DELETE' });
  }
  clearSelection(); loadCurrentFolder();
}

async function bulkMove() {
  openFolderPicker(async folderId => {
    for (const id of selectedIds) {
      const el = document.querySelector(`[data-id="${id}"]`);
      if(el && el.dataset.type === 'file') {
        await fetch(`/files/${id}/move`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderId })
        });
      }
    }
    clearSelection(); loadCurrentFolder();
  });
}

async function bulkDownload() {
  for (const id of selectedIds) {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el && el.dataset.type === 'file') {
      const link = el.querySelector('.btn-dl');
      if (link) window.open(link.href, '_blank');
    }
  }
}

async function openFolderPicker(callback) {
  const res = await fetch('/folders?parentId=root');
  const folders = await res.json();
  const listEl = document.getElementById('folderPickerList');
  listEl.innerHTML = '<div class="modal-folder-item">📁 My Drive (root)</div>';
  
  listEl.firstChild.onclick = () => { document.getElementById('moveModal').style.display='none'; callback('root'); };
  
  folders.forEach(f => {
    const item = document.createElement('div'); item.className = 'modal-folder-item'; item.textContent = `📁 ${f.name}`;
    item.onclick = () => { document.getElementById('moveModal').style.display='none'; callback(f._id); };
    listEl.appendChild(item);
  });
  document.getElementById('moveModal').style.display = 'flex';
}

function toggleView() { isGridView = !isGridView; loadCurrentFolder(); }
function showSearch() { document.getElementById('searchRow').style.display = 'block'; }
function hideSearch() { document.getElementById('searchRow').style.display = 'none'; loadCurrentFolder(); }

async function searchFiles() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if(!q) { loadCurrentFolder(); return; }
  const res = await fetch('/files/all');
  const files = await res.json();
  renderItems([], files.filter(f => f.name.toLowerCase().includes(q)));
}

function closeMoveModal(e) { if (e.target === document.getElementById('moveModal')) document.getElementById('moveModal').style.display = 'none'; }
