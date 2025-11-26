import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const MAX_ID = 1_000_000;

let selectedOrder = [];
const extraIds = new Set();

function normalizeOrder(order) {
  const seen = new Set();
  const result = [];
  for (const raw of order) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (id > MAX_ID && !extraIds.has(id)) {
      extraIds.add(id);
    }
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

app.get('/api/state', (req, res) => {
  res.json({
    selectedOrder,
    extraIds: Array.from(extraIds),
    maxId: MAX_ID,
  });
});

app.post('/api/items/bulk', (req, res) => {
  const body = req.body;
  const ids = Array.isArray(body?.ids) ? body.ids : [];
  const added = [];
  const skipped = [];

  for (const raw of ids) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      skipped.push(raw);
      continue;
    }
    if (id <= MAX_ID) {
      skipped.push(id);
      continue;
    }
    if (!extraIds.has(id)) {
      extraIds.add(id);
      added.push(id);
    } else {
      skipped.push(id);
    }
  }

  res.json({ added, skipped });
});

app.put('/api/selected', (req, res) => {
  const order = Array.isArray(req.body?.order) ? req.body.order : [];
  selectedOrder = normalizeOrder(order);
  res.json({ selectedOrder });
});

app.get('/api/unselected', (req, res) => {
  const filter = typeof req.query.filter === 'string' ? req.query.filter.trim() : '';
  const offset = Number.parseInt(req.query.offset, 10) || 0;
  const limit = Number.parseInt(req.query.limit, 10) || 20;

  const selectedSet = new Set(selectedOrder);
  const items = [];
  let total = 0;

  function matchesFilter(id) {
    if (!filter) return true;
    return String(id).includes(filter);
  }

  for (let id = 1; id <= MAX_ID; id++) {
    if (selectedSet.has(id)) continue;
    if (!matchesFilter(id)) continue;
    if (total >= offset && items.length < limit) {
      items.push(id);
    }
    total++;
    if (items.length >= limit && total >= offset + limit) {}
  }

  const extraSorted = Array.from(extraIds).sort((a, b) => a - b);
  for (const id of extraSorted) {
    if (selectedSet.has(id)) continue;
    if (!matchesFilter(id)) continue;
    if (total >= offset && items.length < limit) {
      items.push(id);
    }
    total++;
    if (items.length >= limit && total >= offset + limit) {}
  }

  res.json({ items, total });
});

app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});


