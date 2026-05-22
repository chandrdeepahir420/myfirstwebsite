let isDark = true;
function applyTheme(t) {
    isDark = t === 'dark'; document.body.className = t;
    const icon2 = document.getElementById('themeIconSidebar');
    if (icon2) icon2.textContent = isDark ? '🌙' : '☀️';
}
function toggleTheme() { 
    isDark = !isDark; const t = isDark ? 'dark' : 'light'; 
    applyTheme(t); localStorage.setItem('td_theme', t); 
}

let currentFolderId = 'root';
let folderStack = [];
let isGridView = false; 
let ctxTarget = null;
let allFiles = [];
let foldersData = [];
let selectedIds = new Set();
let currentView = 'drive';
let activeUploads = []; 

function formatDate(dateString) {
    if(!dateString) return '--';
    const d = new Date(dateString);
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear().toString().slice(-2)}`;
}

window.addEventListener('DOMContentLoaded', () => {
    applyTheme(localStorage.getItem('td_theme') || 'dark');
    if (sessionStorage.getItem('td_auth') === 'true' || localStorage.getItem('td_token')) { showDrive(); } 
    else { document.getElementById('loadingScreen').style.display='none'; document.getElementById('loginScreen').style.display='flex'; }
    
    setupOTPBoxes();
    
    document.addEventListener('click', (e) => { 
        if(!e.target.closest('.task-panel') && !e.target.closest('.fa-bell')) { const tp = document.getElementById('taskPanel'); if(tp) tp.style.display = 'none'; }
        if(!e.target.closest('.context-menu') && !e.target.closest('.three-dot-btn')) { const ctx = document.getElementById('contextMenu'); if(ctx) ctx.classList.remove('show'); }
    });

    const gridContainer = document.getElementById('fileList');
    if (gridContainer) {
        let isDragging = false; let touchTimer = null; let isTouchSelecting = false;

        gridContainer.addEventListener('mousedown', (e) => {
            const card = e.target.closest('.file-card, .folder-card');
            if (card && !e.target.closest('.select-check') && !e.target.closest('.three-dot-btn')) {
                isDragging = true; document.body.classList.add('is-selecting');
            }
        });
        gridContainer.addEventListener('mouseover', (e) => {
            if (!isDragging) return;
            const card = e.target.closest('.file-card, .folder-card');
            if (card && !selectedIds.has(card.dataset.id)) toggleSelect(card.dataset.id, card, true);
        });
        document.addEventListener('mouseup', () => { isDragging = false; document.body.classList.remove('is-selecting'); });

        gridContainer.addEventListener('touchstart', (e) => {
            const card = e.target.closest('.file-card, .folder-card');
            if (card && !e.target.closest('.select-check') && !e.target.closest('.three-dot-btn')) {
                touchTimer = setTimeout(() => {
                    isTouchSelecting = true; document.body.classList.add('is-selecting');
                    toggleSelect(card.dataset.id, card, true);
                    if (navigator.vibrate) navigator.vibrate(50);
                }, 400); 
            }
        }, { passive: false });

        gridContainer.addEventListener('touchmove', (e) => {
            if (touchTimer) clearTimeout(touchTimer);
            if (isTouchSelecting) {
                e.preventDefault(); 
                const touch = e.touches[0];
                const currentEl = document.elementFromPoint(touch.clientX, touch.clientY);
                if (currentEl) {
                    const card = currentEl.closest('.file-card, .folder-card');
                    if (card && !selectedIds.has(card.dataset.id)) toggleSelect(card.dataset.id, card, true); 
                }
            }
        }, { passive: false });

        gridContainer.addEventListener('touchend', () => { if (touchTimer) clearTimeout(touchTimer); isTouchSelecting = false; document.body.classList.remove('is-selecting'); });
        gridContainer.addEventListener('touchcancel', () => { if (touchTimer) clearTimeout(touchTimer); isTouchSelecting = false; document.body.classList.remove('is-selecting'); });
    }
});

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuBtn = document.getElementById('menuToggleBtn').querySelector('i');
    sidebar.classList.toggle('open'); overlay.classList.toggle('show');
    if (sidebar.classList.contains('open')) { menuBtn.className = "fa-solid fa-xmark"; } else { menuBtn.className = "fa-solid fa-bars"; }
}
function setupOTPBoxes() {
    const boxes = document.querySelectorAll('.otp-box');
    boxes.forEach((box, i) => {
        box.addEventListener('input', () => { box.value = box.value.replace(/\D/g, ''); if (box.value && i < boxes.length - 1) boxes[i + 1].focus(); });
        box.addEventListener('keydown', e => { if (e.key === 'Backspace' && !box.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = ''; } });
    });
}
function togglePass(inputId, iconId) {
    const inp = document.getElementById(inputId), icon = document.getElementById(iconId);
    if(inp.type === 'password') { inp.type = 'text'; icon.className = 'fa-solid fa-eye-slash'; } else { inp.type = 'password'; icon.className = 'fa-solid fa-eye'; }
}
function getHeaders() { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('td_token')}` }; }

