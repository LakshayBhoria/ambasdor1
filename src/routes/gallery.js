const express = require('express');
const store = require('../store');
const router = express.Router();

const CATEGORIES = ['Rewards', 'Events', 'Ambassadors', 'Certificates'];
const publicItem = (g) => ({ id: g.id, title: g.title, caption: g.caption || '', category: g.category, imageUrl: g.imageUrl, featured: !!g.featured, date: g.createdAt });

router.get('/', async (req, res) => {
  const all = (await store.readAll('gallery')).sort((a, b) => (b.featured - a.featured) || b.createdAt.localeCompare(a.createdAt));
  const cat = String(req.query.category || '');
  const items = (CATEGORIES.includes(cat) ? all.filter(g => g.category === cat) : all).slice(0, 200).map(publicItem);
  res.set('Cache-Control', 'public, max-age=30');
  res.json({ items, categories: CATEGORIES });
});

module.exports = router;
module.exports.CATEGORIES = CATEGORIES;
