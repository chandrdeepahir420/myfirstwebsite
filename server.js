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
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

const tempDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
const upload = multer({ dest: 'temp_uploads/' });

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ DB Error:', err));

// Schemas
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

// Authentication Middleware
const checkAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    try { jwt.verify(token, JWT_SECRET); next(); } catch (err) { res.status(401).json({ success: false }); }
};

// Routes
app.post('/request-otp', async (req, res) => {
    if (req.body.username !== process.env.APP_USERNAME || req.body.password !== process.env.APP_PASSWORD) return res.status(401).json({ success: false });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await OTPModel.deleteMany({}); await OTPModel.create({ code });
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: process.env.TELEGRAM_CHAT_ID, text: `OTP: ${code}` });
    res.json({ success: true });
});

app.post('/verify-otp', async (req, res) => {
    const otp = await OTPModel.findOne({ code: req.body.code, used: false });
    if (!otp) return res.status(401).json({ success: false });
    otp.used = true; await otp.save();
    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token });
});

app.post('/upload', checkAuth, upload.single('myFile'), async (req, res) => {
    try {
        const form = new FormData();
        form.append('chat_id', process.env.TELEGRAM_CHAT_ID);
        form.append('document', fs.createReadStream(req.file.path), { filename: req.file.originalname });
        const resp = await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`, form, { headers: form.getHeaders() });
        const newFile = await FileModel.create({
            name: req.file.originalname, size: (req.file.size/1024/1024).toFixed(2)+'MB',
            fileId: resp.data.result.document.file_id, messageId: resp.data.result.message_id,
            folderId: req.body.folderId || 'root'
        });
        fs.unlinkSync(req.file.path);
        res.json({ success: true, file: newFile });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

app.get('/download/:id', checkAuth, async (req, res) => {
    const file = await FileModel.findById(req.params.id);
    const info = await axios.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${file.fileId}`);
    res.redirect(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${info.data.result.file_path}`);
});

app.get('/files', checkAuth, async (req, res) => {
    const filter = { folderId: req.query.folderId || 'root', isTrashed: { $ne: true } };
    if(req.query.folderId === 'root') filter.$or = [{ folderId: 'root' }, { folderId: { $exists: false } }];
    res.json(await FileModel.find(filter).sort({ uploadedAt: -1 }));
});

app.get('/folders', checkAuth, async (req, res) => {
    res.json(await FolderModel.find({ parentId: req.query.parentId || 'root', isTrashed: { $ne: true } }));
});

// Permanent Delete & Trash routes here...
app.delete('/files/:id/permanent', checkAuth, async (req, res) => {
    const file = await FileModel.findById(req.params.id);
    try { await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, { chat_id: process.env.TELEGRAM_CHAT_ID, message_id: file.messageId }); } catch {}
    await FileModel.findByIdAndDelete(req.params.id); res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => console.log('Server running...'));
