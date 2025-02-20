import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const app: express.Application = express();
app.use(cors());
app.use(express.json());

const PORT: string = process.env.PORT || "3000";

interface PostTranscriptionResponse {
  id: string;
  status: string;
  roomId: string;
  sessionId: string;
  recordingId: string;
  filePath: string;
  transcriptionFilePaths: {
    json: string;
    srt: string;
    txt: string;
    tsv: string;
    vtt: string;
  };
  summarizedFilePaths: {
    txt: string;
  };
  start: string;
  end: string;
}

async function fetchTranscriptionAndSummaryFilePaths(
  transcriptionId: string,
): Promise<PostTranscriptionResponse> {
  const API_KEY = process.env.VIDEOSDK_API_KEY;
  const SECRET_KEY: jwt.Secret =
    process.env.VIDEOSDK_SECRET_KEY || "defaultsecretkey";
  const tokenOptions: jwt.SignOptions = {
    expiresIn: "10m",
    algorithm: "HS256",
  };

  const token = jwt.sign({ apikey: API_KEY }, SECRET_KEY, tokenOptions);

  const options = {
    method: "GET",
    headers: {
      Authorization: `${token}`,
    },
  };
  const url = `https://api.videosdk.live/ai/v1/post-transcriptions/${transcriptionId}`;
  const response = await fetch(url, options);
  const data: PostTranscriptionResponse = await response.json();
  return data;
}

async function getTranscription(filePath: string): Promise<string> {
  const response = await fetch(filePath);
  const data: string = await response.text();
  return data;
}

async function getSummary(filePath: string): Promise<string> {
  const response = await fetch(filePath);
  const data: string = await response.text();
  return data;
}

function sendSummaryAndTranscriptionEmail(
  email: string,
  transcriptionStream: string,
  summaryStream: string,
) {
  const transporter: nodemailer.Transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_ID,
      pass: process.env.EMAIL_PASS,
    },
    debug: true,
  });
  const mailOptions: nodemailer.SendMailOptions = {
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
  transporter.sendMail(
    mailOptions,
    function(err, response: nodemailer.SentMessageInfo) {
      if (err) {
        console.log(err);
      } else {
        console.log(response);
      }
    },
  );
}

async function getParticipantEmailList(sessionId: string): Promise<string[]> {
  const API_KEY = process.env.VIDEOSDK_API_KEY;
  const SECRET_KEY: jwt.Secret =
    process.env.VIDEOSDK_SECRET_KEY || "defaultsecretkey";
  const tokenOptions: jwt.SignOptions = {
    expiresIn: "10m",
    algorithm: "HS256",
  };

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
  interface TimeLogEntry {
    start: string;
    end: string;
  }

  interface Participant {
    _id: string;
    externalId: string;
    name: string;
    timelog: TimeLogEntry[];
  }
  const participantsEmail: string[] = [];
  participants.forEach((elem: Participant, _index: number) => {
    const email: string = elem.name.substring(elem.name.lastIndexOf("/") + 1);
    participantsEmail.push(email);
  });
  return participantsEmail.filter((email) => email !== "recorder");
}

app.get("/get-token", (_req: express.Request, res: express.Response) => {
  try {
    const API_KEY = process.env.VIDEOSDK_API_KEY;
    const SECRET_KEY: jwt.Secret =
      process.env.VIDEOSDK_SECRET_KEY || "defaultsecretkey";
    const options: jwt.SignOptions = { expiresIn: "10m", algorithm: "HS256" };

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

app.post(
  "/trans/webhook",
  async (req: express.Request, res: express.Response) => {
    try {
      const { webhookType, data } = req.body;
      if (webhookType === "transcription-stopped") {
        console.log("Transcription has been stopped");
        const { id } = data;
        const transcriptionData =
          await fetchTranscriptionAndSummaryFilePaths(id);
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
        participantsEmails.forEach((email: string) => {
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
  },
);

app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});
