const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
// ⭐ Naya Email Setup ⭐
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-teledrive-key-2026';

// 📂 Temp folder setup for Zero-RAM Uploads
const tempDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, tempDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected securely'))
    .catch(err => console.error('❌ DB Error:', err));

// ==========================================
// DATABASE SCHEMAS & MODELS
// ==========================================
const AdminSchema = new mongoose.Schema({ username: String, password: String });
const AdminModel = mongoose.model('Admin', AdminSchema);

async function getAdmin() {
    let admin = await AdminModel.findOne();
    if (!admin) admin = await AdminModel.create({ username: process.env.APP_USERNAME, password: process.env.APP_PASSWORD });
    return admin;
}

const FileSchema = new mongoose.Schema({
    name: String, size: String, fileId: String, folderId: { type: String, default: 'root' },
    messageId: Number, isTrashed: { type: Boolean, default: false },
    trashedAt: { type: Date, default: null }, uploadedAt: { type: Date, default: Date.now }
});
const FileModel = mongoose.model('File', FileSchema);

const FolderSchema = new mongoose.Schema({
    name: String, parentId: { type: String, default: 'root' },
    isTrashed: { type: Boolean, default: false }, trashedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});
const FolderModel = mongoose.model('Folder', FolderSchema);

const OTPSchema = new mongoose.Schema({ code: String, used: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now, expires: 300 } });
const OTPModel = mongoose.model('OTP', OTPSchema);

app.use(express.json());
app.use(express.static('.'));

// ==========================================
// SECURITY MIDDLEWARE (JWT)
// ==========================================
const checkAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    try { 
        jwt.verify(token, JWT_SECRET); 
        next(); 
    } catch (err) { 
        res.status(401).json({ success: false, message: 'Invalid token' }); 
    }
};

// ==========================================
// AUTH & SETTINGS ROUTES
// ==========================================
// ==========================================
// AUTH & SETTINGS ROUTES
// ==========================================
app.post('/request-otp', async (req, res) => {
    try {
        const admin = await getAdmin();
        if (req.body.username !== admin.username || req.body.password !== admin.password) return res.status(401).json({ success: false });
        
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await OTPModel.deleteMany({}); 
        await OTPModel.create({ code });

        // 1. Telegram par bhejo (Background mein)
        axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: process.env.TELEGRAM_CHAT_ID, text: `🔐 OTP: *${code}*`, parse_mode: 'Markdown' }).catch(e => console.log('TG Error'));

        // 2. Email par bhejo (Background mein)
        if (process.env.GMAIL_EMAIL) {
            const mailOptions = {
                from: `"TeleDrive Security" <${process.env.GMAIL_EMAIL}>`,
                to: process.env.GMAIL_EMAIL, // Aapke hi email par aayega
                subject: "TeleDrive Login OTP",
                html: `<h3>TeleDrive Security</h3><p>Your login OTP is:</p><h1 style="color: #34c759; letter-spacing: 5px;">${code}</h1>`
            };
            transporter.sendMail(mailOptions).catch(e => console.log('🚨 EMAIL ERROR DETAILS:', e.message));
        }

        // Frontend ko turant aage badhao (App nahi atkegi)
        res.json({ success: true, message: "OTP Sent!" });
    } catch (e) { 
        res.status(500).json({ success: false }); 
    }
});
// PIN ko server par ek chhote file mein save karenge
const PIN_FILE_PATH = path.join(__dirname, 'vault_pin.json');

function getStoredPin() {
    if (fs.existsSync(PIN_FILE_PATH)) {
        const data = JSON.parse(fs.readFileSync(PIN_FILE_PATH));
        return data.pin;
    }
    return null;
}

// API 1: Check if PIN exists
// ==========================================
// ⭐ RENDER ENVIRONMENT VARIABLE VAULT ⭐
// ==========================================

// API 1: Check if PIN exists (Hamesha true rahega kyunki Render mein set hai)
app.get('/api/vault/status', (req, res) => {
    res.json({ isPinSet: true });
});

// API 2: Verify PIN
app.post('/api/vault/verify', (req, res) => {
    const { pin } = req.body;
    
    // Render dashboard se seedha PIN read karega
    const masterPin = process.env.VAULT_PIN; 

    if (!masterPin) {
        return res.json({ success: false, message: 'Server error: VAULT_PIN is missing in Render Environment Variables!' });
    }

    if (pin === masterPin) {
        return res.json({ success: true, message: 'Unlocked!' });
    } else {
        return res.json({ success: false, message: 'Incorrect PIN!' });
    }
});