function toggleSearchRow() {
    const row = document.getElementById('searchRow');
    row.style.display = row.style.display === 'none' ? 'block' : 'none';
    if (row.style.display === 'block') { document.getElementById('searchInput').focus(); } 
    else { document.getElementById('searchInput').value = ''; currentView === 'drive' ? loadCurrentFolder() : loadTrash(); }
    if(document.getElementById('sidebar').classList.contains('open')) toggleSidebar();
}

async function searchFiles() {
    const q = document.getElementById('searchInput').value.toLowerCase().trim();
    if(!q) { sortFiles(); return; }
    try {
        const res = await fetch('/files/all', { headers: getHeaders() }); const data = await res.json();
        const filtered = data.filter(f => f.name.toLowerCase().includes(q));
        renderItems([], filtered, currentView === 'trash');
    } catch(err) {}
}

async function requestOTP() {
    const username = document.getElementById('usernameInput').value; const password = document.getElementById('passwordInput').value;
    if(!username || !password) return; document.getElementById('loginBtn').innerText = "Sending...";
    try {
        const res = await fetch('/request-otp', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ username, password }) });
        if(res.ok) { document.getElementById('step1').style.display='none'; document.getElementById('step2').style.display='block'; } else { document.getElementById('loginError').innerText = "Invalid Credentials"; }
    } catch { document.getElementById('loginError').innerText = "Network Error"; }
    document.getElementById('loginBtn').innerText = "Continue";
}

async function verifyOTP() {
    const code = Array.from(document.querySelectorAll('.otp-box')).map(b => b.value).join('');
    if(code.length !== 6) return;
    try {
        const res = await fetch('/verify-otp', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ code }) });
        const data = await res.json();
        if(data.success) { localStorage.setItem('td_token', data.token); sessionStorage.setItem('td_auth', 'true'); window.location.reload(); } else { document.getElementById('otpError').innerText = "Wrong OTP"; }
    } catch { document.getElementById('otpError').innerText = "Error verifying OTP"; }
}

function logout() { localStorage.removeItem('td_token'); sessionStorage.removeItem('td_auth'); window.location.reload(); }
function hideLoader() { document.getElementById('loadingScreen').style.display='none'; }
function showLogin() { document.getElementById('loginScreen').style.display='flex'; document.getElementById('driveContent').style.display='none'; }
function showDrive() { hideLoader(); document.getElementById('loginScreen').style.display='none'; document.getElementById('driveContent').style.display='flex'; switchView('drive'); }

function switchView(view) {
    currentView = view; clearSelection();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('settingsArea').style.display = view === 'settings' ? 'block' : 'none';
    document.getElementById('mainToolbar').style.display = view === 'drive' ? 'flex' : 'none';
    document.getElementById('fileList').style.display = view === 'settings' ? 'none' : 'grid';
    
    if(view === 'drive') { document.getElementById('navDrive').classList.add('active'); navigateTo('root', 'My Drive'); } 
    else if(view === 'trash') { document.getElementById('navTrash').classList.add('active'); loadTrash(); document.getElementById('breadcrumb').innerText = "Trash Bin"; } 
    else if(view === 'settings') { document.getElementById('navSettings').classList.add('active'); document.getElementById('breadcrumb').innerText = "Security Settings"; document.getElementById('emptyState').style.display='none'; }
    if(document.getElementById('sidebar').classList.contains('open')) toggleSidebar();
}

