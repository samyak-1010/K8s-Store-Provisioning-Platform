const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const orchestrator = require('./orchestrator');
const path = require('path');
const fs = require('fs');

const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json());
app.use(cors());

// --- Guardrails ---
const MAX_STORES_PER_INSTANCE = process.env.MAX_STORES || 10;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});

const createStoreLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit store creation to 5 per hour per IP
  message: { error: 'Store creation limit reached.' }
});

// Apply granular limits
app.use('/api/', apiLimiter);

// --- Database Setup ---
// In production, this would be a PVC path
const dbPath = process.env.DB_PATH || '/data/platform.db';
// Ensure dir exists
try {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
} catch (err) {
  console.error("Error ensuring DB directory:", err);
}

const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    url TEXT,
    createdAt TEXT
  )
`);

// --- API Endpoints ---

// LIST Stores
app.get('/api/stores', (req, res) => {
  const stmt = db.prepare('SELECT * FROM stores ORDER BY createdAt DESC');
  res.json(stmt.all());
});

// CREATE Store
app.post('/api/stores', createStoreLimiter, async (req, res) => {
  const { name, type } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Name and Type required' });

  // Guardrail: Max Stores
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM stores');
  const { count } = countStmt.get();
  if (count >= MAX_STORES_PER_INSTANCE) {
    return res.status(429).json({ error: `Platform capacity reached (${MAX_STORES_PER_INSTANCE} stores). Delete a store to create a new one.` });
  }

  const id = uuidv4().slice(0, 8); // Short ID for simpler names
  const store = {
    id,
    name,
    type,
    status: 'PROVISIONING',
    url: '',
    createdAt: new Date().toISOString()
  };

  try {
    const stmt = db.prepare('INSERT INTO stores (id, name, type, status, url, createdAt) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(store.id, store.name, store.type, store.status, store.url, store.createdAt);

    // Trigger Async Provisioning
    orchestrator.provisionStore(store, db);

    res.status(201).json(store);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create store' });
  }
});

// DELETE Store
app.delete('/api/stores/:id', (req, res) => {
  const { id } = req.params;
  const stmt = db.prepare('SELECT * FROM stores WHERE id = ?');
  const store = stmt.get(id);

  if (!store) return res.status(404).json({ error: 'Store not found' });

  // Update status
  db.prepare('UPDATE stores SET status = ? WHERE id = ?').run('DELETING', id);

  // Trigger Async Deletion
  orchestrator.deleteStore(store, db);

  res.json({ message: 'Deletion started' });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