// (Aap change PIN wali API (/api/vault/change) delete kar sakte hain kyunki ab hum PIN Render se control kar rahe hain)
    // Naya PIN save kar lo
app.post('/verify-otp', async (req, res) => {
    try {
        const otp = await OTPModel.findOne({ code: req.body.code, used: false });
        if (!otp) return res.status(401).json({ success: false });
        otp.used = true; await otp.save();
        const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/change-password', checkAuth, async (req, res) => {
    try {
        const { currentPass, newPass } = req.body;
        const admin = await getAdmin();
        if (admin.password !== currentPass) return res.status(401).json({ success: false, message: 'Wrong current password' });
        admin.password = newPass; 
        await admin.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// ==========================================
// MAIN APP ROUTES (FILES & FOLDERS)
// ==========================================
app.post('/upload', checkAuth, upload.single('myFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file.' });
        const form = new FormData();
        form.append('chat_id', process.env.TELEGRAM_CHAT_ID);
        form.append('document', fs.createReadStream(req.file.path), { filename: req.file.originalname });

        const resp = await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`, form, { headers: form.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity });
        fs.unlinkSync(req.file.path); 

        const newFile = await FileModel.create({
            name: req.file.originalname, size: (req.file.size/1024/1024).toFixed(2)+' MB',
            fileId: resp.data.result.document.file_id, messageId: resp.data.result.message_id,
            folderId: req.body.folderId || 'root'
        });
        res.json({ success: true, file: newFile });
    } catch (err) { 
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: 'Error' }); 
    }
});

// ── 100% SAFE DOWNLOAD & PREVIEW ENGINE ──
// ── 100% SAFE DOWNLOAD & PREVIEW ENGINE (CORS FIXED) ──
app.get('/download/:id', checkAuth, async (req, res) => {
    try {
        const file = await FileModel.findById(req.params.id);
        if (!file || !file.fileId) return res.send("File not found in database.");

        const info = await axios.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${file.fileId}`);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${info.data.result.file_path}`;

        // ⭐ YAHAN CHANGE HUA HAI: Redirect ki jagah stream pipeline ⭐
        const response = await axios({
            method: 'GET',
            url: fileUrl,
            responseType: 'stream' // File ko tukdon (stream) mein server par lana
        });

        // Browser ko batana ki yeh file hai aur iska naam kya hai
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');

        // File ko directly user ke browser mein bhejna (Bina server ka RAM bhare)
        response.data.pipe(res);

    } catch (e) {
        console.error("Download Error:", e.response ? e.response.data : e.message);
        const errorMsg = e.response && e.response.data && e.response.data.description 
            ? e.response.data.description 
            : e.message;
            
        res.status(500).send(`
            <div style="font-family:sans-serif; text-align:center; margin-top:50px; background:#1e1e2a; color:white; padding:30px; border-radius:12px; max-width:400px; margin-left:auto; margin-right:auto; box-shadow:0 10px 20px rgba(0,0,0,0.5);">
                <h2 style="color:#ff6584; margin-bottom:10px;">Download Failed ❌</h2>
                <p style="color:#e8e8f0; margin-bottom:20px;"><b>Reason:</b> ${errorMsg}</p>
                <button onclick="window.close()" style="padding:10px 20px; background:#6c63ff; color:white; border:none; border-radius:8px; cursor:pointer;">Close Window</button>
            </div>
        `);
    }
});
app.get('/files', checkAuth, async (req, res) => {
    try {
        const folderId = req.query.folderId || 'root';
        const filter = { folderId: folderId, isTrashed: { $ne: true } };
        
        if(folderId === 'root') {
            filter.$or = [{ folderId: 'root' }, { folderId: { $exists: false } }, { folderId: null }];
        }

        const files = await FileModel.find(filter)
                                     .sort({ uploadedAt: -1 })
                                     .skip(parseInt(req.query.skip) || 0)
                                     .limit(parseInt(req.query.limit) || 100);
        res.json(files);
    } catch (e) { 
        res.status(500).json([]); 
    }
});

app.get('/folders', checkAuth, async (req, res) => {
    try {
        const parentId = req.query.parentId || 'root';
        const filter = { parentId: parentId, isTrashed: { $ne: true } };
        const folders = await FolderModel.find(filter);
        res.json(folders);
    } catch (e) { 
        res.status(500).json([]); 
    }
});

app.get('/files/all', checkAuth, async (req, res) => {
    try { res.json(await FileModel.find({ isTrashed: { $ne: true } })); } catch (e) { res.status(500).json([]); }
});

// Rename
app.patch('/files/:id/rename', checkAuth, async (req, res) => {
    try { await FileModel.findByIdAndUpdate(req.params.id, { name: req.body.newName }); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false }); }
});
app.patch('/folders/:id/rename', checkAuth, async (req, res) => {
    try { await FolderModel.findByIdAndUpdate(req.params.id, { name: req.body.newName }); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false }); }
});

// Move
app.patch('/files/:id/move', checkAuth, async (req, res) => {
    try { await FileModel.findByIdAndUpdate(req.params.id, { folderId: req.body.folderId }); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false }); }
});
app.patch('/folders/:id/move', checkAuth, async (req, res) => {
    try { await FolderModel.findByIdAndUpdate(req.params.id, { parentId: req.body.folderId }); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false }); }
});

// Create Folder
app.post('/folders', checkAuth, async (req, res) => {
    try { await FolderModel.create({ name: req.body.name, parentId: req.body.parentId || 'root' }); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false }); }
});

// ==========================================
// FILE TRASH & DELETE ROUTES
// ==========================================

app.delete('/files/:id/trash', checkAuth, async (req, res) => {
    try {
        const fileData = await FileModel.findById(req.params.id);
        if (!fileData) return res.status(404).json({ success: false, error: "File not found" });

        // ⭐ TELEGRAM DELETE LOGIC ⭐
        // Aapke schema mein 'messageId' hai aur chat ID process.env se aayegi
        if (fileData.messageId) {
            try {
                await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
                    chat_id: process.env.TELEGRAM_CHAT_ID,
                    message_id: fileData.messageId
                });
                console.log(`Telegram message ${fileData.messageId} deleted successfully.`);
            } catch (tgErr) {
                console.error("Telegram API Error:", tgErr.message);
            }
        }

        // Database mein trash mark karein
        fileData.isTrashed = true;
        fileData.trashedAt = new Date();
        await fileData.save();
        
        res.json({ success: true, message: "File moved to trash and removed from Telegram Bot" });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/folders/:id/trash', checkAuth, async (req, res) => {
    try {
        const updatedFolder = await FolderModel.findByIdAndUpdate(
            req.params.id, 
            { isTrashed: true, trashedAt: new Date() },
            { new: true }
        );
        if (!updatedFolder) return res.status(404).json({ success: false, error: "Folder not found" });
        
        res.json({ success: true, message: "Folder successfully moved to trash" });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/trash', checkAuth, async (req, res) => {
    try { res.json({ files: await FileModel.find({ isTrashed: true }), folders: await FolderModel.find({ isTrashed: true }) }); } catch (e) { res.status(500).json({ files: [], folders: [] }); }
});

app.patch('/files/:id/restore', checkAuth, async (req, res) => {
    try { await FileModel.findByIdAndUpdate(req.params.id, { isTrashed: false, trashedAt: null }); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false }); }
});
app.patch('/folders/:id/restore', checkAuth, async (req, res) => {
    try { await FolderModel.findByIdAndUpdate(req.params.id, { isTrashed: false, trashedAt: null }); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/files/:id/permanent', checkAuth, async (req, res) => {
    try {
        const file = await FileModel.findById(req.params.id);
        if(file && file.messageId) { 
            try { 
                await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, { 
                    chat_id: process.env.TELEGRAM_CHAT_ID, 
                    message_id: file.messageId 
                }); 
            } catch(err){} 
        }
        await FileModel.findByIdAndDelete(req.params.id); res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/folders/:id/permanent', checkAuth, async (req, res) => {
    try { await FolderModel.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false }); }
});

// Auto-Cleanup 30 Days Old Trash
setInterval(async () => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const expiredFiles = await FileModel.find({ isTrashed: true, trashedAt: { $lt: thirtyDaysAgo } });
        for(let file of expiredFiles) {
            if (file.messageId) { 
                try { 
                    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, { 
                        chat_id: process.env.TELEGRAM_CHAT_ID, 
                        message_id: file.messageId 
                    }); 
                } catch(e){} 
            }
            await FileModel.findByIdAndDelete(file._id);
        }
        await FolderModel.deleteMany({ isTrashed: true, trashedAt: { $lt: thirtyDaysAgo } });
    } catch(err) {}
}, 12 * 60 * 60 * 1000);
app.get('/script.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'script.js'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on port ${PORT}`));
