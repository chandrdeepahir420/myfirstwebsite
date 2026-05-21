let currentFolderId = 'root';
let folderStack = [];
let isGridView = true;
let ctxTarget = null;
let allFiles = [];
let foldersData = [];
let selectedIds = new Set();
let isDark = true;
let currentView = 'drive';

// ADVANCED TASK CENTER 
let activeUploads = []; // Store abort controllers

window.addEventListener('DOMContentLoaded', () => {
    applyTheme(localStorage.getItem('td_theme') || 'dark');
    if (localStorage.getItem('td_token')) { showDrive(); } else { hideLoader(); showLogin(); }
    setupOTPBoxes();
    document.addEventListener('click', (e) => { if(!e.target.closest('.task-panel') && !e.target.closest('.fa-bell')) document.getElementById('taskPanel').style.display='none'; document.getElementById('contextMenu').classList.remove('show'); });
});

// AUTH SYSTEM WITH JWT API HEADERS
function getHeaders() { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('td_token')}` }; }

async function requestOTP() {
    const username = document.getElementById('usernameInput').value, password = document.getElementById('passwordInput').value;
    if(!username || !password) return;
    try {
        const res = await fetch('/request-otp', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ username, password }) });
        if(res.ok) { document.getElementById('step1').style.display='none'; document.getElementById('step2').style.display='block'; }
    } catch {}
}
async function verifyOTP() {
    const code = Array.from(document.querySelectorAll('.otp-box')).map(b => b.value).join('');
    try {
        const res = await fetch('/verify-otp', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ code }) });
        const data = await res.json();
        if(data.success) { localStorage.setItem('td_token', data.token); showDrive(); }
    } catch {}
}
function logout() { localStorage.removeItem('td_token'); window.location.reload(); }

// UI NAVIGATION
function hideLoader() { document.getElementById('loadingScreen').style.display='none'; }
function showLogin() { document.getElementById('loginScreen').style.display='flex'; document.getElementById('driveContent').style.display='none'; }
function showDrive() { hideLoader(); document.getElementById('loginScreen').style.display='none'; document.getElementById('driveContent').style.display='flex'; switchView('drive'); }
function switchView(view) {
    currentView = view; clearSelection();
    document.getElementById('settingsArea').style.display = view === 'settings' ? 'block' : 'none';
    document.getElementById('mainToolbar').style.display = view === 'drive' ? 'flex' : 'none';
    document.getElementById('fileList').style.display = view === 'settings' ? 'none' : 'grid';
    
    if(view === 'drive') { navigateTo('root', 'My Drive'); }
    else if(view === 'trash') { loadTrash(); document.getElementById('breadcrumb').innerText = "Trash Bin"; }
    else if(view === 'settings') { document.getElementById('breadcrumb').innerText = "Security Settings"; document.getElementById('emptyState').style.display='none'; }
}

async function loadCurrentFolder() {
    if(currentView !== 'drive') return;
    try {
        const [fr, flr] = await Promise.all([ fetch(`/files?folderId=${currentFolderId}`, {headers: getHeaders()}), fetch(`/folders?parentId=${currentFolderId}`, {headers: getHeaders()}) ]);
        allFiles = await fr.json(); foldersData = await flr.json();
        sortFiles(); // Applies current sorting before render
    } catch {}
}
async function loadTrash() {
    const res = await fetch('/trash', {headers: getHeaders()}); const data = await res.json();
    allFiles = data.files; foldersData = data.folders; sortFiles(true);
}

// ADVANCED SORTING ENGINE
function sortFiles(isTrash = false) {
    const mode = document.getElementById('sortSelect').value;
    const sortLogic = (a, b) => {
        if(mode === 'name-asc') return a.name.localeCompare(b.name);
        if(mode === 'date-desc') return new Date(b.uploadedAt || b.createdAt) - new Date(a.uploadedAt || a.createdAt);
        if(mode === 'size-desc') return parseFloat(b.size) - parseFloat(a.size);
    };
    allFiles.sort(sortLogic); foldersData.sort(sortLogic);
    renderItems(foldersData, allFiles, isTrash || currentView === 'trash');
}

// RENDER & DRAG SELECT ENGINE
let isDragging = false;
document.addEventListener('mousedown', () => isDragging = true);
document.addEventListener('mouseup', () => isDragging = false);

function renderItems(folders, files, isTrash) {
    const listEl = document.getElementById('fileList'), emptyEl = document.getElementById('emptyState');
    listEl.className = `file-grid${isGridView ? '' : ' list-view'}`; listEl.innerHTML = '';
    if(!folders.length && !files.length) { emptyEl.style.display='flex'; return; }
    emptyEl.style.display='none';
    
    folders.forEach(f => {
        const d = document.createElement('div'); d.className = `folder-card ${selectedIds.has(f._id)?'selected':''}`; d.dataset.id = f._id;
        d.innerHTML = `<div class="select-check">✓</div><i class="fa-solid fa-folder text-amber-500"></i> ${f.name}`;
        // Drag Select Event
        d.addEventListener('mouseenter', () => { if(isDragging) toggleSelect(f._id, d, true); });
        d.addEventListener('mousedown', () => toggleSelect(f._id, d));
        d.addEventListener('dblclick', () => { if(!isTrash) navigateTo(f._id, f.name); });
        d.addEventListener('contextmenu', e => { e.preventDefault(); ctxTarget = f; ctxTarget.type = 'folder'; showContextMenu(e); });
        listEl.appendChild(d);
    });
    
    files.forEach(f => {
        const d = document.createElement('div'); d.className = `file-card ${selectedIds.has(f._id)?'selected':''}`; d.dataset.id = f._id;
        d.innerHTML = `<div class="select-check">✓</div><i class="fa-solid fa-file text-blue-400"></i> <div style="overflow:hidden; text-overflow:ellipsis">${f.name}</div><div style="font-size:0.7rem; color:gray">${f.size}</div>`;
        d.addEventListener('mouseenter', () => { if(isDragging) toggleSelect(f._id, d, true); });
        d.addEventListener('mousedown', () => toggleSelect(f._id, d));
        d.addEventListener('dblclick', () => { if(!isTrash) previewFile(f); });
        d.addEventListener('contextmenu', e => { e.preventDefault(); ctxTarget = f; ctxTarget.type = 'file'; showContextMenu(e); });
        listEl.appendChild(d);
    });
}

// UPLOAD TASK CENTER WITH CANCEL FEATURE
function toggleUploadPanel() { const p = document.getElementById('taskPanel'); p.style.display = p.style.display==='none' ? 'block' : 'none'; }
function cancelAllUploads() { activeUploads.forEach(task => task.controller.abort()); document.getElementById('taskPanel').style.display='none'; }

document.getElementById('filePicker').addEventListener('change', async e => {
    const files = Array.from(e.target.files); if (!files.length) return;
    document.getElementById('taskBadge').style.display = 'block';
    const list = document.getElementById('uploadTasksList');
    
    for(let file of files) {
        const taskId = Date.now() + Math.random();
        const controller = new AbortController();
        activeUploads.push({ id: taskId, controller });
        
        const el = document.createElement('div'); el.className = 'task-item'; el.id = `task-${taskId}`;
        el.innerHTML = `<div class="task-header"><span>${file.name}</span><button class="btn-ghost" style="padding:2px 6px; font-size:0.6rem; border:none; color:red" onclick="cancelUpload('${taskId}')"><i class="fa-solid fa-xmark"></i></button></div><div class="task-bar"><div class="task-fill" id="fill-${taskId}"></div></div>`;
        list.appendChild(el);

        const formData = new FormData(); formData.append('myFile', file); formData.append('folderId', currentFolderId);
        
        try {
            const xhr = new XMLHttpRequest();
            // Wrap XHR in promise to use controller
            await new Promise((resolve, reject) => {
                controller.signal.addEventListener('abort', () => { xhr.abort(); reject('Cancelled'); });
                xhr.upload.onprogress = ev => { if(ev.lengthComputable) document.getElementById(`fill-${taskId}`).style.width = Math.round((ev.loaded/ev.total)*100)+'%'; };
                xhr.onload = () => resolve(xhr.responseText);
                xhr.onerror = () => reject('Error');
                xhr.open('POST', '/upload');
                xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('td_token')}`);
                xhr.send(formData);
            });
            document.getElementById(`task-${taskId}`).innerHTML = `<span style="color:green; font-size:0.8rem">✓ ${file.name} (Done)</span>`;
        } catch(err) { document.getElementById(`task-${taskId}`).innerHTML = `<span style="color:red; font-size:0.8rem">✗ ${file.name} (${err})</span>`; }
    }
    setTimeout(loadCurrentFolder, 1000);
});

