const express = require("express");
const app = express();
const snapsave = require("./snapsave-downloader/src/index");
const port = 3000;

app.use(express.json());

app.get("/", (req, res) => {
    res.json({ message: "Hello World!" });
});

// Download Endpoint
app.get("/igdl", async (req, res) => {
    try {
        const url = req.query.url;

        if (!url) {
            return res.status(400).json({ error: "URL parameter is missing" });
        }

        const downloadedURL = await snapsave(url);
        res.json({ url: downloadedURL });
    } catch (err) {
        console.error("Error:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Info Endpoint
app.get('/api/info', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
        const downloadInfo = await snapsave(url);
        res.json(downloadInfo);
    } catch (err) {
        console.error("Error in info endpoint:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
