const express = require("express");
const router = express.Router();
const User = require("../models/User");
const transporter = require("../config/smtp");
const axios = require("axios");
const cheerio = require("cheerio");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const Document = require("../models/Document");
const { getEmbedding } = require("../utils/embedding"); // Import embedding utility
const Fuse = require("fuse.js"); // Add Fuse import
const cosineSimilarity = require("compute-cosine-similarity");

// Use memory storage for Vercel
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/save-log', async (req, res) => {
  const { name, email, phone, log } = req.body;
  try {
    const user = await User.findOneAndUpdate(
      { email },
      { name, phone, chatHistory: log, lastUpdated: new Date() }, // Ensure 'chatHistory' is correct
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    console.log('User saved successfully at 10:50 PM IST, August 09, 2025:', user.email);
    res.status(200).json({ message: 'Log saved', lastUpdated: user.lastUpdated });
  } catch (err) {
    console.error('Save error at 10:50 PM IST, August 09, 2025:', err.message, err.stack);
    res.status(500).json({ error: 'Save log failed', details: err.message });
  }
});

router.get("/user-details", async (req, res) => {
  const { email } = req.query;
  try {
    const user = await User.findOne({ email });
    if (user) {
      res.status(200).json({
        name: user.name,
        email: user.email,
        phone: user.phone,
        lastUpdated: user.lastUpdated,
      });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/chat-history", async (req, res) => {
  const { email } = req.query;
  try {
    const user = await User.findOne({ email });
    if (user) {
      res.status(200).json({ chatHistory: user.chatHistory });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/send-email", async (req, res) => {
  const { to, subject, text } = req.body;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
  };
  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "Email sent" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/fetch-website", async (req, res) => {
  const { query } = req.body;
  console.log("Fetching website data for query:", query);
  try {
    const baseUrl = "https://www.tan90thermal.com";
    const visitedUrls = new Set();
    const contentMap = {};

    const crawlPage = async (url) => {
      if (visitedUrls.has(url) || visitedUrls.size > 10) return;
      visitedUrls.add(url);
      try {
        const response = await axios.get(url, {
          timeout: 10000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        const $ = cheerio.load(response.data);
        console.log("Crawling:", url);
        const pageTitle = $("title").text() || "No title";
        const pageContent = $("body").text().trim();
        const specs = $("p, li")
          .map((i, el) => $(el).text())
          .get()
          .join("\n");
        contentMap[
          url
        ] = `Title: ${pageTitle}\nContent: ${pageContent}\nSpecs: ${specs.substring(
          0,
          2000
        )}`;

        $('a[href^="/products/"], a[href^="/technology/"]').each((i, elem) => {
          let href = $(elem).attr("href");
          if (href.startsWith("/")) href = baseUrl + href;
          if (href.startsWith(baseUrl) && !visitedUrls.has(href)) {
            crawlPage(href).catch((err) =>
              console.error(`Failed to crawl ${href}:`, err.message)
            );
          }
        });
      } catch (err) {
        console.error(`Error crawling ${url}:`, err.message, err.code);
      }
    };

    await crawlPage(baseUrl + "/products/all-products");
    console.log("Crawled content map:", contentMap);

    let relevantContent = "";
    const siteFuse = new Fuse(Object.entries(contentMap), {
      keys: [1],
      threshold: 0.4,
    });
    const matches = siteFuse.search(query);
    matches.forEach((match) => {
      const [url, content] = match.item;
      relevantContent += `${url}: ${content}\n`;
    });

    if (!relevantContent) {
      return res.status(404).json({ error: "No relevant content found" });
    }

    res.json({ content: relevantContent });
  } catch (err) {
    console.error("Scraping error:", err.message, err.stack);
    res
      .status(500)
      .json({ error: "Failed to fetch website data", details: err.message });
  }
});

router.post("/upload-document", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  console.log("Received file:", file.originalname, file.mimetype);
  const { originalname, buffer, mimetype } = file;
  let content = "";
  let fileType = "";

  try {
    const ext = originalname.split(".").pop().toLowerCase();
    if (mimetype === "application/pdf" || ext === "pdf") {
      fileType = "pdf";
      const pdfData = await pdfParse(buffer);
      content = pdfData.text;
    } else if (
      [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "application/octet-stream",
      ].includes(mimetype) ||
      ext === "docx" ||
      ext === "doc"
    ) {
      fileType = "docx";
      console.log("Processing DOCX:", originalname);
      try {
        const result = await mammoth.extractRawText({ buffer });
        content = result.value || "";
        if (!content) throw new Error("Mammoth extracted no text");
      } catch (mammothErr) {
        console.error("Mammoth error:", mammothErr.message, mammothErr.stack);
        throw new Error(`Failed to extract DOCX text: ${mammothErr.message}`);
      }
    } else if (mimetype === "text/plain" || ext === "txt") {
      fileType = "txt";
      content = buffer.toString("utf8");
    } else {
      return res
        .status(400)
        .json({ error: "Unsupported file type. Use PDF, DOCX, or TXT." });
    }

    if (!content) throw new Error("No content extracted from file");

    const embedding = await getEmbedding(content); // Generate embedding
    const newDoc = new Document({
      title: originalname,
      content,
      fileType,
      embedding, // Store embedding
    });
    await newDoc.save();
    console.log("Document saved to MongoDB:", newDoc.title);

    res
      .status(200)
      .json({ message: "Document uploaded and stored", title: originalname });
  } catch (err) {
    console.error("Upload error:", err.message, err.stack);
    res
      .status(500)
      .json({ error: `Failed to process document: ${err.message} ` });
  }
});

router.post('/fetch-context', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  try {
    // 1️⃣ Generate query embedding
    const queryEmbedding = await getEmbedding(query);

    // 2️⃣ Use Atlas Vector Search with enhanced configuration
    let results = await Document.aggregate([
      {
        $vectorSearch: {
          index: 'vectors_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: 300, // Increase for better precision
          limit: 3,
          filter: {},
        }
      },
      {
        $project: {
          title: 1,
          content: 1, // Return full content instead of snippet
          score: { $meta: 'vectorSearchScore' }
        }
      }
    ]).catch(err => {
      console.error('Vector search failed at 09:15 PM IST, August 09, 2025:', err.message, err.stack);
      return [];
    });

    let context = '';
    if (!results.length) {
      const documents = await Document.find({}, { title: 1, content: 1, embedding: 1 });
      const scoredDocs = documents.map(doc => {
        if (!doc.embedding || doc.embedding.length !== queryEmbedding.length) {
          console.warn(`Invalid embedding for document ${doc.title} at 09:15 PM IST, August 09, 2025`);
          return { title: doc.title, content: doc.content, score: -1 };
        }
        const score = cosineSimilarity(queryEmbedding, doc.embedding);
        return { title: doc.title, content: doc.content, score };
      });
      scoredDocs.sort((a, b) => b.score - a.score).filter(doc => doc.score > 0.02);
      results = scoredDocs.slice(0, 3).map(doc => ({ title: doc.title, content: doc.content, score: doc.score }));
    }

    if (!results.length) {
      return res.status(404).json({ error: 'No relevant content found' });
    }

    context = results.map(doc => `${doc.title}: ${doc.content.trim()} (Score: ${doc.score?.toFixed(3) || 'N/A'})`).join('\n\n');
    res.json({ context });
  } catch (err) {
    console.error('Fetch context error at 09:15 PM IST, August 09, 2025:', err.message, err.stack);
    res.status(500).json({ error: 'Fetch context failed', details: err.message });
  }
});

module.exports = router;