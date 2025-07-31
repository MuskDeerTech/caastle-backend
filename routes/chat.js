const express = require('express');
const router = express.Router();
const User = require('../models/User');
const transporter = require('../config/smtp');
const axios = require('axios');
const cheerio = require('cheerio');

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
      if (visitedUrls.has(url) || visitedUrls.size > 10) return; // Limit to 10 pages
      visitedUrls.add(url);
      try {
        const response = await axios.get(url, {
          timeout: 10000, // 10s timeout
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, // Mimic browser
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

module.exports = router;