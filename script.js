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
let autoScrollFrame = null;
let scrollSpeedY = 0;
let autoSelectX = 0; // Ungli ka X track karne ke liye
let autoSelectY = 0; // Ungli ka Y track karne ke liye
let isAutoSelecting = false;

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
// ⭐ THUMBNAIL FALLBACK HANDLER ⭐
// ==========================================
function handleThumbError(imgElement, isVideo) {
    // 1. Broken image ko hide kar do
    imgElement.style.display = 'none';
    
    // 2. Image ke parent box (ios-item-icon) ko pakdo
    const parent = imgElement.parentElement;
    
    // 3. File type ke hisaab se CSS class aur Icon laga do
    if (isVideo) {
        parent.className = 'ios-item-icon icon-video';
        parent.innerHTML = '<i class="fa-solid fa-film"></i>';
    } else {
        parent.className = 'ios-item-icon icon-img';
        parent.innerHTML = '<i class="fa-solid fa-image"></i>';
    }
}

// ==========================================
// ⭐ EDGE AUTO-SCROLL ENGINE (DRAG TO SELECT) ⭐
// ==========================================
// ==========================================
// ⭐ ADVANCED EDGE AUTO-SCROLL ENGINE ⭐
// ==========================================

function handleDragScroll(clientX, clientY, isSelecting = false) {
    autoSelectX = clientX;
    autoSelectY = clientY;
    isAutoSelecting = isSelecting;

    const edgeMargin = 100; 
    const maxSpeed = 25; 
    const viewportHeight = window.innerHeight;

    if (clientY < edgeMargin) {
        let intensity = (edgeMargin - clientY) / edgeMargin;
        scrollSpeedY = -(maxSpeed * intensity);
    } else if (clientY > viewportHeight - edgeMargin) {
        let intensity = (edgeMargin - (viewportHeight - clientY)) / edgeMargin;
        scrollSpeedY = (maxSpeed * intensity);
    } else {
        stopDragScroll();
        return;
    }

    if (!autoScrollFrame) {
        autoScrollLoop();
    }
}

