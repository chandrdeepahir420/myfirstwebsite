const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

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
app.post('/request-otp', async (req, res) => {
    try {
        const admin = await getAdmin();
        if (req.body.username !== admin.username || req.body.password !== admin.password) return res.status(401).json({ success: false });
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await OTPModel.deleteMany({}); await OTPModel.create({ code });
        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: process.env.TELEGRAM_CHAT_ID, text: `🔐 OTP: *${code}*`, parse_mode: 'Markdown' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

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

app.get('/download/:id', checkAuth, async (req, res) => {
    try {
        const file = await FileModel.findById(req.params.id);
        const info = await axios.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${file.fileId}`);
        res.redirect(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${info.data.result.file_path}`);
    } catch (e) { res.status(500).send('Error'); }
});

app.get('/files', checkAuth, async (req, res) => {
    try {
        const filter = { folderId: req.query.folderId || 'root', isTrashed: { $ne: true } };
        if(req.query.folderId === 'root') filter.$or = [{ folderId: 'root' }, { folderId: { $exists: false } }, { folderId: null }];
        res.json(await FileModel.find(filter).sort({ uploadedAt: -1 }));
    } catch (e) { res.status(500).json([]); }
});

app.get('/folders', checkAuth, async (req, res) => {
    try {
        const filter = { parentId: req.query.parentId || 'root', isTrashed: { $ne: true } };
        if (req.query.parentId === 'root') filter.$or = [{ parentId: 'root' }, { parentId: { $exists: false } }, { parentId: null }];
        res.json(await FolderModel.find(filter).sort({ createdAt: -1 }));
    } catch (e) { res.status(500).json([]); }
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
// TRASH & DELETE ROUTES
// ==========================================
app.delete('/files/:id/trash', checkAuth, async (req, res) => {
    try { await FileModel.findByIdAndUpdate(req.params.id, { isTrashed: true, trashedAt: Date.now() }); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false }); }
});
app.delete('/folders/:id/trash', checkAuth, async (req, res) => {
    try { await FolderModel.findByIdAndUpdate(req.params.id, { isTrashed: true, trashedAt: Date.now() }); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false }); }
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
        if(file && file.messageId) { try { await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, { chat_id: process.env.TELEGRAM_CHAT_ID, message_id: file.messageId }); } catch(err){} }
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
            if (file.messageId) { try { await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, { chat_id: process.env.TELEGRAM_CHAT_ID, message_id: file.messageId }); } catch(e){} }
            await FileModel.findByIdAndDelete(file._id);
        }
        await FolderModel.deleteMany({ isTrashed: true, trashedAt: { $lt: thirtyDaysAgo } });
    } catch(err) {}
}, 12 * 60 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on port ${PORT}`));
