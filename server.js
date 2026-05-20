const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage() });

// ================== ⚙️ CONFIGURATION ==================
const TELEGRAM_BOT_TOKEN = 'YAHAN_APNI_BOT_TOKEN_PASTE_KAREIN';
const TELEGRAM_CHAT_ID = 'YAHAN_APNI_CHAT_ID_PASTE_KAREIN';

const APP_USERNAME = 'admin'; // Fixed login username
const APP_PASSWORD = 'password123'; // Fixed login password

let currentGeneratedOTP = null; 
// ======================================================

// 🌐 Connect to MongoDB Cloud Database securely via Render Env
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Database se connection safal raha! 🌲"))
    .catch(err => console.error("Database connection fail:", err));

// 📁 Folders Schema Structure
const FolderSchema = new mongoose.Schema({
    name: String,
    parentId: { type: String, default: 'root' },
    createdAt: { type: Date, default: Date.now }
});
const FolderModel = mongoose.model('Folder', FolderSchema);

// 📄 Files Schema Structure
const FileSchema = new mongoose.Schema({
    name: String,
    size: String,
    url: String,
    folderId: { type: String, default: 'root' }, 
    uploadedAt: { type: Date, default: Date.now }
});
const FileModel = mongoose.model('File', FileSchema);

app.use(express.json());
app.use(express.static('.'));

// 🔑 STEP 1: Request OTP Route
app.post('/request-otp', async (req, res) => {
    const { username, password } = req.body;
    if (username === APP_USERNAME && password === APP_PASSWORD) {
        currentGeneratedOTP = Math.floor(100000 + Math.random() * 900000).toString();
        
        try {
            const msg = `🔒 TeleDrive Login Request\n\nYour 6-Digit Verification OTP Code is: ${currentGeneratedOTP}\n\nValid for safe session initialization rules.`;
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: msg
            });
            res.json({ success: true, message: "OTP sent to Telegram!" });
        } catch (err) {
            res.status(500).json({ success: false, message: "Telegram OTP delivery failed." });
        }
    } else {
        res.status(401).json({ success: false, message: "Galat Username ya Password!" });
    }
});

// 🔑 STEP 2: Verify OTP Route
app.post('/verify-otp', (req, res) => {
    const { code } = req.body;
    if (currentGeneratedOTP && code === currentGeneratedOTP) {
        currentGeneratedOTP = null; 
        res.json({ success: true, message: "Authenticated successfully!" });
    } else {
        res.status(400).json({ success: false, message: "Galat OTP code entered!" });
    }
});

// 📂 Create Folder Route
app.post('/folders', async (req, res) => {
    try {
        const { name, parentId } = req.body;
        const newFolder = new FolderModel({ name, parentId });
        await newFolder.save();
        res.json(newFolder);
    } catch { res.status(500).json({ error: "Folder creation error" }); }
});

// 📂 Get Folders Route
app.get('/folders', async (req, res) => {
    try {
        const parentId = req.query.parentId || 'root';
        const folders = await FolderModel.find({ parentId }).sort({ createdAt: 1 });
        res.json(folders);
    } catch { res.status(500).json([]); }
});

// 🗑️ Delete Folder Route
app.delete('/folders/:id', async (req, res) => {
    try {
        const folderId = req.params.id;
        await FolderModel.findByIdAndDelete(folderId);
        await FileModel.updateMany({ folderId }, { folderId: 'root' });
        res.json({ message: "Folder deleted, files moved to root." });
    } catch { res.status(500).json({ error: "Delete process dropped." }); }
});

// ⬆️ File Upload Route
app.post('/upload', upload.single('myFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No file attached." });
        const folderId = req.body.folderId || 'root';

        const form = new FormData();
        form.append('chat_id', TELEGRAM_CHAT_ID);
        form.append('document', req.file.buffer, { filename: req.file.originalname });

        const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, form, { headers: form.getHeaders() });

        if (response.data.ok) {
            const fileData = response.data.result.document;
            const fileInfo = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileData.file_id}`);
            const directDownloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileInfo.data.result.file_path}`;

            const newFile = new FileModel({
                name: req.file.originalname,
                size: (req.file.size / (1024 * 1024)).toFixed(2) + " MB",
                url: directDownloadUrl,
                folderId: folderId
            });
            await newFile.save();
            res.json({ message: "Uploaded successfully!" });
        } else { res.status(500).json({ message: "Telegram system block." }); }
    } catch (err) { res.status(500).json({ message: "Internal server layer crash." }); }
});

// 📂 Get Current Folder Files Route
app.get('/files', async (req, res) => {
    try {
        const folderId = req.query.folderId || 'root';
        const files = await FileModel.find({ folderId }).sort({ uploadedAt: -1 });
        res.json(files);
    } catch { res.status(500).json([]); }
});

// 🔍 Global Search Query Support Route
app.get('/files/all', async (req, res) => {
    try {
        const files = await FileModel.find({});
        res.json(files);
    } catch { res.status(500).json([]); }
});

// 📦 Bulk Move File Route
app.patch('/files/:id/move', async (req, res) => {
    try {
        await FileModel.findByIdAndUpdate(req.params.id, { folderId: req.body.folderId });
        res.json({ success: true });
    } catch { res.status(500).json({ error: "Move context dropped." }); }
});

// 🗑️ Delete Specific File Route
app.delete('/files/:id', async (req, res) => {
    try {
        await FileModel.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch { res.status(500).json({ error: "Delete execution failed." }); }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server executing securely on port ${PORT}`);
});
