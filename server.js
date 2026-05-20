const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage() });

// ================== ⚙️ RENDER SECURE CORE ENVIRONMENT VARIABLES ==================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const APP_USERNAME = process.env.APP_USERNAME;
const APP_PASSWORD = process.env.APP_PASSWORD;
const MONGO_URI = process.env.MONGO_URI;
// =================================================================================

// 🌐 Connect to MongoDB Cloud Database securely
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Engine connected successfully!'))
    .catch(err => console.error('❌ MongoDB Engine connection failed:', err));

// 📁 Folders Schema Structure
const FolderSchema = new mongoose.Schema({
    name: String,
    parentId: { type: String, default: 'root' },
    createdAt: { type: Date, default: Date.now }
});
const FolderModel = mongoose.model('Folder', FolderSchema);

// 📄 Files Schema Structure (WITH messageId FOR PERMANENT DELETE)
const FileSchema = new mongoose.Schema({
    name: String,
    size: String,
    url: String,
    folderId: { type: String, default: 'root' },
    messageId: Number, // ⬅️ Telegram message ID for permanent deletion
    uploadedAt: { type: Date, default: Date.now }
});
const FileModel = mongoose.model('File', FileSchema);

// 🔐 Temporary Verification Tokens Lock Schema 
const OTPSchema = new mongoose.Schema({
    code: String,
    used: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, expires: 300 } // Auto-destruct system logs after 5 minutes
});
const OTPModel = mongoose.model('OTP', OTPSchema);

app.use(express.json());
app.use(express.static('.'));

// 1. 🔑 STEP 1: Request OTP Route
app.post('/request-otp', async (req, res) => {
    const { username, password } = req.body;
    if (username !== APP_USERNAME || password !== APP_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Galat credentials!' });
    }
    try {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await OTPModel.deleteMany({}); // Flush outdated active tokens
        await OTPModel.create({ code });

        const msg = `🔐 *TeleDrive Security verification*\n\nYour 6-Digit Authentication code is: *${code}*\n\nToken code expires automatically in 5 minutes rules layer.`;
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: msg,
            parse_mode: 'Markdown'
        });

        res.json({ success: true, message: 'OTP sent to Telegram!' });
    } catch (err) {
        console.error('OTP delivery layer crash:', err.message);
        res.status(500).json({ success: false, message: 'OTP token delivery dropped.' });
    }
});

// 2. 🔑 STEP 2: Verify OTP Route
app.post('/verify-otp', async (req, res) => {
    const { code } = req.body;
    try {
        const otp = await OTPModel.findOne({ code, used: false });
        if (!otp) return res.status(401).json({ success: false, message: 'Galat ya expired OTP!' });
        
        otp.used = true;
        await otp.save();
        res.json({ success: true, message: 'Login successful!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Authentication verification fault.' });
    }
});

// 3. ⬆️ Advanced File Upload Route (Saves messageId)
app.post('/upload', upload.single('myFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file context attached.' });
        const folderId = req.body.folderId || 'root';

        const form = new FormData();
        form.append('chat_id', TELEGRAM_CHAT_ID);
        form.append('document', req.file.buffer, { filename: req.file.originalname });

        const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (response.data.ok) {
            const fileData = response.data.result.document;
            const messageId = response.data.result.message_id; // ⬅️ Capturing Message ID

            const fileInfoResponse = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileData.file_id}`);
            const filePath = fileInfoResponse.data.result.file_path;
            const directDownloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

            const newFile = await FileModel.create({
                name: req.file.originalname,
                size: (req.file.size / (1024 * 1024)).toFixed(2) + ' MB',
                url: directDownloadUrl,
                folderId: folderId,
                messageId: messageId // ⬅️ Saving to MongoDB
            });

            res.json({ success: true, message: 'Uploaded successfully!', file: newFile });
        } else {
            res.status(500).json({ message: 'Telegram cloud refused storage pipeline.' });
        }
    } catch (error) {
        console.error('Upload core block error:', error.message);
        res.status(500).json({ message: 'Internal servers mapping error.' });
    }
});

// 4. 📂 Get Current Directory Files Route
app.get('/files', async (req, res) => {
    try {
        const folderId = req.query.folderId || 'root';
        const files = await FileModel.find({ folderId }).sort({ uploadedAt: -1 });
        res.json(files);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. 🔍 Global Search Support Route
app.get('/files/all', async (req, res) => {
    try {
        const files = await FileModel.find({}).sort({ uploadedAt: -1 });
        res.json(files);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. 🗑️ Delete Specific File Route (PERMANENT DELETE FROM TELEGRAM)
app.delete('/files/:id', async (req, res) => {
    try {
        const file = await FileModel.findById(req.params.id);
        if (!file) return res.status(404).json({ success: false, message: 'File not found' });

        // ⭐ Agar messageId available hai, toh Telegram Server se delete karein
        if (file.messageId) {
            try {
                await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
                    chat_id: TELEGRAM_CHAT_ID,
                    message_id: file.messageId
                });
                console.log(`Telegram server se file udha di gayi: ${file.name}`);
            } catch (tgError) {
                console.log("Telegram se delete nahi ho payi (shayad pehle hi delete ho chuki thi).");
            }
        }

        // ⭐ Ab apni Website ke MongoDB Database se mita dijiye
        await FileModel.findByIdAndDelete(req.params.id);
        res.json({ success: true });
        
    } catch (err) { 
        console.error('Delete error:', err.message);
        res.status(500).json({ success: false }); 
    }
});

// 7. 📦 Bulk Move File Route
app.patch('/files/:id/move', async (req, res) => {
    try {
        await FileModel.findByIdAndUpdate(req.params.id, { folderId: req.body.folderId });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 8. 📂 Get Folders Route
app.get('/folders', async (req, res) => {
    try {
        const parentId = req.query.parentId || 'root';
        const folders = await FolderModel.find({ parentId }).sort({ createdAt: -1 });
        res.json(folders);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 9. 📂 Create Folder Route
app.post('/folders', async (req, res) => {
    try {
        const { name, parentId } = req.body;
        const folder = await FolderModel.create({ name, parentId: parentId || 'root' });
        res.json({ success: true, folder });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 10. 🗑️ Delete Folder Route
app.delete('/folders/:id', async (req, res) => {
    try {
        await FolderModel.findByIdAndDelete(req.params.id);
        await FileModel.updateMany({ folderId: req.params.id }, { folderId: 'root' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Secure Operations Core listening at port ${PORT}`);
});
