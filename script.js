let isLoggedIn = false;
let currentFolderId = 'root';
let folderStack = []; 
let isGridView = true;
let ctxTarget = null; 
let allFiles = []; 
let selectedIds = new Set();
let isDark = true;
let currentView = 'drive'; 

window.addEventListener('DOMContentLoaded', () => {
  applyTheme(localStorage.getItem('td_theme') || 'dark');
  if (sessionStorage.getItem('td_auth') === 'true') { isLoggedIn = true; showDrive(); } 
  else { hideLoader(); showLogin(); }
  setupOTPBoxes();
  document.addEventListener('click', () => document.getElementById('contextMenu').classList.remove('show'));
});

function hideLoader() { const ls = document.getElementById('loadingScreen'); if (ls) ls.classList.add('hide'); }
function showLogin() { document.getElementById('loginScreen').style.display = 'flex'; }
function showDrive() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('driveContent').style.display = 'flex';
  hideLoader(); switchView('drive');
}
function toggleTheme() { isDark = !isDark; const t = isDark ? 'dark' : 'light'; applyTheme(t); localStorage.setItem('td_theme', t); }
function applyTheme(t) {
  isDark = t === 'dark'; document.body.className = t;
  ['themeIconLogin', 'themeIconSidebar', 'themeBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = isDark ? '🌙' : '☀️'; });
}
function togglePass() {
  const inp = document.getElementById('passwordInput'), icon = document.getElementById('eyeIcon');
  if(inp.type === 'password') { inp.type = 'text'; icon.className = 'fa-solid fa-eye-slash'; } 
  else { inp.type = 'password'; icon.className = 'fa-solid fa-eye'; }
}
function setupOTPBoxes() {
  const boxes = document.querySelectorAll('.otp-box');
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '');
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      if (Array.from(boxes).map(b => b.value).join('').length === 6) verifyOTP();
    });
    box.addEventListener('keydown', e => { if (e.key === 'Backspace' && !box.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; } });
  });
}