function navigateTo(folderId, folderName) {
    if(currentView !== 'drive') return;
    clearSelection();
    if (folderId === 'root') { currentFolderId = 'root'; folderStack = []; } 
    else {
        const idx = folderStack.findIndex(f => f.id === folderId);
        if (idx !== -1) folderStack = folderStack.slice(0, idx + 1); else folderStack.push({ id: folderId, name: folderName });
        currentFolderId = folderId;
    }
    let html = `<span onclick="navigateTo('root')">My Drive</span>`;
    folderStack.forEach((f, i) => {
        html += `<span style="margin: 0 4px; color: gray;">›</span>`;
        if (i === folderStack.length - 1) html += `<span>${f.name}</span>`; else html += `<span style="cursor:pointer" onclick="navigateTo('${f.id}','${f.name}')">${f.name}</span>`;
    });
    document.getElementById('breadcrumb').innerHTML = html;
    loadCurrentFolder();
}

async function loadCurrentFolder() {
    if(currentView !== 'drive') return;
    try {
        const token = localStorage.getItem('td_token'); const headers = token ? getHeaders() : {};
        const [fr, flr] = await Promise.all([ fetch(`/files?folderId=${currentFolderId}`, {headers}), fetch(`/folders?parentId=${currentFolderId}`, {headers}) ]);
        allFiles = await fr.json(); foldersData = await flr.json(); sortFiles(); 
    } catch (e) {}
}

