require("dotenv").config();

const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");

const PORT = process.env.PORT;

app.use(cors());

app.get("/get-token", (req, res) => {
  try {
    const API_KEY = process.env.VIDEOSDK_API_KEY;
    const SECRET_KEY = process.env.VIDEOSDK_SECRET_KEY;
    const options = { expiresIn: "10m", algorithm: "HS256" };

    let payload = {
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

app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});