async function requestOTP() {
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value.trim();
  if (!username || !password) return;
  const btn = document.getElementById('loginBtn'); btn.innerText = 'Sending OTP...';
  try {
    const res = await fetch('/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    if (res.ok) { document.getElementById('step1').style.display = 'none'; document.getElementById('step2').style.display = 'block'; } 
    else { document.getElementById('loginError').textContent = 'Error'; }
  } catch { document.getElementById('loginError').textContent = 'Network error.'; }
  finally { btn.innerHTML = '<span>Continue</span><i class="fa-solid fa-arrow-right"></i>'; }
}
async function verifyOTP() {
  const code = Array.from(document.querySelectorAll('.otp-box')).map(b => b.value).join('');
  if (code.length !== 6) return;
  try {
    const res = await fetch('/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    if (res.ok) { sessionStorage.setItem('td_auth', 'true'); isLoggedIn = true; showDrive(); } 
    else { document.getElementById('otpError').textContent = 'Invalid OTP.'; }
  } catch {}
}
function backToStep1() { document.getElementById('step2').style.display = 'none'; document.getElementById('step1').style.display = 'block'; }
function logout() { sessionStorage.removeItem('td_auth'); window.location.reload(); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebarOverlay').classList.toggle('show'); }

function switchView(view) {
    currentView = view;
    clearSelection();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    if(view === 'drive') {
        document.getElementById('navDrive').classList.add('active');
        document.getElementById('mainToolbar').style.display = 'flex';
        navigateTo('root', 'My Drive');
    } else if(view === 'trash') {
        document.getElementById('navTrash').classList.add('active');
        document.getElementById('mainToolbar').style.display = 'none';
        document.getElementById('breadcrumb').innerHTML = '<span>Trash Bin (Items auto-delete in 30 days)</span>';
        loadTrash();
    }
}

function navigateTo(folderId, folderName) {
  if(currentView !== 'drive') return;
  clearSelection();
  if (folderId === 'root') { currentFolderId = 'root'; folderStack = []; } 
  else {
    const idx = folderStack.findIndex(f => f.id === folderId);
    if (idx !== -1) folderStack = folderStack.slice(0, idx + 1);
    else folderStack.push({ id: folderId, name: folderName });
    currentFolderId = folderId;
  }
  let html = `<span onclick="navigateTo('root')">My Drive</span>`;
  folderStack.forEach((f, i) => {
    html += `<span class="breadcrumb-sep"> › </span>`;
    if (i === folderStack.length - 1) html += `<span>${f.name}</span>`;
    else html += `<span onclick="navigateTo('${f.id}','${f.name}')">${f.name}</span>`;
  });
  document.getElementById('breadcrumb').innerHTML = html;
  loadCurrentFolder();
  document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('show');
}

async function loadCurrentFolder() {
  if(currentView !== 'drive') return;
  try {
    const [fr, flr] = await Promise.all([ fetch(`/files?folderId=${currentFolderId}`), fetch(`/folders?parentId=${currentFolderId}`) ]);
    renderItems(await flr.json(), await fr.json());
  } catch (err) {}
}

async function loadTrash() {
    try {
        const res = await fetch('/trash');
        const data = await res.json();
        renderItems(data.folders, data.files, true);
    } catch (err) {}
}

function renderItems(folders, files, isTrash = false) {
  const listEl = document.getElementById('fileList'), emptyEl = document.getElementById('emptyState');
  listEl.className = `file-grid${isGridView ? '' : ' list-view'}`; listEl.innerHTML = '';

  if (folders.length === 0 && files.length === 0) { 
      emptyEl.style.display = 'flex'; 
      document.getElementById('emptyIcon').className = isTrash ? 'fa-solid fa-trash-can text-5xl' : 'fa-solid fa-folder-open text-5xl text-slate-500';
      document.getElementById('emptyTitle').innerText = isTrash ? 'Trash is empty' : 'No files here';
      document.getElementById('emptyDesc').innerText = isTrash ? 'Deleted items will appear here.' : 'Upload files or create a folder';
      return; 
  }
  emptyEl.style.display = 'none';

  if (folders.length > 0) {
    const d = document.createElement('div'); d.className = 'section-label'; d.textContent = 'Folders'; listEl.appendChild(d);
    folders.forEach(f => listEl.appendChild(makeFolderCard(f, isTrash)));
  }
  if (files.length > 0) {
    const d = document.createElement('div'); d.className = 'section-label'; d.textContent = 'Files'; listEl.appendChild(d);
    files.forEach(f => listEl.appendChild(makeFileCard(f, isTrash)));
  }
}

function customConfirm(title, desc, confirmText, callback) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmDesc').innerText = desc;
    const yesBtn = document.getElementById('confirmYesBtn');
    yesBtn.innerText = confirmText;
    modal.style.display = 'flex';
    yesBtn.onclick = () => { modal.style.display = 'none'; callback(); };
}

function makeFolderCard(folder, isTrash) {
  const div = document.createElement('div');
  div.className = `folder-card ${selectedIds.has(folder._id) ? 'selected' : ''}`; 
  div.dataset.id = folder._id; div.dataset.type = 'folder';
  div.innerHTML = `<div class="select-check">✓</div><div class="folder-name"><i class="fa-solid fa-folder text-amber-500 mr-1.5"></i> ${folder.name}</div>`;
  div.addEventListener('click', e => {
    if (selectedIds.size > 0) { toggleSelect(folder._id, div); return; }
    if(!isTrash) navigateTo(folder._id, folder.name);
  });
  div.addEventListener('contextmenu', e => { e.preventDefault(); ctxTarget = folder; showContextMenu(e.clientX, e.clientY, 'folder', isTrash); });
  return div;
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = { pdf: 'fa-file-pdf text-red-500', jpg: 'fa-file-image text-green-500', png: 'fa-file-image text-green-500', mp4: 'fa-file-video text-blue-500', mp3: 'fa-file-audio text-purple-500', zip: 'fa-file-zipper text-yellow-600', docx: 'fa-file-word text-blue-600', xlsx: 'fa-file-excel text-emerald-600' };
  return map[ext] || 'fa-file text-slate-400';
}

function makeFileCard(file, isTrash) {
  const div = document.createElement('div');
  div.className = `file-card ${selectedIds.has(file._id) ? 'selected' : ''}`; div.dataset.id = file._id; div.dataset.type = 'file';
  div.innerHTML = `<div class="select-check">✓</div><div class="file-icon"><i class="fa-solid ${getFileIcon(file.name)}"></i></div><div><div class="file-name" title="${file.name}">${file.name}</div><div class="file-size">${file.size}</div></div>`;
  div.addEventListener('click', () => toggleSelect(file._id, div));
  div.addEventListener('contextmenu', e => { e.preventDefault(); ctxTarget = file; showContextMenu(e.clientX, e.clientY, 'file', isTrash); });
  div.addEventListener('dblclick', () => { if(!isTrash) previewFile(file); });
  return div;
}

function showContextMenu(x, y, type, isTrash) {
    const menu = document.getElementById('contextMenu');
    menu.innerHTML = ''; 
    if (isTrash) {
        menu.innerHTML += `<button onclick="restoreItem()"><i class="fa-solid fa-trash-arrow-up text-green-500"></i> Restore</button>`;
        menu.innerHTML += `<hr><button class="danger" onclick="permanentDeleteItem()"><i class="fa-solid fa-skull"></i> Delete Forever</button>`;
    } else {
        if(type === 'file') {
            menu.innerHTML += `<button onclick="previewFile(ctxTarget)"><i class="fa-solid fa-eye text-blue-500"></i> Preview File</button>`;
            menu.innerHTML += `<button onclick="window.open(ctxTarget.url, '_blank')"><i class="fa-solid fa-download"></i> Download</button>`;
        }
        menu.innerHTML += `<button onclick="openRenameModal()"><i class="fa-solid fa-pen"></i> Rename</button>`;
        menu.innerHTML += `<button onclick="ctxMove()"><i class="fa-solid fa-arrows-turn-to-dots"></i> Move</button>`;
        menu.innerHTML += `<hr><button class="danger" onclick="trashItem()"><i class="fa-solid fa-trash"></i> Move to Trash</button>`;
    }
    menu.classList.add('show'); menu.style.left = Math.min(x, window.innerWidth - 180) + 'px'; menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
}

function previewFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const images = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const videos = ['mp4', 'webm', 'ogg'];
    const audios = ['mp3', 'wav', 'ogg'];
    const docs = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];

    const contentBox = document.getElementById('previewContent');
    document.getElementById('previewTitle').innerText = file.name;
    
    if(images.includes(ext)) { contentBox.innerHTML = `<img src="${file.url}" class="preview-media">`; } 
    else if(videos.includes(ext)) { contentBox.innerHTML = `<video controls autoplay class="preview-media"><source src="${file.url}"></video>`; } 
    else if(audios.includes(ext)) { contentBox.innerHTML = `<div class="bg-surface2 p-6 rounded-2xl w-full max-w-md text-center"><i class="fa-solid fa-music text-5xl text-purple-500 mb-4"></i><br><audio controls autoplay class="w-full"><source src="${file.url}"></audio></div>`; } 
    else if(docs.includes(ext)) { const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(file.url)}&embedded=true`; contentBox.innerHTML = `<iframe src="${viewerUrl}" class="preview-media bg-white"></iframe>`; } 
    else { contentBox.innerHTML = `<div class="text-center text-white"><i class="fa-solid fa-file-circle-exclamation text-6xl mb-4 text-slate-500"></i><p class="text-lg">Preview not supported for this file type.</p><br><a href="${file.url}" target="_blank" class="btn-primary mt-2 inline-flex w-auto px-6" style="text-decoration:none;">Download Instead</a></div>`; }
    document.getElementById('previewModal').style.display = 'flex';
}

function openRenameModal() {
    if(!ctxTarget) return;
    document.getElementById('renameInput').value = ctxTarget.name;
    document.getElementById('renameModal').style.display = 'flex';
    document.getElementById('renameInput').focus();
}
async function submitRename() {
    const newName = document.getElementById('renameInput').value.trim();
    if(!newName || newName === ctxTarget.name) { document.getElementById('renameModal').style.display = 'none'; return; }
    const route = ctxTarget.url ? `/files/${ctxTarget._id}/rename` : `/folders/${ctxTarget._id}/rename`;
    const type = ctxTarget.url ? 'file' : 'folder';
    await fetch(route, { method: 'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({newName, type}) });
    document.getElementById('renameModal').style.display = 'none';
    currentView === 'drive' ? loadCurrentFolder() : loadTrash();
}

function trashItem() {
    customConfirm('Move to Trash?', 'File will be automatically deleted forever after 30 days.', 'Move to Trash', async () => {
        const route = ctxTarget.url ? `/files/${ctxTarget._id}/trash` : `/folders/${ctxTarget._id}/trash`;
        await fetch(route, { method: 'DELETE' }); loadCurrentFolder();
    });
}
function restoreItem() {
    if(!ctxTarget) return;
    const route = ctxTarget.url ? `/files/${ctxTarget._id}/restore` : `/folders/${ctxTarget._id}/restore`;
    fetch(route, { method: 'PATCH' }).then(() => loadTrash());
}
function permanentDeleteItem() {
    customConfirm('Delete Forever?', 'This file will be completely wiped from Database and Telegram Server. You cannot undo this.', 'Delete Permanently', async () => {
        const route = ctxTarget.url ? `/files/${ctxTarget._id}/permanent` : `/folders/${ctxTarget._id}/permanent`;
        await fetch(route, { method: 'DELETE' }); loadTrash();
    });
}

function toggleSelect(id, el) {
  if (selectedIds.has(id)) { selectedIds.delete(id); el.classList.remove('selected'); } else { selectedIds.add(id); el.classList.add('selected'); }
  updateActionBar();
}
function updateActionBar() {
  const bar = document.getElementById('actionBar');
  bar.style.display = selectedIds.size > 0 ? 'flex' : 'none';
  document.getElementById('selectedCount').textContent = `${selectedIds.size} selected`;
  const tools = document.getElementById('actionBarTools');
  if(currentView === 'trash') {
      tools.innerHTML = `<button class="ab-btn" onclick="bulkRestore()"><i class="fa-solid fa-trash-arrow-up"></i> Restore</button><button class="ab-btn danger" onclick="bulkPermanentDelete()"><i class="fa-solid fa-skull"></i> Delete All</button>`;
  } else {
      tools.innerHTML = `<button class="ab-btn" onclick="bulkDownload()" title="Download"><i class="fa-solid fa-download"></i></button><button class="ab-btn" onclick="bulkMove()" title="Move"><i class="fa-solid fa-folder-tree"></i></button><button class="ab-btn danger" onclick="bulkTrash()" title="Trash"><i class="fa-solid fa-trash"></i></button>`;
  }
}
function clearSelection() { selectedIds.clear(); document.querySelectorAll('.file-card, .folder-card').forEach(el => el.classList.remove('selected')); updateActionBar(); }
function selectAll() { document.querySelectorAll('.file-card, .folder-card').forEach(el => { selectedIds.add(el.dataset.id); el.classList.add('selected'); }); updateActionBar(); }

async function bulkTrash() {
    customConfirm('Trash Selected?', 'Selected items will be moved to trash bin.', 'Yes, Trash them', async () => {
        for (const id of selectedIds) {
            const el = document.querySelector(`[data-id="${id}"]`); if(!el) continue;
            await fetch(el.dataset.type === 'folder' ? `/folders/${id}/trash` : `/files/${id}/trash`, { method: 'DELETE' });
        }
        clearSelection(); loadCurrentFolder();
    });
}
async function bulkRestore() {
    for (const id of selectedIds) {
        const el = document.querySelector(`[data-id="${id}"]`); if(!el) continue;
        await fetch(el.dataset.type === 'folder' ? `/folders/${id}/restore` : `/files/${id}/restore`, { method: 'PATCH' });
    }
    clearSelection(); loadTrash();
}
async function bulkPermanentDelete() {
    customConfirm('Nuclear Delete?', 'All selected items will be destroyed permanently.', 'Destroy', async () => {
        for (const id of selectedIds) {
            const el = document.querySelector(`[data-id="${id}"]`); if(!el) continue;
            await fetch(el.dataset.type === 'folder' ? `/folders/${id}/permanent` : `/files/${id}/permanent`, { method: 'DELETE' });
        }
        clearSelection(); loadTrash();
    });
}
async function bulkDownload() {
  for (const id of selectedIds) {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el && el.dataset.type === 'file') {
      const targetUrl = allFiles.find(f => f._id === id)?.url || '';
      if (targetUrl) window.open(targetUrl, '_blank');
    }
  }
}

document.getElementById('filePicker').addEventListener('change', async e => {
  const files = Array.from(e.target.files); if (!files.length) return;
  const queue = document.getElementById('uploadQueue'); queue.style.display = 'flex';
  const slots = files.map(file => {
      const el = document.createElement('div'); el.className = 'upload-item';
      el.innerHTML = `<div class="upload-item-name">${file.name}</div><div class="upload-item-meta">0%</div><div class="upload-item-speed">Connecting...</div><div class="progress-track"><div class="progress-fill"></div></div>`;
      queue.appendChild(el); return { el, fill: el.querySelector('.progress-fill'), meta: el.querySelector('.upload-item-meta'), speed: el.querySelector('.upload-item-speed') };
  });

  await Promise.all(files.map((file, i) => {
      return new Promise(resolve => {
        const formData = new FormData(); formData.append('myFile', file); formData.append('folderId', currentFolderId);
        const xhr = new XMLHttpRequest(); let startTime = Date.now();

        xhr.upload.addEventListener('progress', e => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 100);
          slots[i].fill.style.width = pct + '%';
          slots[i].meta.textContent = `${pct}% · ${(e.loaded/(1024*1024)).toFixed(1)}MB / ${(e.total/(1024*1024)).toFixed(1)}MB`;
          slots[i].speed.textContent = `${((e.loaded / ((Date.now() - startTime) / 1000))/(1024*1024)).toFixed(1)} MB/s`;
        });
        xhr.addEventListener('load', () => { slots[i].speed.textContent = '✓ Done'; resolve(); });
        xhr.addEventListener('error', () => { slots[i].speed.textContent = '✗ Failed'; resolve(); });
        xhr.open('POST', '/upload'); xhr.send(formData);
      });
  }));
  setTimeout(() => { queue.style.display = 'none'; queue.innerHTML = ''; loadCurrentFolder(); }, 1000);
});

async function createFolder() {
  const name = prompt('Folder name:'); if (!name || !name.trim()) return;
  await fetch('/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), parentId: currentFolderId }) });
  loadCurrentFolder();
}
function toggleView() { isGridView = !isGridView; currentView === 'drive' ? loadCurrentFolder() : loadTrash(); }
function showSearch() { document.getElementById('searchRow').style.display = 'block'; }
function hideSearch() { document.getElementById('searchRow').style.display = 'none'; currentView === 'drive' ? loadCurrentFolder() : loadTrash(); }
async function searchFiles() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if(!q) return currentView === 'drive' ? loadCurrentFolder() : loadTrash();
  const res = await fetch('/files/all');
  allFiles = await res.json();
  renderItems([], allFiles.filter(f => f.name.toLowerCase().includes(q)));
}
function ctxMove() {
  if (!ctxTarget) return;
  openFolderPicker(async folderId => {
    await fetch(ctxTarget.url ? `/files/${ctxTarget._id}/move` : `/folders/${ctxTarget._id}/move`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderId }) });
    currentView === 'drive' ? loadCurrentFolder() : loadTrash();
  });
}
async function openFolderPicker(callback) {
  const folders = await (await fetch('/folders?parentId=root')).json();
  const listEl = document.getElementById('folderPickerList');
  listEl.innerHTML = '<div class="modal-folder-item"><i class="fa-solid fa-house text-blue-500"></i> My Drive (root)</div>';
  listEl.firstChild.onclick = () => { document.getElementById('moveModal').style.display='none'; callback('root'); };
  folders.forEach(f => {
    const item = document.createElement('div'); item.className = 'modal-folder-item'; item.innerHTML = `<i class="fa-solid fa-folder text-amber-500"></i> ${f.name}`;
    item.onclick = () => { document.getElementById('moveModal').style.display='none'; callback(f._id); };
    listEl.appendChild(item);
  });
  document.getElementById('moveModal').style.display = 'flex';
}
