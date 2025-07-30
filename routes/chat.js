const express = require('express');
const router = express.Router();
const User = require('../models/User');
const transporter = require('../config/smtp');
const axios = require('axios');
const cheerio = require('cheerio');

router.post('/save-log', async (req, res) => {
  const { name, email, phone, log } = req.body;
  try {
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({ name, email, phone, chatHistory: log, lastUpdated: new Date() });
    } else {
      user.name = name;
      user.phone = phone;
      user.chatHistory = log;
      user.lastUpdated = new Date();
    }
    await user.save();
    res.status(200).json({ message: 'Log saved', lastUpdated: user.lastUpdated });
  } catch (err) {
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
    // Start with the homepage
    const baseUrl = 'https://www.tan90thermal.com';
    const visitedUrls = new Set();
    const contentMap = {};

    const crawlPage = async (url) => {
      if (visitedUrls.has(url)) return;
      visitedUrls.add(url);
      try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        console.log('Crawling:', url);
        // Extract text content from the page
        const pageContent = $('body').text().trim();
        contentMap[url] = pageContent;

        // Find all internal links to crawl
        $('a[href]').each((i, elem) => {
          let href = $(elem).attr('href');
          if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
            if (href.startsWith('/')) href = baseUrl + href;
            else if (!href.startsWith('http')) href = new URL(href, url).href;
            if (href.startsWith(baseUrl) && !visitedUrls.has(href)) {
              crawlPage(href).catch(err => console.error(`Failed to crawl ${href}:`, err.message));
            }
          }
        });
      } catch (err) {
        console.error(`Error crawling ${url}:`, err.message);
      }
    };

    await crawlPage(baseUrl);
    console.log('Crawled content map:', contentMap);

    // Search for query in all crawled content
    let relevantContent = '';
    for (const [url, content] of Object.entries(contentMap)) {
      if (query ? content.toLowerCase().includes(query.toLowerCase()) : true) {
        relevantContent += `${url}: ${content.substring(0, 200)}...\n`; // Limit to 200 chars for brevity
      }
    }

    if (!relevantContent) {
      console.warn('No relevant content found, falling back to static data');
      return res.status(404).json({ error: 'No relevant content found' });
    }

    res.json({ content: relevantContent });
  } catch (err) {
    console.error('Scraping error:', err.message);
    res.status(500).json({ error: 'Failed to fetch website data' });
  }
});

module.exports = router;