function autoScrollLoop() {
    if (scrollSpeedY !== 0) {
        const gridContainer = document.getElementById('fileList');
        if (gridContainer) {
            gridContainer.scrollTop += scrollSpeedY;

            // ⭐ THE MAGIC: Bulletproof Anti-Skip Selection ⭐
            if (isAutoSelecting) {
                let checkY = autoSelectY;
                
                // Sensor ko bottom bar se aur thoda upar rakhein (150px) 
                // Taaki kisi bhi UI element ka z-index use block na kare
                const bottomLimit = window.innerHeight - 150; 
                const topLimit = 120;
                
                if (checkY > bottomLimit) checkY = bottomLimit;
                if (checkY < topLimit) checkY = topLimit;

                // Gap Skipping se bachne ke liye hum ungli ke aas-paas 3 points check karenge
                // (Center, aur uske 30px left aur right)
                const checkPointsX = [autoSelectX, autoSelectX - 30, autoSelectX + 30];
                
                for (let px of checkPointsX) {
                    // Screen se bahar ke points ignore karein
                    if (px > 0 && px < window.innerWidth) {
                        const currentEl = document.elementFromPoint(px, checkY);
                        if (currentEl) {
                            const card = currentEl.closest('.file-card, .folder-card');
                            if (card && !selectedIds.has(card.dataset.id)) {
                                toggleSelect(card.dataset.id, card, true);
                            }
                        }
                    }
                }
            }
        }
        autoScrollFrame = requestAnimationFrame(autoScrollLoop);
    } else {
        stopDragScroll();
    }
}
function stopDragScroll() {
    if (autoScrollFrame) {
        cancelAnimationFrame(autoScrollFrame);
        autoScrollFrame = null;
    }
    scrollSpeedY = 0;
    isAutoSelecting = false; // Reset
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

    // ==========================================
    // ⭐ INSTANT LOADING SPINNER LOGIC ⭐
    // ==========================================
    const listEl = document.getElementById('fileList');
    const emptyEl = document.getElementById('emptyState');
    
    if (listEl) {
        // Agar empty state icon dikh raha hai toh use turant chhupa do
        if (emptyEl) emptyEl.style.display = 'none';
        
        // Grid layout hatakar list-view lagao taaki spinner center mein aaye
        listEl.className = 'file-grid list-view'; 
        
        // Turant ghoomta hua spinner screen par daal do (Bina 1 sec wait kiye)
        listEl.innerHTML = `
            <div style="width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; color: var(--accent); animation: fadeIn 0.2s ease;">
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2.5rem; margin-bottom: 15px;"></i>
                <p style="color: var(--text-muted); font-size: 1rem; font-weight: 500;">Loading folder...</p>
            </div>
        `;
    }
    // ==========================================
    
    try {
        const token = localStorage.getItem('td_token'); 
        const headers = token ? getHeaders() : {};
        
        // API Calls (Isme thoda time lagega, tab tak spinner ghoomta rahega)
        const [filesRes, foldersRes] = await Promise.all([ 
            fetch(`/files?folderId=${currentFolderId}&page=1&limit=100`, {headers}), 
            fetch(`/folders?parentId=${currentFolderId}`, {headers}) 
        ]);
        
        allFiles = await filesRes.json(); 
        foldersData = await foldersRes.json(); 
        
        // Data aate hi renderItems chalega aur spinner ko overwrite kar dega
        renderItems(foldersData, allFiles, false); 
    } catch (e) { 
        console.error("Load Error:", e); 
        
        // Agar internet band hai ya error aayi, toh error message dikhao
        if (listEl) {
            listEl.innerHTML = `
                <div style="width: 100%; text-align: center; padding: 50px; color: var(--danger);">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem;"></i>
                    <p style="margin-top: 15px; font-weight: 500;">Failed to load folder. Please check your internet connection.</p>
                </div>
            `;
        }
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
        // Scroll Pagination
        gridContainer.addEventListener('scroll', (e) => {
            if (gridContainer.scrollTop + gridContainer.clientHeight >= gridContainer.scrollHeight - 100) {
                loadMoreItems();
            }
        });

        // ==========================================
        // ⭐ VARIABLES (Drag & Zoom Dono Ke Liye) ⭐
        // ==========================================
        let isDragging = false; 
        let touchTimer = null; 
        let isTouchSelecting = false;

        let initialPinchDistance = 0;
        let currentGridCols = localStorage.getItem('td_grid_cols') ? parseInt(localStorage.getItem('td_grid_cols')) : 3;
        const MIN_COLS = 2; // Max Zoom IN
        const MAX_COLS = 6; // Max Zoom OUT
        let zoomCooldown = false;

        // Start mein default grid size set karein
        document.documentElement.style.setProperty('--grid-cols', currentGridCols);

        // Zoom Helper Function
        function applyGridZoom() {
            document.documentElement.style.setProperty('--grid-cols', currentGridCols);
            localStorage.setItem('td_grid_cols', currentGridCols);
            if (navigator.vibrate) navigator.vibrate(40);
        }

        // 🖱️ MOUSE EVENTS (PC)
        gridContainer.addEventListener('mousedown', (e) => {
            const card = e.target.closest('.file-card, .folder-card');
            if (card && !e.target.closest('.select-check') && !e.target.closest('.three-dot-btn')) {
                isDragging = true; document.body.classList.add('is-selecting');
            }
        });

        gridContainer.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const currentEl = document.elementFromPoint(e.clientX, e.clientY);
                if (currentEl) {
                    const card = currentEl.closest('.file-card, .folder-card');
                    if (card && !selectedIds.has(card.dataset.id)) toggleSelect(card.dataset.id, card, true); 
                }
                handleDragScroll(e.clientX, e.clientY, true);
            }
        });

        gridContainer.addEventListener('mouseover', (e) => {
            if (!isDragging) return;
            const card = e.target.closest('.file-card, .folder-card');
            if (card && !selectedIds.has(card.dataset.id)) toggleSelect(card.dataset.id, card, true);
        });

        document.addEventListener('mouseup', () => { 
            isDragging = false; document.body.classList.remove('is-selecting'); 
            stopDragScroll(); 
        });

        // 📱 TOUCH EVENTS (MOBILE) - DRAG & ZOOM MERGED
        gridContainer.addEventListener('touchstart', (e) => {
            // ⭐ ZOOM CHECK: Agar 2 ungliyan hain toh Zoom start karo
            if (e.touches.length === 2) {
                if (touchTimer) clearTimeout(touchTimer); // Selection timer rok do
                isTouchSelecting = false; document.body.classList.remove('is-selecting');
                
                initialPinchDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                return; // Yahin se wapas mud jao, single touch wala code mat chalao
            }

            // ⭐ DRAG CHECK: Agar 1 ungli hai toh Selection timer start karo
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
            // ⭐ ZOOM ACTION (2 Fingers)
            if (e.touches.length === 2 && !gridContainer.classList.contains('list-view')) {
                e.preventDefault(); 
                if (touchTimer) clearTimeout(touchTimer);
                
                if (zoomCooldown) return;

                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const diff = currentDistance - initialPinchDistance;

                if (Math.abs(diff) > 45) {
                    if (diff > 0 && currentGridCols > MIN_COLS) { currentGridCols--; applyGridZoom(); } 
                    else if (diff < 0 && currentGridCols < MAX_COLS) { currentGridCols++; applyGridZoom(); }

                    initialPinchDistance = currentDistance; zoomCooldown = true;
                    setTimeout(() => zoomCooldown = false, 300);
                }
                return; // Zoom ho gaya, ab aage ka code mat chalao
            }

            // ⭐ DRAG ACTION (1 Finger Selection)
            if (touchTimer) clearTimeout(touchTimer);
            if (isTouchSelecting) {
                e.preventDefault(); 
                const touch = e.touches[0];
                
                let checkX = touch.clientX;
                let checkY = touch.clientY;
                
                const bottomLimit = window.innerHeight - 110; 
                if (checkY > bottomLimit) checkY = bottomLimit; 
                
                const topLimit = 100;
                if (checkY < topLimit) checkY = topLimit;

                const currentEl = document.elementFromPoint(checkX, checkY);
                if (currentEl) {
                    const card = currentEl.closest('.file-card, .folder-card');
                    if (card && !selectedIds.has(card.dataset.id)) toggleSelect(card.dataset.id, card, true); 
                }
                
                handleDragScroll(touch.clientX, touch.clientY, true);
            }
        }, { passive: false });
        
        gridContainer.addEventListener('touchend', () => { 
            if (touchTimer) clearTimeout(touchTimer); 
            isTouchSelecting = false; document.body.classList.remove('is-selecting'); 
            stopDragScroll(); 
        });
        
        gridContainer.addEventListener('touchcancel', () => { 
            if (touchTimer) clearTimeout(touchTimer); 
            isTouchSelecting = false; document.body.classList.remove('is-selecting'); 
            stopDragScroll(); 
        });
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
        // 'no-store' browser ko bolta hai ki cache use mat karo, direct server se fresh data lao
        const res = await fetch('/files/all', { 
            headers: getHeaders(),
            cache: 'no-store' 
        }); 
        
        const data = await res.json();
        const filtered = data.filter(f => f.name.toLowerCase().includes(q));
        renderItems([], filtered, currentView === 'trash');
    } catch(err) {
        console.error("Search fetch error:", err);
    }
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
function showDrive() { 
    hideLoader(); 
    document.getElementById('loginScreen').style.display = 'none'; 
    document.getElementById('driveContent').style.display = 'flex'; 
    switchView('drive'); 
    
    // ⭐ NAYA UPDATE: OTP login ke baad Security Setup Popup trigger karne ke liye
    checkAndPromptSecurity(); 
}
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
    
    if (folderId === 'root') { 
        currentFolderId = 'root'; 
        folderStack = []; 
    } else {
        const idx = folderStack.findIndex(f => f.id === folderId);
        if (idx !== -1) folderStack = folderStack.slice(0, idx + 1); 
        else folderStack.push({ id: folderId, name: folderName });
        currentFolderId = folderId;
    }
    
    // Windows Style Interactive Breadcrumb HTML Generation
    let html = `<span class="path-link" onclick="navigateTo('root')"><i class="fa-solid fa-hard-drive"></i> My Drive</span>`;
    
    folderStack.forEach((f, i) => {
        html += `<span class="path-separator"><i class="fa-solid fa-chevron-right"></i></span>`;
        if (i === folderStack.length - 1) {
            // Aakhiri folder click nahi ho sakta (Kyunki hum wahi par hain)
            html += `<span class="path-current"><i class="fa-solid fa-folder-open text-blue-400"></i> ${f.name}</span>`; 
        } else {
            // Peeche wale folders click ho sakte hain
            html += `<span class="path-link" onclick="navigateTo('${f.id}','${f.name}')">${f.name}</span>`;
        }
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
    if (selectedIds.size > 0) { 
        toggleSelect(f._id, d); 
    } else if (!isTrash) { 
        // ⭐ THE VAULT CHECK ⭐
        // Agar folder ka naam "Vault" ya "Secure Vault" hai, toh direct open mat karo, Lock lagao!
        const folderNameLower = f.name.toLowerCase();
        if (folderNameLower === 'vault' || folderNameLower === 'secure vault') {
            openVaultLock(f._id, f.name);
        } else {
            navigateTo(f._id, f.name); 
        }
    }
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
            // ⭐ CRITICAL FIX: onerror event add kiya gaya hai
            mediaContent = `<img src="/download/${f._id}?token=${token}" loading="lazy" alt="thumbnail" style="width:100%; height:100%; object-fit:cover;" onerror="handleThumbError(this, false)">`;
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

// ==========================================
// ⭐ FIXED UPLOAD ENGINE & BELL BADGE ⭐
// ==========================================

let activeUploadsCount = 0; // Global tracker for uploads

function toggleUploadPanel() { 
    const p = document.getElementById('taskPanel'); 
    p.style.display = p.style.display === 'none' ? 'block' : 'none'; 
}

function cancelAllUploads() { 
    activeUploads.forEach(task => task.controller.abort()); 
    document.getElementById('taskPanel').style.display = 'none'; 
}

// Badge ko update karne ka helper function
function updateBadgeUI() {
    const badge = document.getElementById('taskBadge');
    if (activeUploadsCount > 0) {
        badge.innerText = activeUploadsCount;
        badge.style.display = 'flex'; // Dikhayein
    } else {
        badge.style.display = 'none'; // Chupayein
        
        // Auto-close panel after 3 seconds when all uploads finish
        setTimeout(() => {
            const p = document.getElementById('taskPanel');
            if (p && activeUploadsCount === 0) p.style.display = 'none';
        }, 3000);
    }
}

document.getElementById('filePicker')?.addEventListener('change', async e => {
    const files = Array.from(e.target.files); 
    if (!files.length) return;

    // Jitni nayi files aayi hain, unhe count mein add karein aur UI update karein
    activeUploadsCount += files.length;
    updateBadgeUI();

    const list = document.getElementById('uploadTasksList'); 
    document.getElementById('taskPanel').style.display = 'block';
    
    for(let file of files) {
        const taskId = Date.now() + Math.random(); 
        const controller = new AbortController(); 
        activeUploads.push({ id: taskId, controller });
        
        const el = document.createElement('div'); 
        el.className = 'task-item'; 
        el.id = `task-${taskId}`;
        el.innerHTML = `<div class="task-header"><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%;">${file.name}</span><button class="btn-ghost" style="padding:2px 6px; font-size:0.6rem; border:none; color:var(--danger)" onclick="cancelUpload('${taskId}')"><i class="fa-solid fa-xmark"></i></button></div><div class="task-meta"><span id="meta-${taskId}">0% • 0 / 0 MB</span><span id="speed-${taskId}" class="task-speed">Connecting...</span></div><div class="task-bar"><div class="task-fill" id="fill-${taskId}"></div></div>`;
        list.appendChild(el);

        const formData = new FormData(); 
        formData.append('myFile', file); 
        formData.append('folderId', currentFolderId); 
        const startTime = Date.now();

        try {
            const xhr = new XMLHttpRequest();
            await new Promise((resolve, reject) => {
                controller.signal.addEventListener('abort', () => { xhr.abort(); reject('Cancelled'); });
                xhr.upload.onprogress = ev => { 
                    if(ev.lengthComputable) {
                        const pct = Math.round((ev.loaded/ev.total)*100); 
                        document.getElementById(`fill-${taskId}`).style.width = pct + '%';
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
                const token = localStorage.getItem('td_token'); 
                if(token) xhr.setRequestHeader('Authorization', `Bearer ${token}`); 
                xhr.send(formData);
            });
            document.getElementById(`task-${taskId}`).innerHTML = `<span style="color:var(--success); font-size:0.8rem">✓ ${file.name} (Uploaded)</span>`;
        } catch(err) { 
            document.getElementById(`task-${taskId}`).innerHTML = `<span style="color:var(--danger); font-size:0.8rem">✗ ${file.name} (${err})</span>`; 
        } finally {
            // ⭐ CRITICAL FIX: Upload pass ho ya fail, total count se 1 ghatao ⭐
            activeUploadsCount = Math.max(0, activeUploadsCount - 1);
            updateBadgeUI();
        }
    }
    
    setTimeout(loadCurrentFolder, 1000);
    
    // Naya Add kiya: Taaki aap same file dobara upload kar sakein if needed
    e.target.value = ''; 
});
function cancelUpload(taskId) { const task = activeUploads.find(t => t.id == taskId); if(task) task.controller.abort(); }

// ==========================================
// 7. FILE UTILITIES & ROBUST DOWNLOAD ENGINE
// ==========================================

// FIX: upgraded download engine using blob generation to guarantee proper extensions and file names without errors.
// ==========================================
// ⭐ PREMIUM IPHONE-OPTIMIZED DOWNLOAD ⭐
// ==========================================
async function triggerDownload(fileId) {
    const file = allFiles.find(f => f._id === fileId) || ctxTarget;
    if (!file) return;

    const token = localStorage.getItem('td_token');
    const dlUrl = token ? `/download/${fileId}?token=${token}` : `/download/${fileId}`;
    
    document.getElementById('contextMenu').classList.remove('show');
    
    try {
        // Step 1: File ko background mein fetch karein
        const response = await fetch(dlUrl);
        if (!response.ok) throw new Error("Download server error.");
        
        const blob = await response.blob();
        
        // ⭐ Step 2: IPHONE (iOS) PWA NATIVE FIX ⭐
        // Agar device iPhone hai aur file share/save support karta hai
        if (navigator.canShare) {
            // Blob ko proper File object mein convert karein
            const fileObj = new File([blob], file.name, { type: blob.type || 'application/octet-stream' });
            
            if (navigator.canShare({ files: [fileObj] })) {
                await navigator.share({
                    files: [fileObj],
                    title: file.name
                });
                return; // Share sheet open hone ke baad aage ka code rok do
            }
        }

        // ⭐ Step 3: NORMAL PC / ANDROID FALLBACK ⭐
        // Agar iPhone nahi hai ya Web Share fail ho jaye, toh purana tarika use karein
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
        // Error aane par purana new tab wala fallback zinda rakha hai
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

// ==========================================
// ⭐ ULTIMATE BULK DOWNLOAD ENGINE (NO SHARE API) ⭐
// ==========================================
async function bulkDownload() {
    if (!selectedIds || selectedIds.size === 0) return;

    // UI Feedback
    const countTextElement = document.getElementById('selectedCount');
    const originalText = countTextElement ? countTextElement.innerText : "";
    if (countTextElement) countTextElement.innerText = "Preparing Files...";

    try {
        const token = localStorage.getItem('td_token');
        const filesArray = []; // Share API ke liye
        const blobFallbackData = []; // PC fallback (Aapke purane logic) ke liye

        // 1. Saari files ko background mein fetch karein
        for (let id of selectedIds) {
            const fileMeta = allFiles.find(f => f._id === id);
            if (!fileMeta) continue;

            // ⭐ PRESERVED: Aapka purana Token URL logic
            const dlUrl = token ? `/download/${id}?token=${token}` : `/download/${id}`;
            const response = await fetch(dlUrl);
            if (!response.ok) continue;

            const blob = await response.blob();
            
            // Share sheet ke liye Blob ko 'File' object mein badalna zaroori hai
            const file = new File([blob], fileMeta.name, { type: blob.type || 'application/octet-stream' });
            
            filesArray.push(file);
            blobFallbackData.push({ blob, name: fileMeta.name });
        }

        // 2. ⭐ SMART CHECK: Kya mobile browser single share sheet support karta hai?
        if (navigator.canShare && navigator.canShare({ files: filesArray })) {
            
            // Mobile (Google Photos Style): Ek single share sheet popup khulega
            await navigator.share({
                files: filesArray,
                title: 'TeleDrive Files'
            });

        } else {
            
            // 3. ⭐ LAPTOP/PC FALLBACK (Aapka purana 1.5s delay loop)
            for (let i = 0; i < blobFallbackData.length; i++) {
                setTimeout(() => {
                    const item = blobFallbackData[i];
                    const url = window.URL.createObjectURL(item.blob);
                    
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = item.name;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    
                    a.click(); // File save trigger hogi
                    
                    // Memory cleanup thodi der baad
                    setTimeout(() => {
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                    }, 1000);
                    
                }, i * 1500); // 0s, 1.5s, 3s...
            }
        }

    } catch (error) {
        console.error("Bulk Download Error:", error);
        alert("Something went wrong while downloading files.");
    } finally {
        // ⭐ FINALLY BLOCK: Process chahe fail ho ya pass, UI reset zaroor hoga
        if (countTextElement) countTextElement.innerText = originalText;
        if (typeof clearSelection === 'function') clearSelection();
    }
}}// ==========================================
// ⭐ CUSTOM CREATE FOLDER LOGIC ⭐
// ==========================================
// ==========================================
// ⭐ AUTO-LOGOUT & SESSION TIMEOUT ENGINE ⭐
// ==========================================

let inactivityTimer = null;
const TIMEOUT_MINUTES = 15; // ⏱️ Yahan aap time set kar sakte hain (15 minutes default)
const TIMEOUT_MS = TIMEOUT_MINUTES * 60 * 1000;

// Yeh function timer ko wapas Zero (0) se shuru karta hai
// 📱 Check if user is on a Mobile App / Phone
function isMobileApp() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent) || 
           window.matchMedia('(display-mode: standalone)').matches;
}

// ⏱️ Updated Timer: Sirf PC par chalega, Mobile par hamesha login rahega
function resetInactivityTimer() {
    // Agar mobile hai, toh timer delete kar do aur yahin se wapas mud jao (No Logout)
    if (isMobileApp()) {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        return; 
    }

    // Agar PC/Laptop hai, toh normal timeout chalao
    const isLoggedIn = localStorage.getItem('td_token') || sessionStorage.getItem('td_auth') === 'true';
    if (!isLoggedIn) return;

    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(autoLogoutUser, TIMEOUT_MS);
}
// Jab timer expire ho jayega, tab yeh function chalega
function autoLogoutUser() {
    // 1. Saare tokens aur login data delete kar do
    localStorage.removeItem('td_token');
    sessionStorage.removeItem('td_auth');
    
    // (Optional) Agar user ka koi aur sensitive data local storage mein hai toh use bhi remove kar sakte hain
    // localStorage.removeItem('td_user_data');

    // 2. Alert dikhao ki session expire ho gaya hai
    alert("🔒 Session Expired!\nYou have been logged out due to inactivity for security reasons.");

    // 3. Page ko reload kar do (Yeh sabse safe tarika hai, isse memory clear ho jati hai aur app wapas Login screen par chali jati hai)
    window.location.reload();
}

// 👁️ ACTIVITY TRACKERS (Browser in harqaton par nazar rakhega)
// Jaise hi inme se kuch bhi hoga, timer wapas 15 minutes par reset ho jayega
const userActivityEvents = [
    'mousemove', 'mousedown', 'keypress', 
    'touchmove', 'touchstart', 'scroll', 'click'
];

userActivityEvents.forEach(event => {
    // { passive: true } lagane se scroll aur touch smooth rehta hai, app hang nahi hoti
    document.addEventListener(event, resetInactivityTimer, { passive: true });
});

// App load hote hi pehli baar timer start karne ke liye
window.addEventListener('DOMContentLoaded', () => {
    resetInactivityTimer();
});
function createFolder() { 
    // Agar mobile FAB menu open hai, toh use pehle close kardo
    const fabMenu = document.getElementById('fabMenu');
    const fabMain = document.getElementById('fabMain');
    if(fabMenu && fabMenu.classList.contains('show')) {
        fabMenu.classList.remove('show');
        fabMain.classList.remove('active');
    }

    // Input box ko khali karke Modal ko display karein
    document.getElementById('newFolderInput').value = ''; 
    document.getElementById('createFolderModal').style.display = 'flex'; 
    document.getElementById('newFolderInput').focus(); 
}

// Jab user "Create" button dabayega, tab yeh API call hoga
async function submitCreateFolder() {
    const folderName = document.getElementById('newFolderInput').value.trim();
    
    // Agar input khali hai toh modal close mat karo
    if(!folderName) return; 

    // Modal ko hide kardo
    document.getElementById('createFolderModal').style.display = 'none'; 
    
    try {
        await fetch('/folders', {
            method: 'POST', 
            headers: getHeaders(), 
            body: JSON.stringify({ name: folderName, parentId: currentFolderId })
        });
        
        // Naya folder banne ke baad grid ko refresh karo
        loadCurrentFolder(); 
    } catch (e) {
        console.error("Folder creation failed:", e);
    }
}

// Ek extra premium feature: Enter key dabane par bhi folder ban jaye
document.getElementById('newFolderInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') submitCreateFolder();
});
// ==========================================
// ⭐ IPHONE-STYLE SWIPE TO GO BACK ⭐
// ==========================================

let touchStartX = 0;

// Screen par touch shuru hone ki position pakdo
document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
}, { passive: true });

