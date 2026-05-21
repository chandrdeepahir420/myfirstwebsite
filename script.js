// ==========================================
// 1. THEME & GLOBAL VARIABLES (Top par rakha hai)
// ==========================================
let isDark = true;
function applyTheme(t) {
    isDark = t === 'dark'; 
    document.body.className = t;
    const icon1 = document.getElementById('themeIconLogin');
    const icon2 = document.getElementById('themeIconSidebar');
    if (icon1) icon1.textContent = isDark ? '🌙' : '☀️';
    if (icon2) icon2.textContent = isDark ? '🌙' : '☀️';
}
function toggleTheme() { 
    isDark = !isDark; 
    const t = isDark ? 'dark' : 'light'; 
    applyTheme(t); 
    localStorage.setItem('td_theme', t); 
}
function formatDate(dateString) {
    if(!dateString) return '--';
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
let currentFolderId = 'root';
let folderStack = [];
let isGridView = true;
let ctxTarget = null;
let allFiles = [];
let foldersData = [];
let selectedIds = new Set();
let currentView = 'drive';
let activeUploads = []; 

// ==========================================
// 2. INITIALIZATION
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    applyTheme(localStorage.getItem('td_theme') || 'dark');
    if (localStorage.getItem('td_token')) { showDrive(); } else { hideLoader(); showLogin(); }
    setupOTPBoxes();
    document.addEventListener('click', (e) => { 
        if(!e.target.closest('.task-panel') && !e.target.closest('.fa-bell')) {
            const tp = document.getElementById('taskPanel');
            if(tp) tp.style.display = 'none';
        }
        const ctx = document.getElementById('contextMenu');
        if(ctx) ctx.classList.remove('show'); 
    });
});

function setupOTPBoxes() {
    const boxes = document.querySelectorAll('.otp-box');
    boxes.forEach((box, i) => {
        box.addEventListener('input', () => {
            box.value = box.value.replace(/\D/g, '');
            if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
        });
        box.addEventListener('keydown', e => { 
            if (e.key === 'Backspace' && !box.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; } 
        });
    });
}

function togglePass(inputId, iconId) {
    const inp = document.getElementById(inputId), icon = document.getElementById(iconId);
    if(inp.type === 'password') { inp.type = 'text'; icon.className = 'fa-solid fa-eye-slash'; } 
    else { inp.type = 'password'; icon.className = 'fa-solid fa-eye'; }
}

