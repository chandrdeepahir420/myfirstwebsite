// ==========================================
// 1. GLOBAL VARIABLES & THEME CONFIG
// ==========================================
let isDark = true;
let currentFolderId = 'root';
let folderStack = [];
let isGridView = false; 
let ctxTarget = null;
let allFiles = [];
let foldersData = [];
let selectedIds = new Set();
let currentView = 'drive';
let activeUploads = []; 
let currentPage = 1;
let isLoading = false;
let hasMore = true;

function applyTheme(t) {
    isDark = t === 'dark'; document.body.className = t;
    const icon2 = document.getElementById('themeIconSidebar');
    if (icon2) icon2.textContent = isDark ? '🌙' : '☀️';
}
function toggleTheme() { 
    isDark = !isDark; const t = isDark ? 'dark' : 'light'; 
    applyTheme(t); localStorage.setItem('td_theme', t); 
}

// Register Service Worker for Caching
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker Registered! Files will now cache.'))
            .catch(err => console.log('SW Registration Failed:', err));
    });
}

function formatDate(dateString) {
    if(!dateString) return '--';
    const d = new Date(dateString);
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear().toString().slice(-2)}`;
}

// ==========================================
// 2. CORE FUNCTIONS (Data Loading)
// ==========================================

async function loadCurrentFolder() {
    if(currentView !== 'drive') return;
    
    // Reset pagination
    currentPage = 1;
    hasMore = true;
    allFiles = [];
    
    try {
        const token = localStorage.getItem('td_token'); 
        const headers = token ? getHeaders() : {};
        
        // FOLDER aur FILES dono ko specific currentFolderId ke saath fetch karein
        const [filesRes, foldersRes] = await Promise.all([ 
            fetch(`/files?folderId=${currentFolderId}&page=1&limit=100`, {headers}), 
            fetch(`/folders?parentId=${currentFolderId}`, {headers}) 
        ]);
        
        allFiles = await filesRes.json(); 
        foldersData = await foldersRes.json(); 
        
        // Render both
        renderItems(foldersData, allFiles, false); 
    } catch (e) { 
        console.error("Load Error:", e); 
    }
}
async function loadMoreItems() {
    // CRITICAL TRASH BYPASS: Agar view drive nahi hai, toh scroll pagination kaam nahi karega
    if (currentView !== 'drive') return;
    
    if (isLoading || !hasMore) return;
    isLoading = true;
    
    try {
        const token = localStorage.getItem('td_token');
        const res = await fetch(`/files?folderId=${currentFolderId}&page=${currentPage + 1}&limit=100`, { headers: token ? getHeaders() : {} });
        const newFiles = await res.json();
        
        if (newFiles.length < 100) hasMore = false;
        allFiles = [...allFiles, ...newFiles];
        
        renderItems([], newFiles, false); 
        currentPage++;
    } catch(e) { console.error(e); }
    isLoading = false;
}
async function loadTrash() {
    try {
        const token = localStorage.getItem('td_token');
        const headers = token ? getHeaders() : {};
        
        const res = await fetch('/trash', { headers }); 
        const data = await res.json();
        
        // Trash ka data set karein
        allFiles = data.files || []; 
        foldersData = data.folders || []; 
        
        // Direct sorting aur safe rendering call bina pagination interference ke
        sortFiles(true);
    } catch (e) {
        console.error("Trash Load Error:", e);
    }
}
// ==========================================
// 3. INITIALIZATION (DOM Ready & Events)
// ==========================================

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
        gridContainer.addEventListener('scroll', (e) => {
            if (gridContainer.scrollTop + gridContainer.clientHeight >= gridContainer.scrollHeight - 100) {
                loadMoreItems();
            }
        });

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

// ==========================================
// 4. UI COMPONENTS & NAVIGATION
// ==========================================

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
    currentView = view; 
    clearSelection();
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('settingsArea').style.display = view === 'settings' ? 'block' : 'none';
    document.getElementById('mainToolbar').style.display = view === 'drive' ? 'flex' : 'none';
    document.getElementById('fileList').style.display = view === 'settings' ? 'none' : 'grid';
    
    // Reset list layout container html before loading view
    const listEl = document.getElementById('fileList');
    if (listEl) listEl.innerHTML = ''; 

    if (view === 'drive') { 
        document.getElementById('navDrive').classList.add('active'); 
        navigateTo('root', 'My Drive'); 
    } 
    else if (view === 'trash') { 
        document.getElementById('navTrash').classList.add('active'); 
        document.getElementById('breadcrumb').innerText = "Trash Bin";
        
        // Trash ke liye pagination bypass indicators
        currentPage = 1;
        hasMore = false; // Isse background scroll load ruk jayega trash view mein
        
        loadTrash(); 
    } 
    else if (view === 'settings') { 
        document.getElementById('navSettings').classList.add('active'); 
        document.getElementById('breadcrumb').innerText = "Security Settings"; 
        document.getElementById('emptyState').style.display = 'none'; 
    }
    if (document.getElementById('sidebar').classList.contains('open')) toggleSidebar();
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

// ==========================================
// 5. RENDERING & SORTING
// ==========================================

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
    const docs = ['pdf', 'txt'];
    if(imgs.includes(ext)) return { icon: 'fa-image', bg: 'icon-img' };
    if(vids.includes(ext)) return { icon: 'fa-video', bg: 'icon-video' };
    if(docs.includes(ext)) return { icon: 'fa-file-pdf', bg: 'icon-file' };
    return { icon: 'fa-file-lines', bg: 'icon-file' };
}

function renderItems(folders, files, isTrash) {
    const listEl = document.getElementById('fileList');
    const emptyEl = document.getElementById('emptyState');
    
    if (!listEl) return;

    // CRITICAL FIX 1: Jab bhi ye function chale, sabse pehle purana saara content screen se saaf karo!
    listEl.innerHTML = '';
    listEl.className = `file-grid${isGridView ? '' : ' list-view'}`; 
    
    // CRITICAL FIX 2: Agar folders aur files dono hi empty hain (Empty Folder Case)
    if (!folders.length && !files.length) { 
        if (emptyEl) {
            emptyEl.style.display = 'flex'; 
            
            // Flexbox centering grid element ke upar rely karegi
            document.getElementById('emptyIcon').className = isTrash 
                ? 'fa-solid fa-trash-can text-5xl' 
                : 'fa-solid fa-folder-open text-5xl text-slate-500'; 
                
            document.getElementById('emptyTitle').innerText = isTrash 
                ? 'Trash is empty' 
                : 'No files here';
        }
        return; // Function ko yahin rok do taaki neeche kuch render na ho
    }
    
    // Agar data hai, toh empty state ko chupa do
    if (emptyEl) emptyEl.style.display = 'none';
    
    // 📁 FOLDERS RENDER ENGINE
    folders.forEach(f => {
        const d = document.createElement('div'); 
        d.className = `folder-card ${selectedIds.has(f._id) ? 'selected' : ''}`; 
        d.dataset.id = f._id;
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
            if (e.target.closest('.three-dot-btn')) return; 
            if (selectedIds.size > 0) { toggleSelect(f._id, d); } else if (!isTrash) { navigateTo(f._id, f.name); }
        });
        d.addEventListener('contextmenu', e => { e.preventDefault(); openMenu(e, f._id, 'folder'); });
        listEl.appendChild(d);
    });
    
    // 📄 FILES RENDER ENGINE
    files.forEach(f => {
        const d = document.createElement('div'); 
        d.className = `file-card ${selectedIds.has(f._id) ? 'selected' : ''}`; 
        d.dataset.id = f._id;
        const style = getIconStyle(f.name, false);
        
        const ext = f.name.split('.').pop().toLowerCase();
        const images = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
        const token = localStorage.getItem('td_token');
        
        let mediaContent = `<i class="fa-solid ${style.icon}"></i>`; 
        
        if (images.includes(ext)) {
            mediaContent = `<img src="/download/${f._id}?token=${token}" loading="lazy" alt="thumbnail" style="width:100%; height:100%; object-fit:cover;">`;
        } 

        d.innerHTML = `
            <div class="select-check">✓</div>
            <div class="ios-item-icon ${style.bg}">${mediaContent}</div>
            <div class="item-details">
                <div class="item-name">${f.name}</div>
                <div class="item-meta">${formatDate(f.uploadedAt)} - ${f.size || '0 MB'}</div>
            </div>
            <button class="three-dot-btn" onclick="openMenu(event, '${f._id}', 'file')"><i class="fa-solid fa-ellipsis-vertical"></i></button>`;
            
        d.querySelector('.select-check').addEventListener('click', (e) => { e.stopPropagation(); toggleSelect(f._id, d); });
        d.addEventListener('click', (e) => { 
            if (e.target.closest('.three-dot-btn')) return;
            if (selectedIds.size > 0) { toggleSelect(f._id, d); } else if (!isTrash) { previewFile(f); }
        });
        d.addEventListener('contextmenu', e => { e.preventDefault(); openMenu(e, f._id, 'file'); });
        listEl.appendChild(d);
    });
}
function toggleView() { isGridView = !isGridView; listEl = document.getElementById('fileList'); listEl.innerHTML = ''; sortFiles(); }

// ==========================================
// 6. FILE UPLOADING
// ==========================================

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
// 7. FILE UTILITIES & ROBUST DOWNLOAD ENGINE
// ==========================================

// FIX: upgraded download engine using blob generation to guarantee proper extensions and file names without errors.
async function triggerDownload(fileId) {
    const file = allFiles.find(f => f._id === fileId) || ctxTarget;
    if (!file) return;

    const token = localStorage.getItem('td_token');
    const dlUrl = token ? `/download/${fileId}?token=${token}` : `/download/${fileId}`;
    
    document.getElementById('contextMenu').classList.remove('show');
    
    try {
        const response = await fetch(dlUrl);
        if (!response.ok) throw new Error("Download server error.");
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.style.display = 'none';
        document.body.appendChild(a);
        
        a.click();
        
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error("Download Failed:", error);
        const fallbackA = document.createElement('a');
        fallbackA.href = dlUrl;
        fallbackA.target = "_blank";
        document.body.appendChild(fallbackA);
        fallbackA.click();
        document.body.removeChild(fallbackA);
    }
}

// CRITICAL FIX: Ensuring ctxTarget maps perfectly from the array
function openMenu(e, id, type) {
    e.stopPropagation(); 
    
    // Strict lookup based on type
    if (type === 'folder') {
        ctxTarget = foldersData.find(x => x._id === id);
    } else {
        ctxTarget = allFiles.find(x => x._id === id);
    }
    
    if (!ctxTarget) {
        console.error(`Could not find ${type} data for ID: ${id}`);
        return;
    }
    
    ctxTarget.type = type; // Enforce type injection ('file' or 'folder')
    showContextMenu(e);
}

function showContextMenu(e) {
    const menu = document.getElementById('contextMenu'); 
    if (!menu) return;
    
    menu.innerHTML = '';
    const isTrash = currentView === 'trash';
    
    if (isTrash) {
        menu.innerHTML = `
            <button onclick="restoreItem()"><i class="fa-solid fa-rotate-left text-green-500"></i> Restore</button>
            <hr>
            <button class="danger" onclick="permanentDeleteItem()"><i class="fa-solid fa-trash"></i> Permanent Delete</button>`;
    } else {
        menu.innerHTML += `<button onclick="showDetailsModal()"><i class="fa-solid fa-circle-info"></i> Details</button>`;
        if (ctxTarget.type === 'file') {
            menu.innerHTML += `<button onclick="previewFile(ctxTarget)"><i class="fa-solid fa-eye text-blue-500"></i> Preview</button>`;
        }
        menu.innerHTML += `<button onclick="openRenameModal()"><i class="fa-solid fa-pen"></i> Rename</button>`;
        menu.innerHTML += `<button onclick="triggerCopy()"><i class="fa-solid fa-copy"></i> Copy</button>`;
        menu.innerHTML += `<button onclick="openMoveModal(true)"><i class="fa-solid fa-folder-tree"></i> Move</button>`;
        
        if (ctxTarget.type === 'file') {
            menu.innerHTML += `<button onclick="triggerDownload('${ctxTarget._id}')"><i class="fa-solid fa-download"></i> Download</button>`;
        }
        
        // CRITICAL FIX: Explicitly binds trashItem handler
        menu.innerHTML += `<hr><button class="danger" onclick="trashItem()"><i class="fa-solid fa-trash"></i> Delete</button>`;
    }
    
    menu.classList.add('show'); 
    const xPos = e.clientX || (e.touches && e.touches[0].clientX) || 100;
    const yPos = e.clientY || (e.touches && e.touches[0].clientY) || 100;
    menu.style.left = Math.min(xPos, window.innerWidth - 200) + 'px'; 
    menu.style.top = Math.min(yPos, window.innerHeight - 300) + 'px';
}
function showDetailsModal() {
    const d = ctxTarget; const content = document.getElementById('detailsContent');
    content.innerHTML = `<b>Name:</b> ${d.name}<br><b>Type:</b> ${d.type === 'folder' ? 'Folder' : 'File'}<br>${d.type === 'file' ? `<b>Size:</b> ${d.size || 'Unknown'}<br>` : ''}<b>Uploaded:</b> ${formatDate(d.uploadedAt || d.createdAt)}<br><b>ID:</b> <span style="font-size:0.75rem">${d._id}</span>`;
    document.getElementById('detailsModal').style.display = 'flex';
}
function triggerCopy() { alert("Copy link generated!"); document.getElementById('contextMenu').classList.remove('show'); }

async function openMoveModal(isBulk = false) {
    const res = await fetch('/folders?parentId=root', { headers: getHeaders() });
    const folders = await res.json();
    const select = document.getElementById('moveFolderSelect');
    select.innerHTML = '<option value="root">My Drive (Root)</option>';
    
    folders.forEach(f => {
        if(f._id !== currentFolderId && f._id !== (ctxTarget && ctxTarget._id)) { select.innerHTML += `<option value="${f._id}">📁 ${f.name}</option>`; }
    });
    
    document.getElementById('moveModal').dataset.bulk = isBulk; document.getElementById('moveModal').style.display = 'flex';
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
    const token = localStorage.getItem('td_token');
    const tokenUrl = token ? `/download/${file._id}?token=${token}` : `/download/${file._id}`;
    
    const ext = file.name.split('.').pop().toLowerCase();
    const images = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const videos = ['mp4', 'webm', 'ogg'];
    const docs = ['pdf', 'txt'];
    
    const contentBox = document.getElementById('previewContent');
    document.getElementById('previewTitle').innerText = file.name;
    
    contentBox.innerHTML = `<div class="loader-ring" style="width:50px; height:50px; border-top-color:var(--accent);"></div>`;
    document.getElementById('previewModal').style.display = 'flex';
    
    if (images.includes(ext)) { 
        const img = new Image();
        img.src = tokenUrl;
        img.className = 'preview-media';
        img.onload = () => { contentBox.innerHTML = ''; contentBox.appendChild(img); };
        img.onerror = () => { contentBox.innerHTML = `<p style="color:white;">Failed to load image.</p>`; };
    } 
    else if (videos.includes(ext)) { 
        contentBox.innerHTML = `<video controls autoplay class="preview-media" src="${tokenUrl}"></video>`; 
    } 
    else if (docs.includes(ext)) {
        contentBox.innerHTML = `<iframe src="${tokenUrl}" class="preview-media" style="width:100%; height:100%; background:white; border-radius:8px;"></iframe>`;
    }
    else { 
        contentBox.innerHTML = `
        <div class="text-center text-white">
            <i class="fa-solid fa-file-circle-exclamation text-6xl mb-4 text-slate-500"></i>
            <p>Preview not supported for .${ext}</p><br>
            <button onclick="triggerDownload('${file._id}')" class="btn-primary mt-2 inline-flex w-auto px-6" style="border:none;">Download File</button>
        </div>`; 
    }
}

function openRenameModal() { document.getElementById('renameInput').value = ctxTarget.name; document.getElementById('renameModal').style.display = 'flex'; document.getElementById('renameInput').focus(); }
async function submitRename() {
    const newName = document.getElementById('renameInput').value.trim();
    if(!newName || newName === ctxTarget.name) { document.getElementById('renameModal').style.display = 'none'; return; }
    const route = ctxTarget.type === 'file' ? `/files/${ctxTarget._id}/rename` : `/folders/${ctxTarget._id}/rename`;
    await fetch(route, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({newName, type: ctxTarget.type}) });
    document.getElementById('renameModal').style.display = 'none'; currentView === 'drive' ? loadCurrentFolder() : loadTrash();
}

function customConfirm(title, callback) { 
    const modal = document.getElementById('confirmModal');
    if (modal) {
        document.getElementById('confirmTitle').innerText = title; 
        modal.style.display = 'flex'; 
        document.getElementById('confirmYesBtn').onclick = () => { 
            modal.style.display = 'none'; 
            callback(); 
        }; 
    } else {
        if (confirm(title)) callback();
    }
}

// CRITICAL FIX: Absolute error handling and endpoint mapping
async function trashItem() { 
    if (!ctxTarget || !ctxTarget._id || !ctxTarget.type) {
        alert("System Error: Item target is missing. Check console.");
        console.error("Target missing context data:", ctxTarget);
        return;
    }
    
    document.getElementById('contextMenu').classList.remove('show');

    customConfirm('Move to Trash?', async () => { 
        try {
            // Checks type dynamically and converts to plurals (/files/ or /folders/)
            const endpointType = ctxTarget.type === 'file' ? 'files' : 'folders';
            const route = `/${endpointType}/${ctxTarget._id}/trash`;
            
            console.log(`Attempting delete via route: ${route}`); // Debugger line
            
            const res = await fetch(route, { 
                method: 'DELETE', 
                headers: getHeaders() 
            });

            const responseData = await res.json();
            
            if (res.ok && responseData.success) {
                loadCurrentFolder(); 
            } else {
                alert(`Server Error: ${responseData.error || "Could not move to trash."}`);
            }
        } catch (err) {
            console.error("Critical Network Trash Error:", err);
            alert("Network connectivity issue. Failed to sync delete.");
        }
    }); 
}
function restoreItem() { 
    const endpointType = ctxTarget.type === 'file' ? 'files' : 'folders';
    fetch(`/${endpointType}/${ctxTarget._id}/restore`, { method: 'PATCH', headers: getHeaders() }).then(() => loadTrash()); 
}
function permanentDeleteItem() { 
    const endpointType = ctxTarget.type === 'file' ? 'files' : 'folders';
    customConfirm('Delete Forever?', async () => { 
        await fetch(`/${endpointType}/${ctxTarget._id}/permanent`, { method: 'DELETE', headers: getHeaders() }); 
        loadTrash(); 
    }); 
}
async function changePassword() {
    const currentPass = document.getElementById('currPass').value, newPass = document.getElementById('newPass').value;
    const res = await fetch('/change-password', { method:'POST', headers: getHeaders(), body: JSON.stringify({currentPass, newPass}) }); const data = await res.json();
    if(data.success) { alert("Password Updated!"); document.getElementById('currPass').value=''; document.getElementById('newPass').value=''; } else alert(data.message || "Update Failed");
}

function toggleSelect(id, el, forceSelect = false) {
    if (forceSelect) { selectedIds.add(id); el.classList.add('selected'); } 
    else { if (selectedIds.has(id)) { selectedIds.delete(id); el.classList.remove('selected'); } else { selectedIds.add(id); el.classList.add('selected'); } }
    
    const bar = document.getElementById('actionBar');
    bar.style.display = selectedIds.size > 0 ? 'flex' : 'none';
    document.getElementById('selectedCount').innerText = selectedIds.size + ' Selected';
    
    document.getElementById('actionBarTools').innerHTML = currentView === 'trash' 
        ? `<button class="ab-btn" onclick="bulkRestore()">Restore</button><button class="ab-btn danger" onclick="bulkPermanent()">Delete</button>` 
        : `<button class="ab-btn" onclick="bulkDownload()" title="Download All"><i class="fa-solid fa-download"></i></button>
           <button class="ab-btn" onclick="openMoveModal(true)" title="Move All"><i class="fa-solid fa-folder-tree"></i></button>
           <button class="ab-btn danger" onclick="bulkTrash()" title="Delete All"><i class="fa-solid fa-trash"></i></button>`;
}

function clearSelection() { selectedIds.clear(); document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected')); document.getElementById('actionBar').style.display='none'; }
async function bulkTrash() { 
    if (selectedIds.size === 0) return;

    customConfirm('Trash selected items?', async () => { 
        try {
            for(let id of selectedIds) {
                // Check karein ki item file hai ya folder
                const isFile = allFiles.find(f => f._id === id);
                const route = isFile ? `/files/${id}/trash` : `/folders/${id}/trash`;
                
                await fetch(route, { 
                    method: 'DELETE', 
                    headers: getHeaders() 
                }); 
            }
            clearSelection(); 
            loadCurrentFolder(); 
        } catch (err) {
            console.error("Bulk Trash Error:", err);
        }
    }); 
}
async function bulkRestore() { for(let id of selectedIds) { const route = allFiles.find(f=>f._id===id) ? 'files' : 'folders'; await fetch(`/${route}/${id}/restore`, {method:'PATCH', headers:getHeaders()}); } clearSelection(); loadTrash(); }
async function bulkPermanent() { customConfirm('Delete permanently?', async () => { for(let id of selectedIds) { const route = allFiles.find(f=>f._id===id) ? 'files' : 'folders'; await fetch(`/${route}/${id}/permanent`, {method:'DELETE', headers:getHeaders()}); } clearSelection(); loadTrash(); }); }

async function bulkDownload() {
    for (let id of selectedIds) {
        if(allFiles.find(f => f._id === id)) {
            triggerDownload(id);
        }
    }
    clearSelection();
}

async function createFolder() { const n = prompt('Folder Name:'); if(n) { await fetch('/folders', {method:'POST', headers:getHeaders(), body:JSON.stringify({name:n, parentId:currentFolderId})}); loadCurrentFolder(); } }
