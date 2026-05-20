const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage() });

// ================== ⚙️ SECURE ENVIRONMENT VARIABLES ==================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const APP_USERNAME = process.env.APP_USERNAME;
const APP_PASSWORD = process.env.APP_PASSWORD;
const MONGO_URI = process.env.MONGO_URI;
// =======================================================================

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Engine connected successfully!'))
    .catch(err => console.error('❌ MongoDB Engine connection failed:', err));

// 📁 Folders Schema
const FolderSchema = new mongoose.Schema({
    name: String,
    parentId: { type: String, default: 'root' },
    isTrashed: { type: Boolean, default: false },
    trashedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});
const FolderModel = mongoose.model('Folder', FolderSchema);

// 📄 Files Schema 
const FileSchema = new mongoose.Schema({
    name: String,
    size: String,
    url: String,
    folderId: { type: String, default: 'root' },
    messageId: Number, // Telegram API ID for permanent delete
    isTrashed: { type: Boolean, default: false },
    trashedAt: { type: Date, default: null },
    uploadedAt: { type: Date, default: Date.now }
});
const FileModel = mongoose.model('File', FileSchema);

// 🔐 OTP Schema
const OTPSchema = new mongoose.Schema({
    code: String,
    used: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, expires: 300 } 
});
const OTPModel = mongoose.model('OTP', OTPSchema);

app.use(express.json());
app.use(express.static('.'));

// 🔑 Authentication Routes
app.post('/request-otp', async (req, res) => {
    const { username, password } = req.body;
    if (username !== APP_USERNAME || password !== APP_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Galat credentials!' });
    }
    try {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await OTPModel.deleteMany({}); 
        await OTPModel.create({ code });

        const msg = `🔐 *TeleDrive Security*\nYour 6-Digit OTP is: *${code}*`;
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' });
        res.json({ success: true, message: 'OTP sent!' });
    } catch (err) { res.status(500).json({ success: false, message: 'OTP failed.' }); }
});

app.post('/verify-otp', async (req, res) => {
    const { code } = req.body;
    try {
        const otp = await OTPModel.findOne({ code, used: false });
        if (!otp) return res.status(401).json({ success: false, message: 'Galat OTP!' });
        otp.used = true; await otp.save();
        res.json({ success: true, message: 'Login successful!' });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ⬆️ Upload File
app.post('/upload', upload.single('myFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file.' });
        const folderId = req.body.folderId || 'root';

        const form = new FormData();
        form.append('chat_id', TELEGRAM_CHAT_ID);
        form.append('document', req.file.buffer, { filename: req.file.originalname });

        const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, form, { headers: form.getHeaders(), maxContentLength: Infinity, maxBodyLength: Infinity });

        if (response.data.ok) {
            const fileData = response.data.result.document;
            const messageId = response.data.result.message_id;
            const fileInfoResponse = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileData.file_id}`);
            const directDownloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileInfoResponse.data.result.file_path}`;

            const newFile = await FileModel.create({
                name: req.file.originalname, size: (req.file.size / (1024 * 1024)).toFixed(2) + ' MB',
                url: directDownloadUrl, folderId: folderId, messageId: messageId
            });
            res.json({ success: true, message: 'Uploaded!', file: newFile });
        } else { res.status(500).json({ message: 'Telegram block.' }); }
    } catch (error) { res.status(500).json({ message: 'Server error.' }); }
});

// 📂 Get Active Files & Folders
app.get('/files', async (req, res) => {
    try { res.json(await FileModel.find({ folderId: req.query.folderId || 'root', isTrashed: false }).sort({ uploadedAt: -1 })); } catch (err) { res.status(500).json([]); }
});
app.get('/folders', async (req, res) => {
    try { res.json(await FolderModel.find({ parentId: req.query.parentId || 'root', isTrashed: false }).sort({ createdAt: -1 })); } catch (err) { res.status(500).json([]); }
});

// 🔍 Search Active Files
app.get('/files/all', async (req, res) => {
    try { res.json(await FileModel.find({ isTrashed: false }).sort({ uploadedAt: -1 })); } catch (err) { res.status(500).json([]); }
});

// ✏️ Rename Route
app.patch('/files/:id/rename', async (req, res) => {
    try {
        const { newName, type } = req.body;
        if(type === 'folder') await FolderModel.findByIdAndUpdate(req.params.id, { name: newName });
        else await FileModel.findByIdAndUpdate(req.params.id, { name: newName });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 🗑️ Move to Trash (Soft Delete)
app.delete('/files/:id/trash', async (req, res) => {
    try { await FileModel.findByIdAndUpdate(req.params.id, { isTrashed: true, trashedAt: Date.now() }); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); }
});
app.delete('/folders/:id/trash', async (req, res) => {
    try { await FolderModel.findByIdAndUpdate(req.params.id, { isTrashed: true, trashedAt: Date.now() }); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); }
});

// ♻️ Get Trashed Items
app.get('/trash', async (req, res) => {
    try {
        const files = await FileModel.find({ isTrashed: true }).sort({ trashedAt: -1 });
        const folders = await FolderModel.find({ isTrashed: true }).sort({ trashedAt: -1 });
        res.json({ files, folders });
    } catch (err) { res.status(500).json({ files: [], folders: [] }); }
});

// 🔄 Restore from Trash
app.patch('/files/:id/restore', async (req, res) => {
    try { await FileModel.findByIdAndUpdate(req.params.id, { isTrashed: false, trashedAt: null }); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); }
});
app.patch('/folders/:id/restore', async (req, res) => {
    try { await FolderModel.findByIdAndUpdate(req.params.id, { isTrashed: false, trashedAt: null }); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); }
});

// 💀 PERMANENT DELETE (From DB & Telegram)
app.delete('/files/:id/permanent', async (req, res) => {
    try {
        const file = await FileModel.findById(req.params.id);
        if (!file) return res.status(404).json({ success: false });
        if (file.messageId) {
            try { await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, { chat_id: TELEGRAM_CHAT_ID, message_id: file.messageId }); } catch (e) {}
        }
        await FileModel.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});
app.delete('/folders/:id/permanent', async (req, res) => {
    try { await FolderModel.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); }
});

// 📦 Bulk Move
app.patch('/files/:id/move', async (req, res) => {
    try { await FileModel.findByIdAndUpdate(req.params.id, { folderId: req.body.folderId }); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); }
});

// 📂 Create Folder
app.post('/folders', async (req, res) => {
    try {
        const { name, parentId } = req.body;
        const folder = await FolderModel.create({ name, parentId: parentId || 'root' });
        res.json({ success: true, folder });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ⏰ CRON JOB: Auto-Delete 30 Days old trash
setInterval(async () => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const expiredFiles = await FileModel.find({ isTrashed: true, trashedAt: { $lt: thirtyDaysAgo } });
        for(let file of expiredFiles) {
            if (file.messageId) { try { await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, { chat_id: TELEGRAM_CHAT_ID, message_id: file.messageId }); } catch(e){} }
            await FileModel.findByIdAndDelete(file._id);
        }
        await FolderModel.deleteMany({ isTrashed: true, trashedAt: { $lt: thirtyDaysAgo } });
        console.log(`🧹 Auto-Cleanup: Removed ${expiredFiles.length} expired trashed files.`);
    } catch(err) { console.error("Auto-cleanup error", err); }
}, 12 * 60 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 Secure Operations Core listening at port ${PORT}`); });