async function loadTrash() {
    try {
        const headers = localStorage.getItem('td_token') ? getHeaders() : {};
        const res = await fetch('/trash', {headers}); const data = await res.json();
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

function getIconStyle(name, isFolder) {
    if(isFolder) return { icon: 'fa-folder', bg: 'icon-folder' };
    const ext = name.split('.').pop().toLowerCase();
    const imgs = ['jpg','jpeg','png','gif','webp']; const vids = ['mp4','mov','mkv'];
    if(imgs.includes(ext)) return { icon: 'fa-image', bg: 'icon-img' };
    if(vids.includes(ext)) return { icon: 'fa-video', bg: 'icon-video' };
    return { icon: 'fa-file-lines', bg: 'icon-file' };
}

function renderItems(folders, files, isTrash) {
    const listEl = document.getElementById('fileList'), emptyEl = document.getElementById('emptyState');
    listEl.className = `file-grid${isGridView ? '' : ' list-view'}`; listEl.innerHTML = '';
    
    if(!folders.length && !files.length) { 
        emptyEl.style.display='flex'; document.getElementById('emptyIcon').className = isTrash ? 'fa-solid fa-trash-can text-5xl' : 'fa-solid fa-folder-open text-5xl text-slate-500'; document.getElementById('emptyTitle').innerText = isTrash ? 'Trash is empty' : 'No files here';
        return; 
    }
    emptyEl.style.display='none';
    
    folders.forEach(f => {
        const d = document.createElement('div'); d.className = `folder-card ${selectedIds.has(f._id)?'selected':''}`; d.dataset.id = f._id;
        const style = getIconStyle(f.name, true);
        d.innerHTML = `
            <div class="select-check">✓</div>
            <div class="ios-item-icon ${style.bg}"><i class="fa-solid ${style.icon}"></i></div>
            <div class="item-details">
                <div class="item-name">${f.name}</div>
                <div class="item-meta">${formatDate(f.createdAt)}</div>
            </div>
            <button class="three-dot-btn" onclick="openMenu(event, '${f._id}', 'folder')"><i class="fa-solid fa-ellipsis-vertical"></i></button>`;
            
        d.querySelector('.select-check').addEventListener('click', (e) => { e.stopPropagation(); toggleSelect(f._id, d); });
        d.addEventListener('click', (e) => { 
            if(e.target.closest('.three-dot-btn')) return; // Ignore click if 3-dot pressed
            if (selectedIds.size > 0) { toggleSelect(f._id, d); } else if(!isTrash) { navigateTo(f._id, f.name); }
        });
        d.addEventListener('contextmenu', e => { e.preventDefault(); openMenu(e, f._id, 'folder'); });
        listEl.appendChild(d);
    });
    
    files.forEach(f => {
        const d = document.createElement('div'); d.className = `file-card ${selectedIds.has(f._id)?'selected':''}`; d.dataset.id = f._id;
        const style = getIconStyle(f.name, false);
        d.innerHTML = `
            <div class="select-check">✓</div>
            <div class="ios-item-icon ${style.bg}"><i class="fa-solid ${style.icon}"></i></div>
            <div class="item-details">
                <div class="item-name">${f.name}</div>
                <div class="item-meta">${formatDate(f.uploadedAt)} - ${f.size || '0 MB'}</div>
            </div>
            <button class="three-dot-btn" onclick="openMenu(event, '${f._id}', 'file')"><i class="fa-solid fa-ellipsis-vertical"></i></button>`;
            
        d.querySelector('.select-check').addEventListener('click', (e) => { e.stopPropagation(); toggleSelect(f._id, d); });
        d.addEventListener('click', (e) => { 
            if(e.target.closest('.three-dot-btn')) return;
            if (selectedIds.size > 0) { toggleSelect(f._id, d); } else if(!isTrash) { previewFile(f); }
        });
        d.addEventListener('contextmenu', e => { e.preventDefault(); openMenu(e, f._id, 'file'); });
        listEl.appendChild(d);
    });
}

function toggleUploadPanel() { const p = document.getElementById('taskPanel'); p.style.display = p.style.display==='none' ? 'block' : 'none'; }
function cancelAllUploads() { activeUploads.forEach(task => task.controller.abort()); document.getElementById('taskPanel').style.display='none'; }

document.getElementById('filePicker')?.addEventListener('change', async e => {
    const files = Array.from(e.target.files); if (!files.length) return;
    document.getElementById('taskBadge').style.display = 'block'; document.getElementById('taskBadge').innerText = files.length;
    const list = document.getElementById('uploadTasksList'); document.getElementById('taskPanel').style.display = 'block';
    
    for(let file of files) {
        const taskId = Date.now() + Math.random(); const controller = new AbortController(); activeUploads.push({ id: taskId, controller });
        const el = document.createElement('div'); el.className = 'task-item'; el.id = `task-${taskId}`;
        el.innerHTML = `<div class="task-header"><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%;">${file.name}</span><button class="btn-ghost" style="padding:2px 6px; font-size:0.6rem; border:none; color:var(--danger)" onclick="cancelUpload('${taskId}')"><i class="fa-solid fa-xmark"></i></button></div><div class="task-meta"><span id="meta-${taskId}">0% • 0 / 0 MB</span><span id="speed-${taskId}" class="task-speed">Connecting...</span></div><div class="task-bar"><div class="task-fill" id="fill-${taskId}"></div></div>`;
        list.appendChild(el);

        const formData = new FormData(); formData.append('myFile', file); formData.append('folderId', currentFolderId); const startTime = Date.now();

        try {
            const xhr = new XMLHttpRequest();
            await new Promise((resolve, reject) => {
                controller.signal.addEventListener('abort', () => { xhr.abort(); reject('Cancelled'); });
                xhr.upload.onprogress = ev => { 
                    if(ev.lengthComputable) {
                        const pct = Math.round((ev.loaded/ev.total)*100); document.getElementById(`fill-${taskId}`).style.width = pct + '%';
                        const loadedMB = (ev.loaded / (1024*1024)).toFixed(1); const totalMB = (ev.total / (1024*1024)).toFixed(1);
                        const timeElapsed = (Date.now() - startTime) / 1000; const speed = timeElapsed > 0 ? (loadedMB / timeElapsed).toFixed(1) : 0;
                        document.getElementById(`meta-${taskId}`).innerText = `${pct}% • ${loadedMB} / ${totalMB} MB`; document.getElementById(`speed-${taskId}`).innerText = `${speed} MB/s`;
                    }
                };
                xhr.onload = () => resolve(xhr.responseText); xhr.onerror = () => reject('Error');
                xhr.open('POST', '/upload'); const token = localStorage.getItem('td_token'); if(token) xhr.setRequestHeader('Authorization', `Bearer ${token}`); xhr.send(formData);
            });
            document.getElementById(`task-${taskId}`).innerHTML = `<span style="color:var(--success); font-size:0.8rem">✓ ${file.name} (Uploaded)</span>`;
        } catch(err) { document.getElementById(`task-${taskId}`).innerHTML = `<span style="color:var(--danger); font-size:0.8rem">✗ ${file.name} (${err})</span>`; }
    }
    setTimeout(loadCurrentFolder, 1000);
});
function cancelUpload(taskId) { const task = activeUploads.find(t => t.id == taskId); if(task) task.controller.abort(); }

// ==========================================
// ⭐ NEW MENU, OPTIONS, AND ACTIONS SYSTEM
// ==========================================

function openMenu(e, id, type) {
    e.stopPropagation(); 
    // Find the actual file or folder data object
    ctxTarget = type === 'folder' ? foldersData.find(x => x._id === id) : allFiles.find(x => x._id === id);
    ctxTarget.type = type; // Manually assign type identifier
    showContextMenu(e);
}

function showContextMenu(e) {
    const menu = document.getElementById('contextMenu'); menu.innerHTML = '';
    const isTrash = currentView === 'trash';
    
    if(isTrash) {
        menu.innerHTML = `<button onclick="restoreItem()"><i class="fa-solid fa-rotate-left text-green-500"></i> Restore</button><hr><button class="danger" onclick="permanentDeleteItem()"><i class="fa-solid fa-trash"></i> Permanent Delete</button>`;
    } else {
        // Detailed Context Menu matching exactly what you asked for
        menu.innerHTML += `<button onclick="showDetailsModal()"><i class="fa-solid fa-circle-info"></i> Details</button>`;
        if(ctxTarget.type === 'file') {
            menu.innerHTML += `<button onclick="previewFile(ctxTarget)"><i class="fa-solid fa-eye text-blue-500"></i> Preview</button>`;
        }
        menu.innerHTML += `<button onclick="openRenameModal()"><i class="fa-solid fa-pen"></i> Rename</button>`;
        menu.innerHTML += `<button onclick="triggerCopy()"><i class="fa-solid fa-copy"></i> Copy</button>`;
        menu.innerHTML += `<button onclick="openMoveModal()"><i class="fa-solid fa-folder-tree"></i> Move</button>`;
        
        if(ctxTarget.type === 'file') {
            const token = localStorage.getItem('td_token');
            const dlUrl = token ? `/download/${ctxTarget._id}?token=${token}` : ctxTarget.url || `/download/${ctxTarget._id}`;
            menu.innerHTML += `<button onclick="window.open('${dlUrl}', '_blank')"><i class="fa-solid fa-download"></i> Download</button>`;
        }
        
        menu.innerHTML += `<hr><button class="danger" onclick="trashItem()"><i class="fa-solid fa-trash"></i> Delete</button>`;
    }
    
    menu.classList.add('show'); 
    // Intelligent Positioning for Mobile / Desktop
    const xPos = e.clientX || (e.touches && e.touches[0].clientX) || 100;
    const yPos = e.clientY || (e.touches && e.touches[0].clientY) || 100;
    menu.style.left = Math.min(xPos, window.innerWidth - 200) + 'px'; 
    menu.style.top = Math.min(yPos, window.innerHeight - 300) + 'px';
}

function showDetailsModal() {
    const d = ctxTarget;
    const content = document.getElementById('detailsContent');
    content.innerHTML = `
        <b>Name:</b> ${d.name}<br>
        <b>Type:</b> ${d.type === 'folder' ? 'Folder' : 'File'}<br>
        ${d.type === 'file' ? `<b>Size:</b> ${d.size || 'Unknown'}<br>` : ''}
        <b>Created/Uploaded:</b> ${formatDate(d.uploadedAt || d.createdAt)}<br>
        <b>ID:</b> <span style="font-size:0.75rem">${d._id}</span>
    `;
    document.getElementById('detailsModal').style.display = 'flex';
}

function triggerCopy() {
    // Note: If you don't have a /copy route backend, this acts as a placeholder
    alert("Copy functionality is currently running on basic mode. Update backend to fully clone Telegram files.");
    document.getElementById('contextMenu').classList.remove('show');
}

async function openMoveModal(isBulk = false) {
    // Fetch all folders to populate the move dropdown
    const res = await fetch('/folders?parentId=root', { headers: getHeaders() }); // Simple flat list for now
    const folders = await res.json();
    const select = document.getElementById('moveFolderSelect');
    select.innerHTML = '<option value="root">My Drive (Root)</option>';
    
    // Add nested logic if needed, currently adding flat level folders
    folders.forEach(f => {
        if(f._id !== currentFolderId && f._id !== (ctxTarget && ctxTarget._id)) {
            select.innerHTML += `<option value="${f._id}">📁 ${f.name}</option>`;
        }
    });
    
    // Attach event for either bulk move or single move
    document.getElementById('moveModal').dataset.bulk = isBulk;
    document.getElementById('moveModal').style.display = 'flex';
}

async function submitMove() {
    const newParentId = document.getElementById('moveFolderSelect').value;
    const isBulk = document.getElementById('moveModal').dataset.bulk === 'true';
    
    document.getElementById('moveModal').style.display = 'none';
    
    if (isBulk) {
        for(let id of selectedIds) {
            const route = allFiles.find(f=>f._id===id) ? 'files' : 'folders';
            await fetch(`/${route}/${id}/move`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ folderId: newParentId }) });
        }
        clearSelection();
    } else {
        const route = ctxTarget.type === 'file' ? `/files/${ctxTarget._id}/move` : `/folders/${ctxTarget._id}/move`;
        await fetch(route, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ folderId: newParentId }) });
    }
    loadCurrentFolder();
}

