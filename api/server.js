const express = require('express');
const path = require('path');
const { MeiliSearch } = require('meilisearch');

const app = express();
const PORT = process.env.API_PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const meiliClient = new MeiliSearch({
  host: process.env.MEILI_HOST,
  apiKey: process.env.MEILI_KEY
});

const clients = new Set();

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const index = meiliClient.index('products');
    const results = await index.search(query, {
      limit: 50
    });
    res.json(results);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/cdc-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.write('data: {"type":"connected"}\n\n');

  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
  });
});

app.post('/api/events', (req, res) => {
  const event = req.body;

  const eventData = {
    table: event.table,
    operation: event.operation,
    timestamp: event.timestamp,
    data: event.data
  };

  const message = `event: cdc_event\ndata: ${JSON.stringify(eventData)}\n\n`;

  clients.forEach(client => {
    try {
      client.write(message);
    } catch (err) {
      clients.delete(client);
    }
  });

  res.json({ received: true });
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
