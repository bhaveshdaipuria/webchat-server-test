const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const nodemailer = require("nodemailer");

const PORT = process.env.PORT;

const app = express();
app.use(cors());
app.use(express.json());

async function fetchTranscriptionAndSummaryFilePaths(transcriptionId) {
  const API_KEY = process.env.VIDEOSDK_API_KEY;
  const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;
  const tokenOptions = { expiresIn: "10m", algorithm: "HS256" };

  const token = jwt.sign({ apikey: API_KEY }, SECRET_KEY, tokenOptions);

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

function sendSummaryAndTranscriptionEmail(
  email,
  transcriptionStream,
  summaryStream,
) {
  let success = false;
  const transporter = nodemailer.createTransport({
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
    } else {
      success = true;
      console.log(response);
    }
  });
}

async function getParticipantEmailList(sessionId) {
  const participantsEmail = [];
  const API_KEY = process.env.VIDEOSDK_API_KEY;
  const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;
  const tokenOptions = { expiresIn: "10m", algorithm: "HS256" };

  const token = jwt.sign({ apikey: API_KEY }, SECRET_KEY, tokenOptions);
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
  participants.forEach((elem, _index) => {
    const email = elem.name.substring(elem.name.lastIndexOf("/") + 1);
    participantsEmail.push(email);
  });
  return participantsEmail.filter((email) => email !== "recorder");
}

app.get("/get-token", (req, res) => {
  try {
    const API_KEY = process.env.VIDEOSDK_API_KEY;
    const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;
    const options = { expiresIn: "10m", algorithm: "HS256" };

    const payload = {
      apikey: API_KEY,
      permissions: ["allow_join", "allow_mod"],
      version: 2,
    };
    const token = jwt.sign(payload, SECRET_KEY, options);
    if (token) {
      return res.status(200).json({ success: true, token });
    } else {
      return res
        .status(404)
        .json({ success: false, message: "Some bullshit occured" });
    }
  } catch (error) {
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
      const { transcriptionFilePaths, summarizedFilePaths, sessionId } =
        transcriptionData;
      const participantsEmails = await getParticipantEmailList(sessionId);
      const transcriptionStream = await getTranscription(
        transcriptionFilePaths.txt,
      );
      const summaryStream = await getSummary(summarizedFilePaths.txt);
      console.log("Transcription Stream:", transcriptionStream);
      console.log("Summary Stream:", summaryStream);
      console.log("Participant Emails: ", participantsEmails);
      participantsEmails.forEach((email) => {
        sendSummaryAndTranscriptionEmail(
          email,
          transcriptionStream,
          summaryStream,
        );
      });
      return res.status(200).json({ success: true });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});
