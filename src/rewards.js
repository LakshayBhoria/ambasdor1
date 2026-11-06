// Reward tiers. Defaults are seeded into settings on first boot; admins can edit them from the admin panel.
const config = require('./config');

const DEFAULT_TIERS = [
  { id: 'rising', threshold: 20, name: 'Rising', tagline: 'Your first rewards',
    items: ['Official ThinKorix T-shirt', 'Cash bonus'], cash: 0, needsShipping: true, needsSize: true },
  { id: 'champion', threshold: 30, name: 'Champion', tagline: 'More gifts, more cash',
    items: ['Goodies pack: mug, notebook and sticker kit', 'Exclusive ThinKorix gift', 'Cash bonus'], cash: 0, needsShipping: true, needsSize: false },
  { id: 'legend', threshold: 50, name: 'Legend', tagline: 'The full ThinKorix package',
    items: ['Premium goodies hamper', 'Cash reward', 'Paid internship at ThinKorix with a stipend of up to {stipend}',
            'Letter of recommendation (LOR)', 'Offer letter', 'Certificate of excellence', 'More gifts'], cash: 0, needsShipping: true, needsSize: false }
];

const sorted = (tiers) => [...tiers].sort((a, b) => a.threshold - b.threshold);
const targetOf = (tiers) => Math.max(...tiers.map(t => t.threshold));

function itemText(t, i) {
  let s = String(i).replace('{stipend}', config.STIPEND_TEXT);
  if (t.cash > 0 && /^cash (bonus|reward)$/i.test(s)) s += ` of ₹${Number(t.cash).toLocaleString('en-IN')}`;
  return s;
}

// Tier list as sent to browsers, personalised when paid/claims are given.
function publicTiers(tiers, paid = 0, claims = []) {
  return sorted(tiers).map(t => {
    const claim = claims.find(c => c.tierId === t.id);
    return {
      id: t.id, threshold: t.threshold, name: t.name, tagline: t.tagline, cash: t.cash || 0,
      items: t.items.map(i => itemText(t, i)), needsShipping: !!t.needsShipping, needsSize: !!t.needsSize,
      unlocked: paid >= t.threshold, remaining: Math.max(0, t.threshold - paid),
      claimed: !!claim, claimStatus: claim ? claim.status : null
    };
  });
}

function validateTiers(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 8) throw new Error('Provide between 1 and 8 reward tiers.');
  const seen = new Set();
  return input.map((t, n) => {
    const id = String(t.id || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const threshold = parseInt(t.threshold, 10);
    const items = (Array.isArray(t.items) ? t.items : []).map(x => String(x).trim().slice(0, 140)).filter(Boolean);
    if (!id || seen.has(id)) throw new Error(`Tier ${n + 1}: id is missing or duplicated.`);
    seen.add(id);
    if (!(threshold >= 1 && threshold <= 10000)) throw new Error(`Tier ${n + 1}: threshold must be a positive number.`);
    if (!items.length) throw new Error(`Tier ${n + 1}: add at least one reward item.`);
    return { id, threshold, name: String(t.name || '').trim().slice(0, 40) || id, tagline: String(t.tagline || '').trim().slice(0, 80),
      items, cash: Math.max(0, Number(t.cash) || 0), needsShipping: !!t.needsShipping, needsSize: !!t.needsSize };
  });
}

module.exports = { DEFAULT_TIERS, publicTiers, validateTiers, sorted, targetOf };