function cancelUpload(taskId) {
    const task = activeUploads.find(t => t.id == taskId);
    if(task) task.controller.abort();
}

// CONTEXT MENU & MODALS (Secured Download URL)
function showContextMenu(e) {
    const menu = document.getElementById('contextMenu'); menu.innerHTML = '';
    const isTrash = currentView === 'trash';
    if(isTrash) {
        menu.innerHTML = `<button onclick="bulkRestore()"><i class="fa-solid fa-rotate-left"></i> Restore</button><hr><button class="danger" onclick="bulkPermanent()"><i class="fa-solid fa-trash"></i> Permanent Delete</button>`;
    } else {
        if(ctxTarget.type === 'file') {
            menu.innerHTML += `<button onclick="window.open('/download/${ctxTarget._id}?token=${localStorage.getItem('td_token')}', '_blank')"><i class="fa-solid fa-download"></i> Download</button>`;
        }
        menu.innerHTML += `<button onclick="openRenameModal()"><i class="fa-solid fa-pen"></i> Rename</button><hr><button class="danger" onclick="bulkTrash()"><i class="fa-solid fa-trash"></i> Move to Trash</button>`;
    }
    menu.style.display='block'; menu.style.left=e.clientX+'px'; menu.style.top=e.clientY+'px';
}