// ==========================================
// 3. AUTHENTICATION (JWT)
// ==========================================
function getHeaders() { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('td_token')}` }; }

async function requestOTP() {
    const username = document.getElementById('usernameInput').value;
    const password = document.getElementById('passwordInput').value;
    if(!username || !password) return;
    document.getElementById('loginBtn').innerText = "Sending...";
    try {
        const res = await fetch('/request-otp', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ username, password }) });
        if(res.ok) { document.getElementById('step1').style.display='none'; document.getElementById('step2').style.display='block'; }
        else { document.getElementById('loginError').innerText = "Invalid Credentials"; }
    } catch { document.getElementById('loginError').innerText = "Network Error"; }
    document.getElementById('loginBtn').innerText = "Continue";
}

async function verifyOTP() {
    const code = Array.from(document.querySelectorAll('.otp-box')).map(b => b.value).join('');
    if(code.length !== 6) return;
    try {
        const res = await fetch('/verify-otp', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ code }) });
        const data = await res.json();
        if(data.success) { localStorage.setItem('td_token', data.token); showDrive(); }
        else { document.getElementById('otpError').innerText = "Wrong OTP"; }
    } catch { document.getElementById('otpError').innerText = "Error verifying OTP"; }
}

function logout() { localStorage.removeItem('td_token'); window.location.reload(); }

// ==========================================
// 4. UI NAVIGATION
// ==========================================
function hideLoader() { document.getElementById('loadingScreen').style.display='none'; }
function showLogin() { document.getElementById('loginScreen').style.display='flex'; document.getElementById('driveContent').style.display='none'; }
function showDrive() { hideLoader(); document.getElementById('loginScreen').style.display='none'; document.getElementById('driveContent').style.display='flex'; switchView('drive'); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebarOverlay').classList.toggle('show'); }

function switchView(view) {
    currentView = view; clearSelection();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById('settingsArea').style.display = view === 'settings' ? 'block' : 'none';
    document.getElementById('mainToolbar').style.display = view === 'drive' ? 'flex' : 'none';
    document.getElementById('fileList').style.display = view === 'settings' ? 'none' : 'grid';
    
    if(view === 'drive') { 
        document.getElementById('navDrive').classList.add('active');
        navigateTo('root', 'My Drive'); 
    }
    else if(view === 'trash') { 
        document.getElementById('navTrash').classList.add('active');
        loadTrash(); 
        document.getElementById('breadcrumb').innerText = "Trash Bin"; 
    }
    else if(view === 'settings') { 
        document.getElementById('navSettings').classList.add('active');
        document.getElementById('breadcrumb').innerText = "Security Settings"; 
        document.getElementById('emptyState').style.display='none'; 
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
        html += `<span style="margin: 0 5px; color: gray;">›</span>`;
        if (i === folderStack.length - 1) html += `<span>${f.name}</span>`;
        else html += `<span style="cursor:pointer" onclick="navigateTo('${f.id}','${f.name}')">${f.name}</span>`;
    });
    document.getElementById('breadcrumb').innerHTML = html;
    loadCurrentFolder();
    document.getElementById('sidebar').classList.remove('open'); 
    document.getElementById('sidebarOverlay').classList.remove('show');
}

// ==========================================
// 5. DATA LOADING & SORTING
// ==========================================
async function loadCurrentFolder() {
    if(currentView !== 'drive') return;
    try {
        const [fr, flr] = await Promise.all([ fetch(`/files?folderId=${currentFolderId}`, {headers: getHeaders()}), fetch(`/folders?parentId=${currentFolderId}`, {headers: getHeaders()}) ]);
        allFiles = await fr.json(); foldersData = await flr.json();
        sortFiles(); 
    } catch {}
}

async function loadTrash() {
    try {
        const res = await fetch('/trash', {headers: getHeaders()}); const data = await res.json();
        allFiles = data.files; foldersData = data.folders; sortFiles(true);
    } catch {}
}

function sortFiles(isTrash = false) {
    const mode = document.getElementById('sortSelect')?.value || 'date-desc';
    const sortLogic = (a, b) => {
        if(mode === 'name-asc') return a.name.localeCompare(b.name);
        if(mode === 'date-desc') return new Date(b.uploadedAt || b.createdAt) - new Date(a.uploadedAt || a.createdAt);
        if(mode === 'size-desc') return parseFloat(b.size) - parseFloat(a.size);
    };
    allFiles.sort(sortLogic); foldersData.sort(sortLogic);
    renderItems(foldersData, allFiles, isTrash || currentView === 'trash');
}

// ==========================================
// 6. RENDER & DRAG SELECT
// ==========================================
let isDragging = false;
document.addEventListener('mousedown', () => isDragging = true);
document.addEventListener('mouseup', () => isDragging = false);

function renderItems(folders, files, isTrash) {
    const listEl = document.getElementById('fileList'), emptyEl = document.getElementById('emptyState');
    const header = document.getElementById('listHeader');
    
    listEl.className = `file-grid${isGridView ? '' : ' list-view'}`; listEl.innerHTML = '';
    if(header) header.style.display = (!isGridView && (folders.length || files.length)) ? 'flex' : 'none';
    
    if(!folders.length && !files.length) { 
        emptyEl.style.display='flex'; 
        document.getElementById('emptyIcon').className = isTrash ? 'fa-solid fa-trash-can text-5xl' : 'fa-solid fa-folder-open text-5xl text-slate-500';
        document.getElementById('emptyTitle').innerText = isTrash ? 'Trash is empty' : 'No files here';
        return; 
    }
    emptyEl.style.display='none';
    
    folders.forEach(f => {
        const d = document.createElement('div'); d.className = `folder-card ${selectedIds.has(f._id)?'selected':''}`; d.dataset.id = f._id;
        d.innerHTML = `
            <div class="select-check">✓</div>
            <div class="item-name-box"><i class="fa-solid fa-folder text-amber-500"></i> <span>${f.name}</span></div>
            <div class="item-date-box">${formatDate(f.createdAt)}</div>
            <div class="item-size-box">--</div>`;
        d.addEventListener('mouseenter', () => { if(isDragging) toggleSelect(f._id, d, true); });
        d.addEventListener('mousedown', () => toggleSelect(f._id, d));
        d.addEventListener('dblclick', () => { if(!isTrash) navigateTo(f._id, f.name); });
        d.addEventListener('contextmenu', e => { e.preventDefault(); ctxTarget = f; ctxTarget.type = 'folder'; showContextMenu(e); });
        listEl.appendChild(d);
    });
    
    files.forEach(f => {
        const d = document.createElement('div'); d.className = `file-card ${selectedIds.has(f._id)?'selected':''}`; d.dataset.id = f._id;
        d.innerHTML = `
            <div class="select-check">✓</div>
            <div class="item-name-box"><i class="fa-solid fa-file text-blue-400"></i> <span>${f.name}</span></div>
            <div class="item-date-box">${formatDate(f.uploadedAt)}</div>
            <div class="item-size-box">${f.size || '0 MB'}</div>`;
        d.addEventListener('mouseenter', () => { if(isDragging) toggleSelect(f._id, d, true); });
        d.addEventListener('mousedown', () => toggleSelect(f._id, d));
        d.addEventListener('dblclick', () => { if(!isTrash) previewFile(f); });
        d.addEventListener('contextmenu', e => { e.preventDefault(); ctxTarget = f; ctxTarget.type = 'file'; showContextMenu(e); });
        listEl.appendChild(d);
    });
}

function toggleView() { 
    isGridView = !isGridView; 
    sortFiles(); 
}
// ==========================================
// 7. ADVANCED UPLOAD TASK CENTER
// ==========================================
function toggleUploadPanel() { const p = document.getElementById('taskPanel'); p.style.display = p.style.display==='none' ? 'block' : 'none'; }
function cancelAllUploads() { activeUploads.forEach(task => task.controller.abort()); document.getElementById('taskPanel').style.display='none'; }

document.getElementById('filePicker')?.addEventListener('change', async e => {
    const files = Array.from(e.target.files); if (!files.length) return;
    document.getElementById('taskBadge').style.display = 'block';
    document.getElementById('taskBadge').innerText = files.length;
    const list = document.getElementById('uploadTasksList');
    document.getElementById('taskPanel').style.display = 'block';
    
    for(let file of files) {
        const taskId = Date.now() + Math.random();
        const controller = new AbortController();
        activeUploads.push({ id: taskId, controller });
        
        const el = document.createElement('div'); el.className = 'task-item'; el.id = `task-${taskId}`;
        // Naya HTML detailed stats ke liye
        el.innerHTML = `
            <div class="task-header">
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%;">${file.name}</span>
                <button class="btn-ghost" style="padding:2px 6px; font-size:0.6rem; border:none; color:var(--danger)" onclick="cancelUpload('${taskId}')"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="task-meta">
                <span id="meta-${taskId}">0% • 0 / 0 MB</span>
                <span id="speed-${taskId}" class="task-speed">Connecting...</span>
            </div>
            <div class="task-bar"><div class="task-fill" id="fill-${taskId}"></div></div>`;
        list.appendChild(el);

        const formData = new FormData(); formData.append('myFile', file); formData.append('folderId', currentFolderId);
        const startTime = Date.now(); // Speed calculate karne ke liye time

        try {
            const xhr = new XMLHttpRequest();
            await new Promise((resolve, reject) => {
                controller.signal.addEventListener('abort', () => { xhr.abort(); reject('Cancelled'); });
                xhr.upload.onprogress = ev => { 
                    if(ev.lengthComputable) {
                        const pct = Math.round((ev.loaded/ev.total)*100);
                        document.getElementById(`fill-${taskId}`).style.width = pct + '%';
                        
                        // Live Stats calculation
                        const loadedMB = (ev.loaded / (1024*1024)).toFixed(1);
                        const totalMB = (ev.total / (1024*1024)).toFixed(1);
                        const timeElapsed = (Date.now() - startTime) / 1000;
                        const speed = timeElapsed > 0 ? (loadedMB / timeElapsed).toFixed(1) : 0;
                        
                        document.getElementById(`meta-${taskId}`).innerText = `${pct}% • ${loadedMB} / ${totalMB} MB`;
                        document.getElementById(`speed-${taskId}`).innerText = `${speed} MB/s`;
                    }
                };
                xhr.onload = () => resolve(xhr.responseText);
                xhr.onerror = () => reject('Error');
                xhr.open('POST', '/upload');
                xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('td_token')}`);
                xhr.send(formData);
            });
            document.getElementById(`task-${taskId}`).innerHTML = `<span style="color:var(--success); font-size:0.8rem">✓ ${file.name} (Uploaded Successfully)</span>`;
        } catch(err) { document.getElementById(`task-${taskId}`).innerHTML = `<span style="color:var(--danger); font-size:0.8rem">✗ ${file.name} (${err})</span>`; }
    }
    setTimeout(loadCurrentFolder, 1000);
});
function cancelUpload(taskId) { const task = activeUploads.find(t => t.id == taskId); if(task) task.controller.abort(); }