// Touch chhodte waqt dekho kitna swipe hua
document.addEventListener('touchend', (e) => {
    let touchEndX = e.changedTouches[0].clientX;
    
    // CONDITION: Agar touch left corner (40px) se shuru ho, aur right ki taraf (60px se zyada) swipe ho
    if (touchStartX < 40 && (touchEndX - touchStartX) > 60) {
        goBack(); // Peeche jao
    }
}, { passive: true });

// Peeche jaane ka Logic
function goBack() {
    if (currentView !== 'drive' || folderStack.length === 0) return; 
    
    if (folderStack.length === 1) {
        // Agar sirf ek folder andar hain, toh root par jao
        navigateTo('root', 'My Drive');
    } else {
        // Agar deep folder mein hain, toh theek ek step piche jao
        const parentFolder = folderStack[folderStack.length - 2];
        navigateTo(parentFolder.id, parentFolder.name);
    }
}
// ==========================================
// ⭐ SECURE VAULT ENGINE ⭐
// ==========================================
let pendingVaultFolder = null;

function openVaultLock(folderId, folderName) {
    pendingVaultFolder = { id: folderId, name: folderName };
    const storedPin = localStorage.getItem('td_vault_pin');

    document.getElementById('vaultModalOverlay').style.display = 'flex';
    const title = document.getElementById('vaultModalTitle');
    const desc = document.getElementById('vaultModalDesc');
    document.getElementById('vaultError').style.display = 'none';

    // Purane likhe hue numbers clear karein
    document.querySelectorAll('.vault-pin-box').forEach(input => input.value = '');

    if (!storedPin) {
        title.innerText = "Setup Vault PIN";
        desc.innerText = "Create a new 4-digit PIN to secure your files.";
    } else {
        title.innerText = "Secure Vault";
        desc.innerText = "Enter your 4-digit PIN to unlock this folder.";
    }

    // Modal khulte hi pehle box par cursor aa jaye
    setTimeout(() => document.querySelectorAll('.vault-pin-box')[0].focus(), 100);
}

