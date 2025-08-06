const express = require('express');
const router = express.Router();
const User = require('../models/User');
const transporter = require('../config/smtp');
const axios = require('axios');
const cheerio = require('cheerio');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');

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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

router.post('/upload-document', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  console.log('Received file:', file.originalname, file.mimetype);
  const { originalname, path: filePath, mimetype } = file;
  let content = '';
  let fileType = '';

  try {
    const ext = originalname.split('.').pop().toLowerCase();
    if (mimetype === 'application/pdf' || ext === 'pdf') {
      fileType = 'pdf';
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      content = pdfData.text;
    } else if (['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/octet-stream'].includes(mimetype) || ext === 'docx' || ext === 'doc') {
      fileType = 'docx';
      console.log('Processing DOCX:', filePath);
      try {
        const result = await mammoth.extractRawText({ path: filePath });
        content = result.value || '';
        if (!content) throw new Error('Mammoth extracted no text');
      } catch (mammothErr) {
        console.error('Mammoth error:', mammothErr.message, mammothErr.stack);
        throw new Error(`Failed to extract DOCX text: ${mammothErr.message}`);
      }
    } else if (mimetype === 'text/plain' || ext === 'txt') {
      fileType = 'txt';
      content = fs.readFileSync(filePath, 'utf8');
    } else {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Unsupported file type. Use PDF, DOCX, or TXT.' });
    }

    if (!content) throw new Error('No content extracted from file');

    const newDoc = new Document({
      title: originalname,
      content,
      fileType,
    });
    await newDoc.save();

    fs.unlinkSync(filePath);
    res.status(200).json({ message: 'Document uploaded and stored', title: originalname });
  } catch (err) {
    fs.unlinkSync(filePath);
    console.error('Upload error:', err.message, err.stack);
    res.status(500).json({ error: `Failed to process document: ${err.message}` });
  }
});

router.post('/fetch-context', async (req, res) => {
  const { query } = req.body;
  console.log('Fetching context for query:', query);
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

    try {
      await crawlPage(baseUrl + '/products/all-products');
    } catch (crawlErr) {
      console.warn('Crawling failed, proceeding with documents:', crawlErr.message);
    }

    let documents;
    try {
      documents = await Document.find({});
      documents.forEach(doc => {
        contentMap[`doc:${doc.title}`] = `Title: ${doc.title}\nContent: ${doc.content.substring(0, 2000)}`;
      });
    } catch (dbErr) {
      console.error('Database error fetching documents:', dbErr.message);
      documents = []; // Fallback to empty if DB fails
    }

    const Fuse = require('fuse.js');
    const siteFuse = new Fuse(Object.entries(contentMap), {
      keys: [{ name: '1', weight: 1 }], // Search the content (index 1)
      threshold: 0.2, // Lowered threshold to increase match sensitivity
      ignoreLocation: true,
      findAllMatches: true,
      includeScore: true,
    });
    const matches = siteFuse.search(query);

    let relevantContent = '';
    matches.forEach(match => {
      const [url, content] = match.item;
      relevantContent += `${url}: ${content}\n`;
    });

    if (!relevantContent) {
      return res.status(404).json({ error: 'No relevant content found' });
    }
    res.json({ content: relevantContent });
  } catch (err) {
    console.error('Context fetch error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to fetch context', details: err.message });
  }
});

module.exports = router;