// ==========================================
// 8. CONTEXT MENU & MODALS
// ==========================================
function showContextMenu(e) {
    const menu = document.getElementById('contextMenu'); menu.innerHTML = '';
    const isTrash = currentView === 'trash';
    if(isTrash) {
        menu.innerHTML = `<button onclick="restoreItem()"><i class="fa-solid fa-rotate-left text-green-500"></i> Restore</button><hr><button class="danger" onclick="permanentDeleteItem()"><i class="fa-solid fa-trash"></i> Permanent Delete</button>`;
    } else {
        if(ctxTarget.type === 'file') {
            menu.innerHTML += `<button onclick="previewFile(ctxTarget)"><i class="fa-solid fa-eye text-blue-500"></i> Preview</button>`;
            menu.innerHTML += `<button onclick="window.open('/download/${ctxTarget._id}?token=${localStorage.getItem('td_token')}', '_blank')"><i class="fa-solid fa-download"></i> Download</button>`;
        }
        menu.innerHTML += `<button onclick="openRenameModal()"><i class="fa-solid fa-pen"></i> Rename</button><hr><button class="danger" onclick="trashItem()"><i class="fa-solid fa-trash"></i> Move to Trash</button>`;
    }
    menu.classList.add('show'); 
    menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px'; 
    menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
}

