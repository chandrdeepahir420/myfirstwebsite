// ===== STATE =====
let allFiles = [];
let folders = JSON.parse(localStorage.getItem('tg_folders') || '[]');
let currentView = 'myfiles';
let isGridView = true;
let activeCtxFile = null;

// ===== ELEMENTS =====
const loadingScreen = document.getElementById('loadingScreen');
const loginScreen = document.getElementById('loginScreen');
const driveContent = document.getElementById('driveContent');
const loginBtn = document.getElementById('loginBtn');
const loginBtnText = document.getElementById('loginBtnText');
const loginSpinner = document.getElementById('loginSpinner');
const loginError = document.getElementById('loginError');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const logoutBtn = document.getElementById('logoutBtn');
const togglePass = document.getElementById('togglePass');
const filePicker = document.getElementById('filePicker');
const uploadTrigger = document.getElementById('uploadTrigger');
const uploadProgress = document.getElementById('uploadProgress');
const uploadFileName = document.getElementById('uploadFileName');
const uploadPercent = document.getElementById('uploadPercent');
const uploadBar = document.getElementById('uploadBar');
const filesGrid = document.getElementById('filesGrid');
const foldersGrid = document.getElementById('foldersGrid');
const foldersView = document.getElementById('foldersView');
const filesView = document.getElementById('filesView');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const gridViewBtn = document.getElementById('gridViewBtn');
const listViewBtn = document.getElementById('listViewBtn');
const newFolderBtn = document.getElementById('newFolderBtn');
const folderModal = document.getElementById('folderModal');
const folderNameInput = document.getElementById('folderNameInput');
const cancelFolder = document.getElementById('cancelFolder');
const createFolder = document.getElementById('createFolder');
const contextMenu = document.getElementById('contextMenu');
const ctxDownload = document.getElementById('ctxDownload');
const ctxMove = document.getElementById('ctxMove');
const ctxDelete = document.getElementById('ctxDelete');
const viewTitle = document.getElementById('viewTitle');
const filesViewTitle = document.getElementById('filesViewTitle');

// ===== LOADING SCREEN =====
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    loadingScreen.style.opacity = '0';
    setTimeout(() => {
      loadingScreen.classList.add('hidden');
      if (localStorage.getItem('isLoggedIn') === 'true') {
        showDrive();
      } else {
        loginScreen.classList.remove('hidden');
      }
    }, 400);
  }, 1800);
});

// ===== TOGGLE PASSWORD =====
togglePass.addEventListener('click', () => {
  const type = passwordInput.type === 'password' ? 'text' : 'password';
  passwordInput.type = type;
  togglePass.style.color = type === 'text' ? 'var(--accent)' : 'var(--text3)';
});

// ===== LOGIN =====
loginBtn.addEventListener('click', doLogin);
passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') passwordInput.focus(); });

async function doLogin() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    showLoginError('Please enter username and password');
    return;
  }

  loginBtnText.textContent = 'Signing in...';
  loginSpinner.classList.remove('hidden');
  loginBtn.disabled = true;
  loginError.classList.add('hidden');

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('isLoggedIn', 'true');
      loginScreen.classList.add('hidden');
      showDrive();
    } else {
      showLoginError(data.message || 'Incorrect username or password');
    }
  } catch {
    showLoginError('Connection error. Please try again.');
  } finally {
    loginBtnText.textContent = 'Sign In';
    loginSpinner.classList.add('hidden');
    loginBtn.disabled = false;
  }
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.classList.remove('hidden');
  loginError.style.animation = 'none';
  setTimeout(() => loginError.style.animation = '', 10);
}

// ===== LOGOUT =====
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('isLoggedIn');
  location.reload();
});

// ===== SHOW DRIVE =====
function showDrive() {
  driveContent.classList.remove('hidden');
  loadFiles();
  renderFolders();
  setView('myfiles');
}

// ===== NAV =====
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    setView(item.dataset.view);
  });
});

function setView(view) {
  currentView = view;
  if (view === 'folders') {
    viewTitle.textContent = 'Folders';
    foldersView.classList.remove('hidden');
    filesView.classList.add('hidden');
  } else if (view === 'recent') {
    viewTitle.textContent = 'Recent Files';
    foldersView.classList.add('hidden');
    filesView.classList.remove('hidden');
    filesViewTitle.textContent = 'Recent';
    renderFiles(allFiles.slice(0, 10));
  } else {
    viewTitle.textContent = 'My Drive';
    foldersView.classList.add('hidden');
    filesView.classList.remove('hidden');
    filesViewTitle.textContent = 'All Files';
    renderFiles(allFiles);
  }
}

