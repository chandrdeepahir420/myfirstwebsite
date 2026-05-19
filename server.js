const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');

const app = express();
const PORT = 3000;

const upload = multer({ storage: multer.memoryStorage() });

const TELEGRAM_BOT_TOKEN = '8215791987:AAFKWHNcRZSiHEmfyW9P1m_fz_8Obo5kSCg';
const TELEGRAM_CHAT_ID = '7889415421';

const APP_USERNAME = 'CHANDRDEEP'; 
const APP_PASSWORD = 'Mnb1134';

const DB_FILE = 'database.json';

function readDatabase() {
    try {
        if (!fs.existsSync(DB_FILE)) return [];
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch { return []; }
}

function writeDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

app.use(express.json());
app.use(express.static('.'));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === APP_USERNAME && password === APP_PASSWORD) {
        res.json({ success: true, message: "Login Successful!" });
    } else {
        res.status(401).json({ success: false, message: "Galat Username ya Password!" });
    }
});

app.post('/upload', upload.single('myFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "Koi file nahi mili!" });

        const form = new FormData();
        form.append('chat_id', TELEGRAM_CHAT_ID);
        form.append('document', req.file.buffer, { filename: req.file.originalname });

        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`;
        const response = await axios.post(telegramUrl, form, { headers: form.getHeaders() });

        if (response.data.ok) {
            const fileId = response.data.result.document.file_id;

            const fileInfoResponse = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
            const filePath = fileInfoResponse.data.result.file_path;
            const directDownloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;

            const newFileRecord = {
                name: req.file.originalname,
                size: (req.file.size / (1024 * 1024)).toFixed(2) + " MB",
                url: directDownloadUrl
            };

            const currentFiles = readDatabase();
            currentFiles.push(newFileRecord);
            writeDatabase(currentFiles);

            res.json({ message: "File Telegram par upload ho gayi! 🎉" });
        } else {
            console.log("Telegram error response:", response.data);
            res.status(500).json({ message: "Telegram error!" });
        }
    } catch (error) {
        console.error("Full error:", error.message);
        console.log("Axios error detail:", error.response?.data);
        res.status(500).json({ message: "Server error!" });
    }
});

app.get('/files', (req, res) => {
    try {
        const files = readDatabase();
        res.json(files);
    } catch (error) {
        console.error("Files route error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log("Server is alive and waiting...");
});