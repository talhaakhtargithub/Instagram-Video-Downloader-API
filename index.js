const express = require("express");
const app = express();
const snapsave = require("./snapsave-downloader/src/index");

app.get("/", (req, res) => {
    res.json({ status: "ok" });
});

app.get("/igdl", async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "URL parameter is required" });
    try {
        const result = await snapsave(url);
        res.json(result);
    } catch (err) {
        console.error("Error:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(5000, () => console.log("Server running on port 5000"));