// ===== UPLOAD TRIGGER =====
uploadTrigger.addEventListener('click', () => filePicker.click());

filePicker.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  for (const file of files) {
    await uploadFile(file);
  }
  filePicker.value = '';
});

// ===== UPLOAD WITH PROGRESS =====
async function uploadFile(file) {
  uploadFileName.textContent = file.name;
  uploadPercent.textContent = '0%';
  uploadBar.style.width = '0%';
  uploadProgress.classList.remove('hidden');

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('myFile', file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        uploadBar.style.width = pct + '%';
        uploadPercent.textContent = pct + '%';
      }
    });

    xhr.addEventListener('load', async () => {
      if (xhr.status === 200) {
        uploadBar.style.width = '100%';
        uploadPercent.textContent = '100%';
        await loadFiles();
        setTimeout(() => {
          uploadProgress.classList.add('hidden');
        }, 1500);
      } else {
        uploadProgress.classList.add('hidden');
        alert('Upload failed: ' + file.name);
      }
      resolve();
    });

    xhr.addEventListener('error', () => {
      uploadProgress.classList.add('hidden');
      alert('Network error during upload');
      resolve();
    });

    xhr.open('POST', '/upload');
    xhr.send(formData);
  });
}

// ===== LOAD FILES =====
async function loadFiles() {
  try {
    const res = await fetch('/files');
    allFiles = await res.json();
    if (currentView === 'myfiles') renderFiles(allFiles);
    else if (currentView === 'recent') renderFiles(allFiles.slice(0, 10));
  } catch (e) {
    console.error('Load error:', e);
  }
}

// ===== SORT =====
sortSelect.addEventListener('change', () => {
  renderFiles(currentView === 'recent' ? allFiles.slice(0, 10) : allFiles);
});

function getSorted(files) {
  const sorted = [...files];
  const val = sortSelect.value;
  if (val === 'newest') sorted.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));
  else if (val === 'oldest') sorted.sort((a, b) => new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0));
  else if (val === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (val === 'size') sorted.sort((a, b) => parseFloat(b.size) - parseFloat(a.size));
  return sorted;
}

// ===== SEARCH =====
searchInput.addEventListener('input', () => {
  const q = searchInput.value.toLowerCase();
  const filtered = allFiles.filter(f => f.name.toLowerCase().includes(q));
  renderFiles(filtered);
});

// ===== RENDER FILES =====
function renderFiles(files) {
  filesGrid.innerHTML = '';
  const sorted = getSorted(files);

  if (!sorted.length) {
    emptyState.classList.remove('hidden');
    filesGrid.classList.add('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  filesGrid.classList.remove('hidden');

  if (isGridView) {
    filesGrid.classList.remove('list-view');
  } else {
    filesGrid.classList.add('list-view');
  }

  sorted.forEach((file, idx) => {
    const card = createFileCard(file, idx);
    filesGrid.appendChild(card);
  });
}

function getFileType(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext)) return { type: 'img', icon: '🖼️' };
  if (['pdf'].includes(ext)) return { type: 'pdf', icon: '📄' };
  if (['mp4','mov','avi','mkv','webm'].includes(ext)) return { type: 'video', icon: '🎬' };
  if (['mp3','wav','flac','aac','ogg'].includes(ext)) return { type: 'audio', icon: '🎵' };
  if (['doc','docx','txt','md','rtf'].includes(ext)) return { type: 'doc', icon: '📝' };
  if (['zip','rar','7z','tar','gz'].includes(ext)) return { type: 'zip', icon: '📦' };
  if (['xls','xlsx','csv'].includes(ext)) return { type: 'doc', icon: '📊' };
  if (['ppt','pptx'].includes(ext)) return { type: 'doc', icon: '📊' };
  return { type: 'other', icon: '📁' };
}

function createFileCard(file, idx) {
  const { type, icon } = getFileType(file.name);
  const isListView = !isGridView;
  const card = document.createElement('div');
  card.className = 'file-card' + (isListView ? ' list-view' : '');
  card.style.animationDelay = (idx * 0.04) + 's';

  const uploadDate = file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : '';

  card.innerHTML = `
    <div class="file-icon-wrap ${type}">${icon}</div>
    <div class="file-info">
      <div class="file-name" title="${file.name}">${file.name}</div>
      <div class="file-meta">
        <span>${file.size}</span>
        ${uploadDate ? `<span class="file-meta-dot"></span><span>${uploadDate}</span>` : ''}
      </div>
    </div>
    ${!isListView ? `<button class="file-more-btn" data-idx="${idx}" title="More options">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
    </button>` : ''}
    <div class="file-actions">
      <a class="file-btn" href="${file.url}" target="_blank">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        ${isListView ? 'Download' : ''}
      </a>
      <button class="file-btn danger" data-url="${file.url}" onclick="deleteFile(this, '${encodeURIComponent(file.name)}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        ${isListView ? 'Delete' : ''}
      </button>
    </div>
  `;

  // More button context menu
  const moreBtn = card.querySelector('.file-more-btn');
  if (moreBtn) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activeCtxFile = file;
      showContextMenu(e.clientX, e.clientY);
    });
  }

  return card;
}

