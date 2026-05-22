let isLoggedIn = false;
let currentFolderId = 'root';
let folderStack = []; 
let isGridView = false; // Default List View
let ctxTarget = null; 
let allFiles = []; 
let foldersData = [];
let selectedIds = new Set();
let currentView = 'drive'; 

function formatDate(dateString) {
    if(!dateString) return '';
    const d = new Date(dateString);
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear().toString().slice(-2)}`;
}

window.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('td_auth') === 'true') { isLoggedIn = true; showDrive(); } 
  else { document.getElementById('loadingScreen').style.display='none'; document.getElementById('loginScreen').style.display = 'flex'; }
  setupOTPBoxes();
  document.addEventListener('click', () => document.getElementById('contextMenu').classList.remove('show'));

  // ⭐ iOS Swipe to Select Engine
  let isTouchSelecting = false;
  let touchStartEl = null;
  const gridContainer = document.getElementById('fileList');

  gridContainer.addEventListener('touchstart', (e) => {
      const card = e.target.closest('.file-card, .folder-card');
      if (card && !e.target.closest('.select-check')) {
          touchStartEl = card;
          card.dataset.touchTimer = setTimeout(() => {
              isTouchSelecting = true;
              toggleSelect(card.dataset.id, card, true);
              if (navigator.vibrate) navigator.vibrate(50);
          }, 450); // 450ms long press activates swipe select
      }
  }, { passive: true });

  gridContainer.addEventListener('touchmove', (e) => {
      if (touchStartEl) clearTimeout(touchStartEl.dataset.touchTimer);
      if (isTouchSelecting) {
          const touch = e.touches[0];
          const currentEl = document.elementFromPoint(touch.clientX, touch.clientY);
          if (currentEl) {
              const card = currentEl.closest('.file-card, .folder-card');
              if (card && !selectedIds.has(card.dataset.id)) {
                  toggleSelect(card.dataset.id, card, true);
              }
          }
      }
  }, { passive: true });

  gridContainer.addEventListener('touchend', () => {
      if (touchStartEl) clearTimeout(touchStartEl.dataset.touchTimer);
      isTouchSelecting = false; touchStartEl = null;
  });
});

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
function togglePass() {
  const inp = document.getElementById('passwordInput'), icon = document.getElementById('eyeIcon');
  if(inp.type === 'password') { inp.type = 'text'; icon.className = 'fa-solid fa-eye-slash'; } 
  else { inp.type = 'password'; icon.className = 'fa-solid fa-eye'; }
}

async function requestOTP() {
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value.trim();
  if (!username || !password) return;
  document.getElementById('loginBtn').innerText = 'Sending OTP...';
  try {
    const res = await fetch('/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    if (res.ok) { document.getElementById('step1').style.display = 'none'; document.getElementById('step2').style.display = 'block'; } 
    else { document.getElementById('loginError').textContent = 'Error'; }
  } catch { document.getElementById('loginError').textContent = 'Network error.'; }
  document.getElementById('loginBtn').innerText = 'Continue';
}
async function verifyOTP() {
  const code = Array.from(document.querySelectorAll('.otp-box')).map(b => b.value).join('');
  if (code.length !== 6) return;
  try {
    const res = await fetch('/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    if (res.ok) { sessionStorage.setItem('td_auth', 'true'); isLoggedIn = true; window.location.reload(); } 
    else { document.getElementById('otpError').textContent = 'Invalid OTP.'; }
  } catch {}
}
function logout() { sessionStorage.removeItem('td_auth'); window.location.reload(); }

function showDrive() {
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('driveContent').style.display = 'flex';
  switchView('drive');
}

function switchView(view) {
    currentView = view; clearSelection();
    document.querySelectorAll('.nav-tab, .nav-item').forEach(n => n.classList.remove('active'));
    
    if(view === 'drive') {
        document.querySelectorAll('[onclick="switchView(\'drive\')"]').forEach(e => e.classList.add('active'));
        navigateTo('root', 'On My Drive');
    } else if(view === 'trash') {
        document.querySelectorAll('[onclick="switchView(\'trash\')"]').forEach(e => e.classList.add('active'));
        document.getElementById('iosTitle').innerText = "Recently Deleted";
        document.getElementById('backBtn').style.visibility = 'hidden';
        loadTrash();
    }
}

function navigateTo(folderId, folderName) {
  if(currentView !== 'drive') return;
  clearSelection();
  if (folderId === 'root') { currentFolderId = 'root'; folderStack = []; document.getElementById('backBtn').style.visibility = 'hidden'; } 
  else {
    const idx = folderStack.findIndex(f => f.id === folderId);
    if (idx !== -1) folderStack = folderStack.slice(0, idx + 1);
    else folderStack.push({ id: folderId, name: folderName });
    currentFolderId = folderId;
    document.getElementById('backBtn').style.visibility = 'visible';
  }
  document.getElementById('iosTitle').innerText = folderName === 'root' ? 'On My Drive' : folderName;
  loadCurrentFolder();
}

function navigateUp() {
    if (folderStack.length > 1) {
        folderStack.pop();
        const prev = folderStack[folderStack.length - 1];
        navigateTo(prev.id, prev.name);
    } else {
        navigateTo('root', 'On My Drive');
    }
}

async function loadCurrentFolder() {
  if(currentView !== 'drive') return;
  try {
    const [fr, flr] = await Promise.all([ fetch(`/files?folderId=${currentFolderId}`), fetch(`/folders?parentId=${currentFolderId}`) ]);
    allFiles = await fr.json(); foldersData = await flr.json();
    renderItems(foldersData, allFiles);
  } catch (err) {}
}

async function loadTrash() {
    try {
        const res = await fetch('/trash');
        const data = await res.json();
        allFiles = data.files; foldersData = data.folders;
        renderItems(foldersData, allFiles, true);
    } catch (err) {}
}

async function searchFiles() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if(!q) { currentView === 'drive' ? loadCurrentFolder() : loadTrash(); return; }
  try {
      const res = await fetch('/files/all');
      const all = await res.json();
      const filtered = all.filter(f => f.name.toLowerCase().includes(q));
      renderItems([], filtered, currentView === 'trash');
  } catch(e) {}
}

function getIconStyle(name, isFolder) {
    if(isFolder) return { icon: 'fa-folder', bg: 'icon-folder' };
    const ext = name.split('.').pop().toLowerCase();
    const imgs = ['jpg','jpeg','png','gif','webp'];
    const vids = ['mp4','mov','mkv'];
    if(imgs.includes(ext)) return { icon: 'fa-image', bg: 'icon-img' };
    if(vids.includes(ext)) return { icon: 'fa-video', bg: 'icon-video' };
    return { icon: 'fa-file-lines', bg: 'icon-file' };
}

function renderItems(folders, files, isTrash = false) {
  const listEl = document.getElementById('fileList'), emptyEl = document.getElementById('emptyState');
  listEl.className = `file-grid${isGridView ? '' : ' list-view'}`; listEl.innerHTML = '';

  if (folders.length === 0 && files.length === 0) { emptyEl.style.display = 'flex'; return; }
  emptyEl.style.display = 'none';

  folders.forEach(f => {
    const d = document.createElement('div');
    d.className = `folder-card ${selectedIds.has(f._id) ? 'selected' : ''}`; d.dataset.id = f._id; d.dataset.type = 'folder';
    const style = getIconStyle(f.name, true);
    d.innerHTML = `
        <div class="select-check">✓</div>
        <div class="ios-item-icon ${style.bg}"><i class="fa-solid ${style.icon}"></i></div>
        <div class="item-details">
            <div class="item-name">${f.name}</div>
            <div class="item-meta">${formatDate(f.createdAt)} - Folder</div>
        </div>`;
    d.querySelector('.select-check').addEventListener('click', e => { e.stopPropagation(); toggleSelect(f._id, d); });
    d.addEventListener('click', () => { if(selectedIds.size > 0) toggleSelect(f._id, d); else if(!isTrash) navigateTo(f._id, f.name); });
    d.addEventListener('contextmenu', e => { e.preventDefault(); ctxTarget = f; showContextMenu(e.clientX, e.clientY, 'folder', isTrash); });
    listEl.appendChild(d);
  });

  files.forEach(f => {
    const d = document.createElement('div');
    d.className = `file-card ${selectedIds.has(f._id) ? 'selected' : ''}`; d.dataset.id = f._id; d.dataset.type = 'file';
    const style = getIconStyle(f.name, false);
    d.innerHTML = `
        <div class="select-check">✓</div>
        <div class="ios-item-icon ${style.bg}"><i class="fa-solid ${style.icon}"></i></div>
        <div class="item-details">
            <div class="item-name">${f.name}</div>
            <div class="item-meta">${formatDate(f.uploadedAt)} - ${f.size}</div>
        </div>`;
    d.querySelector('.select-check').addEventListener('click', e => { e.stopPropagation(); toggleSelect(f._id, d); });
    d.addEventListener('click', () => { if(selectedIds.size > 0) toggleSelect(f._id, d); else if(!isTrash) previewFile(f); });
    d.addEventListener('contextmenu', e => { e.preventDefault(); ctxTarget = f; showContextMenu(e.clientX, e.clientY, 'file', isTrash); });
    listEl.appendChild(d);
  });
}

function toggleView() { isGridView = !isGridView; currentView === 'drive' ? loadCurrentFolder() : loadTrash(); }

function toggleSelect(id, el, force = false) {
  if (force) { selectedIds.add(id); el.classList.add('selected'); }
  else if (selectedIds.has(id)) { selectedIds.delete(id); el.classList.remove('selected'); } 
  else { selectedIds.add(id); el.classList.add('selected'); }
  updateActionBar();
}
function updateActionBar() {
  const bar = document.getElementById('actionBar');
  bar.style.display = selectedIds.size > 0 ? 'flex' : 'none';
  document.getElementById('selectedCount').textContent = `${selectedIds.size} Item${selectedIds.size > 1 ? 's' : ''}`;
  const tools = document.getElementById('actionBarTools');
  if(currentView === 'trash') {
      tools.innerHTML = `<button onclick="bulkRestore()"><i class="fa-solid fa-arrow-up-from-bracket"></i></button><button class="danger" onclick="bulkPermanentDelete()"><i class="fa-solid fa-trash"></i></button>`;
  } else {
      tools.innerHTML = `<button onclick="bulkDownload()"><i class="fa-solid fa-arrow-down"></i></button><button class="danger" onclick="bulkTrash()"><i class="fa-solid fa-trash"></i></button>`;
  }
}
function clearSelection() { selectedIds.clear(); document.querySelectorAll('.file-card, .folder-card').forEach(el => el.classList.remove('selected')); updateActionBar(); }

document.getElementById('filePicker').addEventListener('change', async e => {
  const files = Array.from(e.target.files); if (!files.length) return;
  const queue = document.getElementById('uploadQueue'); queue.style.display = 'block';
  
  for (let i = 0; i < files.length; i++) {
      const file = files[i];
      queue.innerHTML = `<div style="display:flex; justify-content:space-between;"><span>Uploading ${i+1}/${files.length}</span><span id="upPct">0%</span></div><div class="progress-track"><div class="progress-fill" id="upFill"></div></div>`;
      await new Promise(resolve => {
        const formData = new FormData(); formData.append('myFile', file); formData.append('folderId', currentFolderId);
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = ev => { if(ev.lengthComputable) { const pct = Math.round((ev.loaded/ev.total)*100); document.getElementById('upFill').style.width=pct+'%'; document.getElementById('upPct').innerText=pct+'%'; } };
        xhr.onload = () => resolve(); xhr.onerror = () => resolve();
        xhr.open('POST', '/upload'); xhr.send(formData);
      });
  }
  queue.style.display = 'none'; loadCurrentFolder();
});

async function createFolder() {
  const name = prompt('New Folder Name:'); if (!name || !name.trim()) return;
  await fetch('/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), parentId: currentFolderId }) });
  loadCurrentFolder();
}

function showContextMenu(x, y, type, isTrash) {
    const menu = document.getElementById('contextMenu'); menu.innerHTML = ''; 
    if (isTrash) {
        menu.innerHTML = `<button onclick="restoreItem()">Restore <i class="fa-solid fa-arrow-up-from-bracket"></i></button><button class="danger" onclick="permanentDeleteItem()">Delete <i class="fa-solid fa-trash"></i></button>`;
    } else {
        if(type === 'file') { menu.innerHTML += `<button onclick="previewFile(ctxTarget)">Quick Look <i class="fa-regular fa-eye"></i></button><button onclick="window.open(ctxTarget.url, '_blank')">Download <i class="fa-solid fa-arrow-down"></i></button>`; }
        menu.innerHTML += `<button onclick="openRenameModal()">Rename <i class="fa-solid fa-pen"></i></button><button class="danger" onclick="trashItem()">Delete <i class="fa-solid fa-trash"></i></button>`;
    }
    menu.classList.add('show'); menu.style.left = Math.min(x, window.innerWidth - 200) + 'px'; menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
}

function previewFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const imgs = ['png','jpg','jpeg','gif','webp']; const vids = ['mp4','mov'];
    const box = document.getElementById('previewContent');
    document.getElementById('previewTitle').innerText = file.name;
    if(imgs.includes(ext)) { box.innerHTML = `<img src="${file.url}" class="preview-media">`; } 
    else if(vids.includes(ext)) { box.innerHTML = `<video controls autoplay class="preview-media"><source src="${file.url}"></video>`; } 
    else { box.innerHTML = `<p style="color:white;text-align:center;">Preview not supported.<br><a href="${file.url}" target="_blank" style="color:var(--accent);margin-top:10px;display:block;">Download Instead</a></p>`; }
    document.getElementById('previewModal').style.display = 'flex';
}

function openRenameModal() { document.getElementById('renameInput').value = ctxTarget.name; document.getElementById('renameModal').style.display = 'flex'; }
async function submitRename() {
    const newName = document.getElementById('renameInput').value.trim();
    if(!newName || newName === ctxTarget.name) { document.getElementById('renameModal').style.display='none'; return; }
    await fetch(ctxTarget.url ? `/files/${ctxTarget._id}/rename` : `/folders/${ctxTarget._id}/rename`, { method: 'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({newName, type: ctxTarget.url ? 'file' : 'folder'}) });
    document.getElementById('renameModal').style.display = 'none'; currentView === 'drive' ? loadCurrentFolder() : loadTrash();
}

function trashItem() { fetch(ctxTarget.url ? `/files/${ctxTarget._id}/trash` : `/folders/${ctxTarget._id}/trash`, { method: 'DELETE' }).then(() => loadCurrentFolder()); }
function restoreItem() { fetch(ctxTarget.url ? `/files/${ctxTarget._id}/restore` : `/folders/${ctxTarget._id}/restore`, { method: 'PATCH' }).then(() => loadTrash()); }
function permanentDeleteItem() { if(confirm('Delete permanently?')) fetch(ctxTarget.url ? `/files/${ctxTarget._id}/permanent` : `/folders/${ctxTarget._id}/permanent`, { method: 'DELETE' }).then(() => loadTrash()); }

async function bulkTrash() { for (const id of selectedIds) { const el = document.querySelector(`[data-id="${id}"]`); await fetch(el.dataset.type === 'folder' ? `/folders/${id}/trash` : `/files/${id}/trash`, { method: 'DELETE' }); } clearSelection(); loadCurrentFolder(); }
async function bulkRestore() { for (const id of selectedIds) { const el = document.querySelector(`[data-id="${id}"]`); await fetch(el.dataset.type === 'folder' ? `/folders/${id}/restore` : `/files/${id}/restore`, { method: 'PATCH' }); } clearSelection(); loadTrash(); }
async function bulkPermanentDelete() { if(!confirm('Delete selected items permanently?')) return; for (const id of selectedIds) { const el = document.querySelector(`[data-id="${id}"]`); await fetch(el.dataset.type === 'folder' ? `/folders/${id}/permanent` : `/files/${id}/permanent`, { method: 'DELETE' }); } clearSelection(); loadTrash(); }
async function bulkDownload() { for (const id of selectedIds) { const targetUrl = allFiles.find(f => f._id === id)?.url; if (targetUrl) window.open(targetUrl, '_blank'); } clearSelection(); }