function closeVaultModal() {
    document.getElementById('vaultModalOverlay').style.display = 'none';
    pendingVaultFolder = null;
}

function submitVaultPin() {
    const inputs = document.querySelectorAll('.vault-pin-box');
    let enteredPin = '';
    inputs.forEach(input => enteredPin += input.value);

    if (enteredPin.length < 4) {
        showVaultError("Please enter all 4 digits.");
        return;
    }

    const storedPin = localStorage.getItem('td_vault_pin');

    // ⭐ THE BUG FIX: Modal close hone se pehle data safe kar lo
    const targetFolderId = pendingVaultFolder.id;
    const targetFolderName = pendingVaultFolder.name;

    if (!storedPin) {
        // Naya PIN save karo
        localStorage.setItem('td_vault_pin', enteredPin);
        closeVaultModal(); // Ab yeh memory clear bhi kare toh koi problem nahi
        
        // Timeout lagaya taaki UI smooth rahe aur alert ke baad folder khul jaye
        setTimeout(() => {
            alert("🔒 Vault PIN set successfully! Do not forget it.");
            navigateTo(targetFolderId, targetFolderName); 
        }, 100);
        
    } else {
        // Purana PIN Check karo
        if (enteredPin === storedPin) {
            closeVaultModal();
            navigateTo(targetFolderId, targetFolderName); // Correct PIN, folder open
        } else {
            // Galat PIN
            showVaultError("Incorrect PIN! Try again.");
            inputs.forEach(input => input.value = ''); // Reset boxes
            inputs[0].focus();
            if (navigator.vibrate) navigator.vibrate([50, 50, 50]); 
        }
    }
}
function showVaultError(msg) {
    const errEl = document.getElementById('vaultError');
    errEl.innerText = msg;
    errEl.style.display = 'block';
}