// ===== DELETE FILE =====
async function deleteFile(btn, encodedName) {
  const name = decodeURIComponent(encodedName);
  if (!confirm(`Delete "${name}"?`)) return;

  try {
    const res = await fetch('/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (res.ok) await loadFiles();
    else alert('Delete failed');
  } catch { alert('Error deleting file'); }
}

// ===== VIEW TOGGLE =====
gridViewBtn.addEventListener('click', () => {
  isGridView = true;
  gridViewBtn.classList.add('active');
  listViewBtn.classList.remove('active');
  renderFiles(currentView === 'recent' ? allFiles.slice(0, 10) : allFiles);
});
listViewBtn.addEventListener('click', () => {
  isGridView = false;
  listViewBtn.classList.add('active');
  gridViewBtn.classList.remove('active');
  renderFiles(currentView === 'recent' ? allFiles.slice(0, 10) : allFiles);
});

// ===== FOLDERS =====
newFolderBtn.addEventListener('click', () => {
  folderModal.classList.remove('hidden');
  folderNameInput.focus();
});
cancelFolder.addEventListener('click', () => {
  folderModal.classList.add('hidden');
  folderNameInput.value = '';
});
createFolder.addEventListener('click', () => {
  const name = folderNameInput.value.trim();
  if (!name) return;
  const emojis = ['📁','🗂️','📂','🗃️','📋'];
  folders.push({ name, emoji: emojis[Math.floor(Math.random() * emojis.length)], files: [] });
  localStorage.setItem('tg_folders', JSON.stringify(folders));
  folderNameInput.value = '';
  folderModal.classList.add('hidden');
  renderFolders();
});
folderNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') createFolder.click(); });

function renderFolders() {
  foldersGrid.innerHTML = '';
  if (!folders.length) {
    foldersGrid.innerHTML = '<p style="color:var(--text3);font-size:14px;grid-column:1/-1">No folders yet. Create one!</p>';
    return;
  }
  folders.forEach((folder, idx) => {
    const card = document.createElement('div');
    card.className = 'folder-card';
    card.innerHTML = `
      <div class="folder-icon">${folder.emoji}</div>
      <div class="folder-name">${folder.name}</div>
      <div class="folder-count">${folder.files ? folder.files.length : 0} files</div>
    `;
    foldersGrid.appendChild(card);
  });
}

// ===== CONTEXT MENU =====
function showContextMenu(x, y) {
  contextMenu.classList.remove('hidden');
  const menuW = 170, menuH = 120;
  const left = x + menuW > window.innerWidth ? x - menuW : x;
  const top = y + menuH > window.innerHeight ? y - menuH : y;
  contextMenu.style.left = left + 'px';
  contextMenu.style.top = top + 'px';
}
document.addEventListener('click', () => contextMenu.classList.add('hidden'));
ctxDownload.addEventListener('click', () => {
  if (activeCtxFile) window.open(activeCtxFile.url, '_blank');
});
ctxDelete.addEventListener('click', async () => {
  if (!activeCtxFile) return;
  if (!confirm(`Delete "${activeCtxFile.name}"?`)) return;
  try {
    const res = await fetch('/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: activeCtxFile.name })
    });
    if (res.ok) await loadFiles();
  } catch { alert('Error'); }
});
ctxMove.addEventListener('click', () => {
  if (!folders.length) { alert('Pehle ek folder banao!'); return; }
  const names = folders.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
  const choice = prompt(`Kis folder mein move karein?\n${names}\n\nNumber enter karein:`);
  const idx = parseInt(choice) - 1;
  if (!isNaN(idx) && folders[idx]) {
    if (!folders[idx].files) folders[idx].files = [];
    folders[idx].files.push(activeCtxFile);
    localStorage.setItem('tg_folders', JSON.stringify(folders));
    renderFolders();
    alert(`"${activeCtxFile.name}" moved to "${folders[idx].name}"`);
  }
});

// ===== DRAG & DROP =====
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  if (!driveContent.classList.contains('hidden')) {
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) await uploadFile(file);
  }
});
