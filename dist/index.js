"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const nodemailer_1 = __importDefault(require("nodemailer"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const PORT = process.env.PORT || "3000";
async function fetchTranscriptionAndSummaryFilePaths(transcriptionId) {
    const API_KEY = process.env.VIDEOSDK_API_KEY;
    const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY || "defaultsecretkey";
    const tokenOptions = {
        expiresIn: "10m",
        algorithm: "HS256",
    };
    const token = jsonwebtoken_1.default.sign({ apikey: API_KEY }, SECRET_KEY, tokenOptions);
    const options = {
        method: "GET",
        headers: {
            Authorization: `${token}`,
        },
    };
    const url = `https://api.videosdk.live/ai/v1/post-transcriptions/${transcriptionId}`;
    const response = await fetch(url, options);
    const data = await response.json();
    return data;
}
async function getTranscription(filePath) {
    const response = await fetch(filePath);
    const data = await response.text();
    return data;
}
async function getSummary(filePath) {
    const response = await fetch(filePath);
    const data = await response.text();
    return data;
}
function sendSummaryAndTranscriptionEmail(email, transcriptionStream, summaryStream) {
    const transporter = nodemailer_1.default.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_ID,
            pass: process.env.EMAIL_PASS,
        },
        debug: true,
    });
    const mailOptions = {
        from: process.env.EMAIL_ID,
        to: email,
        subject: "Transcription and Summary",
        attachments: [
            {
                filename: "transcription.txt",
                content: transcriptionStream,
            },
            {
                filename: "summary.txt",
                content: summaryStream,
            },
        ],
    };
    transporter.sendMail(mailOptions, function (err, response) {
        if (err) {
            console.log(err);
        }
        else {
            console.log(response);
        }
    });
}
async function getParticipantEmailList(sessionId) {
    const API_KEY = process.env.VIDEOSDK_API_KEY;
    const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY || "defaultsecretkey";
    const tokenOptions = {
        expiresIn: "10m",
        algorithm: "HS256",
    };
    const token = jsonwebtoken_1.default.sign({ apikey: API_KEY }, SECRET_KEY, tokenOptions);
    const options = {
        method: "GET",
        headers: {
            Authorization: `${token}`,
            "Content-Type": "application/json",
        },
    };
    const url = `https://api.videosdk.live/v2/sessions/${sessionId}`;
    const response = await fetch(url, options);
    const data = await response.json();
    const { participants } = data;
    const participantsEmail = [];
    participants.forEach((elem, _index) => {
        const email = elem.name.substring(elem.name.lastIndexOf("/") + 1);
        participantsEmail.push(email);
    });
    return participantsEmail.filter((email) => email !== "recorder");
}
app.get("/get-token", (_req, res) => {
    try {
        const API_KEY = process.env.VIDEOSDK_API_KEY;
        const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY || "defaultsecretkey";
        const options = { expiresIn: "10m", algorithm: "HS256" };
        const payload = {
            apikey: API_KEY,
            permissions: ["allow_join", "allow_mod"],
            version: 2,
        };
        const token = jsonwebtoken_1.default.sign(payload, SECRET_KEY, options);
        if (token) {
            return res.status(200).json({ success: true, token });
        }
        else {
            return res
                .status(404)
                .json({ success: false, message: "Some bullshit occured" });
        }
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error });
    }
});
app.post("/trans/webhook", async (req, res) => {
    try {
        const { webhookType, data } = req.body;
        if (webhookType === "transcription-stopped") {
            console.log("Transcription has been stopped");
            const { id } = data;
            const transcriptionData = await fetchTranscriptionAndSummaryFilePaths(id);
            const { transcriptionFilePaths, summarizedFilePaths, sessionId } = transcriptionData;
            const participantsEmails = await getParticipantEmailList(sessionId);
            const transcriptionStream = await getTranscription(transcriptionFilePaths.txt);
            const summaryStream = await getSummary(summarizedFilePaths.txt);
            console.log("Transcription Stream:", transcriptionStream);
            console.log("Summary Stream:", summaryStream);
            console.log("Participant Emails: ", participantsEmails);
            participantsEmails.forEach((email) => {
                sendSummaryAndTranscriptionEmail(email, transcriptionStream, summaryStream);
            });
            return res.status(200).json({ success: true });
        }
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error });
    }
});
app.listen(PORT, () => {
    console.log(`Server running on PORT ${PORT}`);
});