function previewFile(file) {
    // Note: Due to JWT security, simple URL preview for media needs token attached
    const tokenUrl = `/download/${file._id}?token=${localStorage.getItem('td_token')}`;
    const ext = file.name.split('.').pop().toLowerCase();
    const images = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const videos = ['mp4', 'webm', 'ogg'];
    const contentBox = document.getElementById('previewContent');
    document.getElementById('previewTitle').innerText = file.name;
    
    if(images.includes(ext)) { contentBox.innerHTML = `<img src="${tokenUrl}" class="preview-media">`; } 
    else if(videos.includes(ext)) { contentBox.innerHTML = `<video controls autoplay class="preview-media"><source src="${tokenUrl}"></video>`; } 
    else { contentBox.innerHTML = `<div class="text-center text-white"><i class="fa-solid fa-file-circle-exclamation text-6xl mb-4 text-slate-500"></i><p>Preview not supported here.</p><br><a href="${tokenUrl}" target="_blank" class="btn-primary mt-2 inline-flex w-auto px-6" style="text-decoration:none;">Download Instead</a></div>`; }
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
    const route = ctxTarget.type === 'file' ? `/files/${ctxTarget._id}/rename` : `/folders/${ctxTarget._id}/rename`;
    await fetch(route, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({newName, type: ctxTarget.type}) });
    document.getElementById('renameModal').style.display = 'none';
    currentView === 'drive' ? loadCurrentFolder() : loadTrash();
}

