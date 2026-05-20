const filePicker = document.getElementById('filePicker');
const fileList = document.querySelector('.file-list');

const loginScreen = document.getElementById('loginScreen');
const driveContent = document.getElementById('driveContent');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');

// 🔑 LOGIN FUNCTION
loginBtn.addEventListener('click', async () => {
    const username = usernameInput.value;
    const password = passwordInput.value;

    const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
        // Login safal raha, state save karo aur page badlo
        localStorage.setItem('isLoggedIn', 'true');
        showDrive();
    } else {
        alert(data.message);
    }
});

// 🔒 LOGOUT FUNCTION
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('isLoggedIn');
    window.location.reload();
});

// Interface badalne wala function
function showDrive() {
    loginScreen.style.display = 'none';
    driveContent.style.display = 'block';
    loadFiles(); // Drive khulte hi files load karo
}

// 🔄 MongoDB se files mangwane wala function
async function loadFiles() {
    try {
        console.log("MongoDB se files mangwa rahe hain...");
        const response = await fetch('/files');
        const files = await response.json();
        
        fileList.innerHTML = ''; 

        if (files.length === 0) {
            fileList.innerHTML = '<p style="color: gray; padding: 15px;">No files uploaded yet.</p>';
            return;
        }

        files.forEach(file => {
            const li = document.createElement('li');
            li.style.padding = '12px';
            li.style.borderBottom = '1px solid #eee';
            li.style.color = '#333';
            li.style.background = '#f9f9f9';
            li.style.margin = '5px 0';
            li.style.borderRadius = '5px';
            li.style.listStyle = 'none';

            li.innerHTML = `
                <strong style="color: black;">${file.name}</strong> (${file.size}) 
                <br>
                <a href="${file.url}" target="_blank" style="display: inline-block; margin-top: 5px; background: #007bff; color: white; padding: 5px 10px; border-radius: 4px; text-decoration: none;">View / Download</a>
            `;
            fileList.appendChild(li);
        });
    } catch (error) {
        console.error("List load karne me error:", error);
    }
}

// ⬆️ File Upload Logic
filePicker.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    alert("Uploading: " + file.name);
    const formData = new FormData();
    formData.append('myFile', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        alert(data.message);
        loadFiles();

    } catch (error) {
        alert("Upload fail ho gaya!");
    }
});

// 🌐 Check karo ki kya user pehle se logged in hai
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('isLoggedIn') === 'true') {
        showDrive();
    }
});
