const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage() });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const APP_USERNAME = process.env.APP_USERNAME;
const APP_PASSWORD = process.env.APP_PASSWORD;
const MONGO_URI = process.env.MONGO_URI;

// ─── MongoDB Connect ───────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected!'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// ─── Schemas ──────────────────────────────────────────────────────────────────
const FileSchema = new mongoose.Schema({
    name: String,
    size: String,
    url: String,
    folderId: { type: String, default: 'root' },
    uploadedAt: { type: Date, default: Date.now }
});

const FolderSchema = new mongoose.Schema({
    name: String,
    parentId: { type: String, default: 'root' },
    createdAt: { type: Date, default: Date.now }
});

const OTPSchema = new mongoose.Schema({
    code: String,
    used: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, expires: 300 } // auto-delete after 5 min
});

const FileModel = mongoose.model('File', FileSchema);
const FolderModel = mongoose.model('Folder', FolderSchema);
const OTPModel = mongoose.model('OTP', OTPSchema);

app.use(express.json());
app.use(express.static('.'));

// ─── LOGIN ────────────────────────────────────────────────────────────────────
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === APP_USERNAME && password === APP_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Galat Username ya Password!' });
    }
});

// ─── REQUEST OTP (Telegram par bhejega) ──────────────────────────────────────
app.post('/request-otp', async (req, res) => {
    const { username, password } = req.body;
    if (username !== APP_USERNAME || password !== APP_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Galat credentials!' });
    }
    try {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await OTPModel.deleteMany({}); // purane OTP delete karo
        await OTPModel.create({ code });

        const msg = `🔐 *TeleDrive Login OTP*\n\nYour OTP is: *${code}*\n\nYe OTP 5 minute mein expire ho jayega.`;
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: msg,
            parse_mode: 'Markdown'
        });

        res.json({ success: true, message: 'OTP Telegram par bhej diya!' });
    } catch (err) {
        console.error('OTP error:', err.message);
        res.status(500).json({ success: false, message: 'OTP bhejne mein error!' });
    }
});

// ─── VERIFY OTP ───────────────────────────────────────────────────────────────
app.post('/verify-otp', async (req, res) => {
    const { code } = req.body;
    try {
        const otp = await OTPModel.findOne({ code, used: false });
        if (!otp) return res.status(401).json({ success: false, message: 'Galat ya expire OTP!' });
        otp.used = true;
        await otp.save();
        res.json({ success: true, message: 'Login successful!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error!' });
    }
});

// ─── UPLOAD ───────────────────────────────────────────────────────────────────
app.post('/upload', upload.single('myFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Koi file nahi mili!' });
        const folderId = req.body.folderId || 'root';

        const form = new FormData();
        form.append('chat_id', TELEGRAM_CHAT_ID);
        form.append('document', req.file.buffer, { filename: req.file.originalname });

        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`;
        const response = await axios.post(telegramUrl, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (response.data.ok) {
            const fileId = response.data.result.document.file_id;
            const fileInfoResponse = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
            const filePath = fileInfoResponse.data.result.file_path;
            const directDownloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

            const newFile = await FileModel.create({
                name: req.file.originalname,
                size: (req.file.size / (1024 * 1024)).toFixed(2) + ' MB',
                url: directDownloadUrl,
                folderId
            });

            res.json({ success: true, message: 'File upload ho gayi! 🎉', file: newFile });
        } else {
            console.log('Telegram error:', response.data);
            res.status(500).json({ message: 'Telegram error!' });
        }
    } catch (error) {
        console.error('Upload error:', error.message);
        res.status(500).json({ message: 'Server error!' });
    }
});

// ─── GET FILES ────────────────────────────────────────────────────────────────
app.get('/files', async (req, res) => {
    try {
        const folderId = req.query.folderId || 'root';
        const files = await FileModel.find({ folderId }).sort({ uploadedAt: -1 });
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET ALL FILES (search) ───────────────────────────────────────────────────
app.get('/files/all', async (req, res) => {
    try {
        const files = await FileModel.find({}).sort({ uploadedAt: -1 });
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── DELETE FILE ──────────────────────────────────────────────────────────────
app.delete('/files/:id', async (req, res) => {
    try {
        await FileModel.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ─── MOVE FILE TO FOLDER ──────────────────────────────────────────────────────
app.patch('/files/:id/move', async (req, res) => {
    try {
        await FileModel.findByIdAndUpdate(req.params.id, { folderId: req.body.folderId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ─── GET FOLDERS ──────────────────────────────────────────────────────────────
app.get('/folders', async (req, res) => {
    try {
        const parentId = req.query.parentId || 'root';
        const folders = await FolderModel.find({ parentId }).sort({ createdAt: -1 });
        res.json(folders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── CREATE FOLDER ────────────────────────────────────────────────────────────
app.post('/folders', async (req, res) => {
    try {
        const { name, parentId } = req.body;
        const folder = await FolderModel.create({ name, parentId: parentId || 'root' });
        res.json({ success: true, folder });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ─── DELETE FOLDER ────────────────────────────────────────────────────────────
app.delete('/folders/:id', async (req, res) => {
    try {
        await FolderModel.findByIdAndDelete(req.params.id);
        // Move files in this folder back to root
        await FileModel.updateMany({ folderId: req.params.id }, { folderId: 'root' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