function previewFile(file) {
    const token = localStorage.getItem('td_token'); const tokenUrl = token ? `/download/${file._id}?token=${token}` : file.url || `/download/${file._id}`;
    const ext = file.name.split('.').pop().toLowerCase();
    const images = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']; const videos = ['mp4', 'webm', 'ogg'];
    const contentBox = document.getElementById('previewContent'); document.getElementById('previewTitle').innerText = file.name;
    
    if(images.includes(ext)) { contentBox.innerHTML = `<img src="${tokenUrl}" class="preview-media">`; } 
    else if(videos.includes(ext)) { contentBox.innerHTML = `<video controls autoplay class="preview-media"><source src="${tokenUrl}"></video>`; } 
    else { contentBox.innerHTML = `<div class="text-center text-white"><i class="fa-solid fa-file-circle-exclamation text-6xl mb-4 text-slate-500"></i><p>Preview not supported.</p><br><a href="${tokenUrl}" target="_blank" class="btn-primary mt-2 inline-flex w-auto px-6" style="text-decoration:none;">Download</a></div>`; }
    document.getElementById('previewModal').style.display = 'flex';
}

function openRenameModal() { document.getElementById('renameInput').value = ctxTarget.name; document.getElementById('renameModal').style.display = 'flex'; document.getElementById('renameInput').focus(); }
async function submitRename() {
    const newName = document.getElementById('renameInput').value.trim();
    if(!newName || newName === ctxTarget.name) { document.getElementById('renameModal').style.display = 'none'; return; }
    const route = ctxTarget.type === 'file' ? `/files/${ctxTarget._id}/rename` : `/folders/${ctxTarget._id}/rename`;
    await fetch(route, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({newName, type: ctxTarget.type}) });
    document.getElementById('renameModal').style.display = 'none'; currentView === 'drive' ? loadCurrentFolder() : loadTrash();
}