// ⌨️ Auto-Move Cursor for PIN Boxes (Like OTP)
document.querySelectorAll('.vault-pin-box').forEach((input, index, inputs) => {
    input.addEventListener('input', (e) => {
        // Agar number type kiya, toh aagle box par jao
        if (e.target.value && index < inputs.length - 1) {
            inputs[index + 1].focus();
        }
        // Agar aakhiri box type ho gaya, toh apne aap submit kar do!
        if (e.target.value && index === inputs.length - 1) {
            setTimeout(submitVaultPin, 100);
        }
    });
    
    input.addEventListener('keydown', (e) => {
        // Agar Backspace dabaya aur box khali hai, toh pichle box par jao
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
            inputs[index - 1].focus();
        }
        // Agar Enter dabaya toh submit karo
        if (e.key === 'Enter') submitVaultPin();
    });
});
// ==========================================
// ⭐ MOBILE FAST-TAP BUTTON FIX ⭐
// ==========================================
document.addEventListener('touchend', (e) => {
    // Check karein ki kya user ne Action Bar ke kisi button par tap kiya hai?
    const actionBtn = e.target.closest('.ab-btn');
    
    if (actionBtn) {
        // Mobile browser ki default aadat (Ghost-click/Hover delay) ko roko
        e.preventDefault(); 
        
        // Button ka asli click function turant (0 delay) trigger kar do
        actionBtn.click();
        
        // Premium feel ke liye haptic feedback (vibration)
        if (navigator.vibrate) navigator.vibrate(30);
    }
}, { passive: false });
// ==========================================
// ⭐ FIRST TIME SECURITY SETUP ENGINE ⭐
// ==========================================

function checkAndPromptSecurity() {
    // Sirf mobile par prompt dikhana hai
    if (!isMobileApp()) return; 
    
    const isFaceIdEnabled = localStorage.getItem('td_faceid_enabled') === 'true';
    const isPrompted = localStorage.getItem('td_security_prompted') === 'true';
    
    // Agar user ne ab tak Face ID setup nahi kiya hai aur 'Skip' bhi nahi kiya hai
    if (!isFaceIdEnabled && !isPrompted) {
        // Thoda delay dete hain taaki background files load ho jayein
        setTimeout(() => {
            document.getElementById('securitySetupModal').style.display = 'flex';
        }, 1000);
    }
}

async function startSecuritySetup() {
    document.getElementById('securitySetupModal').style.display = 'none';
    // Yaad rakho ki humne user se pooch liya hai, taaki baar baar pareshan na karein
    localStorage.setItem('td_security_prompted', 'true'); 
    
    // Aapka purana Face ID setup function call hoga
    await setupFaceID(); 
}

function skipSecuritySetup() {
    document.getElementById('securitySetupModal').style.display = 'none';
    // User ne skip kiya hai, aage se mat poochhna
    localStorage.setItem('td_security_prompted', 'true'); 
}
