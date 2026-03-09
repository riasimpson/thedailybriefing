const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const NEWS_ENDPOINT = "https://newsdata.io/api/1/latest";
const PRIMARY_DOMAINS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "theguardian.com",
  "foxnews.com"
];

app.use(express.static(__dirname));

app.get("/api/news", async (req, res) => {
  try {
    const apiKey = process.env.NEWSDATA_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ status: "error", message: "Missing NEWSDATA_API_KEY env var." });
    }

    const url = new URL(NEWS_ENDPOINT);
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("language", "en");
    url.searchParams.set("domain", PRIMARY_DOMAINS.join(","));
    url.searchParams.set("size", "10");

    const response = await fetch(url.toString(), { cache: "no-store" });
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({
        status: "error",
        message: `NewsData returned invalid JSON: ${text.slice(0, 200)}`
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        status: "error",
        message: data.message || `NewsData request failed (${response.status})`
      });
    }

    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message || "Server proxy failed."
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});