function customConfirm(title, callback) {
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmModal').style.display = 'flex';
    document.getElementById('confirmYesBtn').onclick = () => { document.getElementById('confirmModal').style.display = 'none'; callback(); };
}

// Single item actions
function trashItem() { customConfirm('Move to Trash?', async () => { await fetch(`/${ctxTarget.type}s/${ctxTarget._id}/trash`, { method: 'DELETE', headers: getHeaders() }); loadCurrentFolder(); }); }
function restoreItem() { fetch(`/${ctxTarget.type}s/${ctxTarget._id}/restore`, { method: 'PATCH', headers: getHeaders() }).then(() => loadTrash()); }
function permanentDeleteItem() { customConfirm('Delete Forever?', async () => { await fetch(`/${ctxTarget.type}s/${ctxTarget._id}/permanent`, { method: 'DELETE', headers: getHeaders() }); loadTrash(); }); }

// ==========================================
// 9. SETTINGS & BULK ACTIONS
// ==========================================
async function changePassword() {
    const currentPass = document.getElementById('currPass').value, newPass = document.getElementById('newPass').value;
    const res = await fetch('/change-password', { method:'POST', headers: getHeaders(), body: JSON.stringify({currentPass, newPass}) });
    const data = await res.json();
    if(data.success) { alert("Password Updated!"); document.getElementById('currPass').value=''; document.getElementById('newPass').value=''; }
    else alert(data.message || "Update Failed");
}

function toggleSelect(id, el, force = false) {
    if(force) { selectedIds.add(id); el.classList.add('selected'); }
    else if(selectedIds.has(id)) { selectedIds.delete(id); el.classList.remove('selected'); }
    else { selectedIds.add(id); el.classList.add('selected'); }
    
    const bar = document.getElementById('actionBar');
    bar.style.display = selectedIds.size > 0 ? 'flex' : 'none';
    document.getElementById('selectedCount').innerText = selectedIds.size + ' Selected';
    document.getElementById('actionBarTools').innerHTML = currentView === 'trash' ? `<button class="ab-btn" onclick="bulkRestore()">Restore</button><button class="ab-btn danger" onclick="bulkPermanent()">Delete</button>` : `<button class="ab-btn danger" onclick="bulkTrash()"><i class="fa-solid fa-trash"></i></button>`;
}

function clearSelection() { selectedIds.clear(); document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected')); document.getElementById('actionBar').style.display='none'; }

async function bulkTrash() { customConfirm('Trash selected items?', async () => { for(let id of selectedIds) { const route = allFiles.find(f=>f._id===id) ? 'files' : 'folders'; await fetch(`/${route}/${id}/trash`, {method:'DELETE', headers:getHeaders()}); } clearSelection(); loadCurrentFolder(); }); }
async function bulkRestore() { for(let id of selectedIds) { const route = allFiles.find(f=>f._id===id) ? 'files' : 'folders'; await fetch(`/${route}/${id}/restore`, {method:'PATCH', headers:getHeaders()}); } clearSelection(); loadTrash(); }
async function bulkPermanent() { customConfirm('Delete permanently?', async () => { for(let id of selectedIds) { const route = allFiles.find(f=>f._id===id) ? 'files' : 'folders'; await fetch(`/${route}/${id}/permanent`, {method:'DELETE', headers:getHeaders()}); } clearSelection(); loadTrash(); }); }

async function createFolder() { const n = prompt('Folder Name:'); if(n) { await fetch('/folders', {method:'POST', headers:getHeaders(), body:JSON.stringify({name:n, parentId:currentFolderId})}); loadCurrentFolder(); } }
function toggleView() { isGridView = !isGridView; sortFiles(); }