function customConfirm(title, callback) { document.getElementById('confirmTitle').innerText = title; document.getElementById('confirmModal').style.display = 'flex'; document.getElementById('confirmYesBtn').onclick = () => { document.getElementById('confirmModal').style.display = 'none'; callback(); }; }
function trashItem() { customConfirm('Move to Trash?', async () => { await fetch(`/${ctxTarget.type}s/${ctxTarget._id}/trash`, { method: 'DELETE', headers: getHeaders() }); loadCurrentFolder(); }); }
function restoreItem() { fetch(`/${ctxTarget.type}s/${ctxTarget._id}/restore`, { method: 'PATCH', headers: getHeaders() }).then(() => loadTrash()); }
function permanentDeleteItem() { customConfirm('Delete Forever?', async () => { await fetch(`/${ctxTarget.type}s/${ctxTarget._id}/permanent`, { method: 'DELETE', headers: getHeaders() }); loadTrash(); }); }
async function changePassword() {
    const currentPass = document.getElementById('currPass').value, newPass = document.getElementById('newPass').value;
    const res = await fetch('/change-password', { method:'POST', headers: getHeaders(), body: JSON.stringify({currentPass, newPass}) }); const data = await res.json();
    if(data.success) { alert("Password Updated!"); document.getElementById('currPass').value=''; document.getElementById('newPass').value=''; } else alert(data.message || "Update Failed");
}

