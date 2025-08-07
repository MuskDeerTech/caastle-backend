const express = require('express');
const router = express.Router();
const User = require('../models/User');
const transporter = require('../config/smtp');
const axios = require('axios');
const cheerio = require('cheerio');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Document = require('../models/Document');
const { generateEmbedding } = require('../utils/embedding'); // Embedding utils

// Use memory storage for Vercel
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/save-log', async (req, res) => {
  const { name, email, phone, log } = req.body;
  console.log('Received save-log request:', { name, email, phone, log });
  try {
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ name, email, phone, chatHistory: log, lastUpdated: new Date() });
      console.log('Created new user:', user.email);
    } else {
      user.name = name;
      user.phone = phone;
      user.chatHistory = log;
      user.lastUpdated = new Date();
      console.log('Updated user:', user.email);
    }
    await user.save();
    console.log('User saved successfully');
    res.status(200).json({ message: 'Log saved', lastUpdated: user.lastUpdated });
  } catch (err) {
    console.error('Save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/user-details', async (req, res) => {
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
      res.status(404).json({ message: 'User not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/chat-history', async (req, res) => {
  const { email } = req.query;
  try {
    const user = await User.findOne({ email });
    if (user) {
      res.status(200).json({ chatHistory: user.chatHistory });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/send-email', async (req, res) => {
  const { to, subject, text } = req.body;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
  };
  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Email sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/fetch-website', async (req, res) => {
  const { query } = req.body;
  console.log('Fetching website data for query:', query);
  try {
    const baseUrl = 'https://www.tan90thermal.com';
    const visitedUrls = new Set();
    const contentMap = {};

    const crawlPage = async (url) => {
      if (visitedUrls.has(url) || visitedUrls.size > 10) return;
      visitedUrls.add(url);
      try {
        const response = await axios.get(url, {
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        const $ = cheerio.load(response.data);
        console.log('Crawling:', url);
        const pageTitle = $('title').text() || 'No title';
        const pageContent = $('body').text().trim();
        const specs = $('p, li').map((i, el) => $(el).text()).get().join('\n');
        contentMap[url] = `Title: ${pageTitle}\nContent: ${pageContent}\nSpecs: ${specs.substring(0, 2000)}`;

        $('a[href^="/products/"], a[href^="/technology/"]').each((i, elem) => {
          let href = $(elem).attr('href');
          if (href.startsWith('/')) href = baseUrl + href;
          if (href.startsWith(baseUrl) && !visitedUrls.has(href)) {
            crawlPage(href).catch(err => console.error(`Failed to crawl ${href}:`, err.message));
          }
        });
      } catch (err) {
        console.error(`Error crawling ${url}:`, err.message, err.code);
      }
    };

    await crawlPage(baseUrl + '/products/all-products');
    console.log('Crawled content map:', contentMap);

    let relevantContent = '';
    const siteFuse = new Fuse(Object.entries(contentMap), { keys: [1], threshold: 0.4 });
    const matches = siteFuse.search(query);
    matches.forEach(match => {
      const [url, content] = match.item;
      relevantContent += `${url}: ${content}\n`;
    });

    if (!relevantContent) {
      return res.status(404).json({ error: 'No relevant content found' });
    }

    res.json({ content: relevantContent });
  } catch (err) {
    console.error('Scraping error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to fetch website data', details: err.message });
  }
});

router.post('/upload-document', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  console.log('Received file:', file.originalname, file.mimetype);
  const { originalname, buffer, mimetype } = file; // Use buffer instead of filePath
  let content = '';
  let fileType = '';

  try {
    const ext = originalname.split('.').pop().toLowerCase();
    if (mimetype === 'application/pdf' || ext === 'pdf') {
      fileType = 'pdf';
      const pdfData = await pdfParse(buffer); // Parse from buffer
      content = pdfData.text;
    } else if (['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/octet-stream'].includes(mimetype) || ext === 'docx' || ext === 'doc') {
      fileType = 'docx';
      console.log('Processing DOCX:', originalname);
      try {
        const result = await mammoth.extractRawText({ buffer }); // Use buffer for mammoth
        content = result.value || '';
        if (!content) throw new Error('Mammoth extracted no text');
      } catch (mammothErr) {
        console.error('Mammoth error:', mammothErr.message, mammothErr.stack);
        throw new Error(`Failed to extract DOCX text: ${mammothErr.message}`);
      }
    } else if (mimetype === 'text/plain' || ext === 'txt') {
      fileType = 'txt';
      content = buffer.toString('utf8'); // Convert buffer to string
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use PDF, DOCX, or TXT.' });
    }

    if (!content) throw new Error('No content extracted from file');

    const newDoc = new Document({
      title: originalname,
      content,
      fileType,
    });
    await newDoc.save();
    console.log('Document saved to MongoDB:', newDoc.title);

    res.status(200).json({ message: 'Document uploaded and stored', title: originalname });
  } catch (err) {
    console.error('Upload error:', err.message, err.stack);
    res.status(500).json({ error: `Failed to process document: ${err.message}` });
  }
});

router.post('/fetch-context', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  try {
    const queryEmbedding = await generateEmbedding(query);

    const results = await Document.aggregate([
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: 10,
          limit: 3,
        },
      },
      {
        $project: {
          title: 1,
          snippet: { $substr: ['$content', 0, 500] },
        },
      },
    ]);

    if (!results.length) return res.status(404).json({ error: 'No relevant content found' });

    const context = results.map(doc => `${doc.title}: ${doc.snippet.trim()}...`).join('\n\n');
    res.json({ context });
  } catch (err) {
    console.error('Vector search error:', err.message);
    res.status(500).json({ error: 'Vector search failed' });
  }
});

module.exports = router;