// SETTINGS: CHANGE PASSWORD
async function changePassword() {
    const currentPass = document.getElementById('currPass').value, newPass = document.getElementById('newPass').value;
    const res = await fetch('/change-password', { method:'POST', headers: getHeaders(), body: JSON.stringify({currentPass, newPass}) });
    const data = await res.json();
    if(data.success) { alert("Password Updated Successfully!"); document.getElementById('currPass').value=''; document.getElementById('newPass').value=''; }
    else alert(data.message || "Update Failed");
}

// SELECTION & ACTION BAR
function toggleSelect(id, el, force = false) {
    if(force) { selectedIds.add(id); el.classList.add('selected'); }
    else if(selectedIds.has(id)) { selectedIds.delete(id); el.classList.remove('selected'); }
    else { selectedIds.add(id); el.classList.add('selected'); }
    const bar = document.getElementById('actionBar');
    bar.style.display = selectedIds.size > 0 ? 'flex' : 'none';
    document.getElementById('selectedCount').innerText = selectedIds.size + ' Selected';
    document.getElementById('actionBarTools').innerHTML = currentView === 'trash' ? `<button class="ab-btn" onclick="bulkRestore()">Restore</button><button class="ab-btn danger" onclick="bulkPermanent()">Delete</button>` : `<button class="ab-btn" onclick="bulkMove()">Move</button><button class="ab-btn danger" onclick="bulkTrash()">Trash</button>`;
}
function clearSelection() { selectedIds.clear(); document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected')); document.getElementById('actionBar').style.display='none'; }

// API ACTIONS (TRASH, RESTORE, MOVE, CREATE)
async function bulkTrash() { for(let id of selectedIds) { const route = allFiles.find(f=>f._id===id) ? 'files' : 'folders'; await fetch(`/${route}/${id}/trash`, {method:'DELETE', headers:getHeaders()}); } clearSelection(); loadCurrentFolder(); }
async function bulkRestore() { for(let id of selectedIds) { const route = allFiles.find(f=>f._id===id) ? 'files' : 'folders'; await fetch(`/${route}/${id}/restore`, {method:'PATCH', headers:getHeaders()}); } clearSelection(); loadTrash(); }
async function bulkPermanent() { for(let id of selectedIds) { const route = allFiles.find(f=>f._id===id) ? 'files' : 'folders'; await fetch(`/${route}/${id}/permanent`, {method:'DELETE', headers:getHeaders()}); } clearSelection(); loadTrash(); }
async function createFolder() { const n = prompt('Name:'); if(n) { await fetch('/folders', {method:'POST', headers:getHeaders(), body:JSON.stringify({name:n, parentId:currentFolderId})}); loadCurrentFolder(); } }
function toggleView() { isGridView = !isGridView; sortFiles(); }