// ⭐ UPDATED ACTION BAR (Multiple Select Options)
function toggleSelect(id, el, forceSelect = false) {
    if (forceSelect) { selectedIds.add(id); el.classList.add('selected'); } 
    else { if (selectedIds.has(id)) { selectedIds.delete(id); el.classList.remove('selected'); } else { selectedIds.add(id); el.classList.add('selected'); } }
    
    const bar = document.getElementById('actionBar');
    bar.style.display = selectedIds.size > 0 ? 'flex' : 'none';
    document.getElementById('selectedCount').innerText = selectedIds.size + ' Selected';
    
    // Now Multi-select will show multiple utility buttons!
    document.getElementById('actionBarTools').innerHTML = currentView === 'trash' 
        ? `<button class="ab-btn" onclick="bulkRestore()">Restore</button><button class="ab-btn danger" onclick="bulkPermanent()">Delete</button>` 
        : `<button class="ab-btn" onclick="bulkDownload()" title="Download All"><i class="fa-solid fa-download"></i></button>
           <button class="ab-btn" onclick="openMoveModal(true)" title="Move All"><i class="fa-solid fa-folder-tree"></i></button>
           <button class="ab-btn danger" onclick="bulkTrash()" title="Delete All"><i class="fa-solid fa-trash"></i></button>`;
}

function clearSelection() { selectedIds.clear(); document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected')); document.getElementById('actionBar').style.display='none'; }
async function bulkTrash() { customConfirm('Trash selected items?', async () => { for(let id of selectedIds) { const route = allFiles.find(f=>f._id===id) ? 'files' : 'folders'; await fetch(`/${route}/${id}/trash`, {method:'DELETE', headers:getHeaders()}); } clearSelection(); loadCurrentFolder(); }); }
async function bulkRestore() { for(let id of selectedIds) { const route = allFiles.find(f=>f._id===id) ? 'files' : 'folders'; await fetch(`/${route}/${id}/restore`, {method:'PATCH', headers:getHeaders()}); } clearSelection(); loadTrash(); }
async function bulkPermanent() { customConfirm('Delete permanently?', async () => { for(let id of selectedIds) { const route = allFiles.find(f=>f._id===id) ? 'files' : 'folders'; await fetch(`/${route}/${id}/permanent`, {method:'DELETE', headers:getHeaders()}); } clearSelection(); loadTrash(); }); }
async function bulkDownload() {
    const token = localStorage.getItem('td_token');
    for (let id of selectedIds) {
        if(allFiles.find(f=>f._id===id)) {
            const dlUrl = token ? `/download/${id}?token=${token}` : `/download/${id}`;
            window.open(dlUrl, '_blank');
        }
    }
    clearSelection();
}
async function createFolder() { const n = prompt('Folder Name:'); if(n) { await fetch('/folders', {method:'POST', headers:getHeaders(), body:JSON.stringify({name:n, parentId:currentFolderId})}); loadCurrentFolder(); } }
function toggleView() { isGridView = !isGridView; sortFiles(); }
