//const { LogicalReplicationService, PgoutputPlugin } = require('pg-logical-replication');
const LogicalReplicationService = require('pg-logical-replication');
const PgoutputPlugin = require('pg-logical-replication/plugins/pgoutput');
const { Client } = require('pg');
const { indexDocument, updateDocument, deleteDocument } = require('./search');
const { readLSN, writeLSN } = require('./lsn');
const http = require('http');

const relationMap = new Map();

const config = {
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
};

async function notifyAPI(event) {
  const data = JSON.stringify(event);
  const url = new URL('/api/events', process.env.API_HOST);

  const options = {
    hostname: url.hostname,
    port: url.port || 3000,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      resolve();
    });

    req.on('error', () => {
      resolve();
    });

    req.write(data);
    req.end();
  });
}

async function getProductDetails(productId) {
  const client = new Client(config);
  await client.connect();

  try {
    const result = await client.query(`
      SELECT
        p.id,
        p.name,
        p.description,
        p.price,
        c.name as category,
        COALESCE(i.quantity, 0) as quantity,
        CASE WHEN COALESCE(i.quantity, 0) > 0 THEN true ELSE false END as in_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.id = $1
    `, [productId]);

    return result.rows[0];
  } finally {
    await client.end();
  }
}

async function handleInsert(data, tableName) {
  console.log(`INSERT on ${tableName}:`, data);

  if (tableName === 'products') {
    await new Promise(resolve => setTimeout(resolve, 100));
    const details = await getProductDetails(data.id);
    if (details) {
      await indexDocument(details);
      await notifyAPI({
        table: tableName,
        operation: 'INSERT',
        data: details,
        timestamp: new Date().toISOString()
      });
    }
  } else if (tableName === 'inventory') {
    await new Promise(resolve => setTimeout(resolve, 100));
    const details = await getProductDetails(data.product_id);
    if (details) {
      await updateDocument(details);
      await notifyAPI({
        table: 'products',
        operation: 'UPDATE',
        data: details,
        timestamp: new Date().toISOString()
      });
    }
  }
}

async function handleUpdate(data, tableName) {
  console.log(`UPDATE on ${tableName}:`, data);

  if (tableName === 'products') {
    const details = await getProductDetails(data.id);
    if (details) {
      await updateDocument(details);
      await notifyAPI({
        table: tableName,
        operation: 'UPDATE',
        data: details,
        timestamp: new Date().toISOString()
      });
    }
  } else if (tableName === 'inventory') {
    const details = await getProductDetails(data.product_id);
    if (details) {
      await updateDocument(details);
      await notifyAPI({
        table: 'products',
        operation: 'UPDATE',
        data: details,
        timestamp: new Date().toISOString()
      });
    }
  }
}

async function handleDelete(data, tableName) {
  console.log(`DELETE on ${tableName}:`, data);

  if (tableName === 'products' && data.id) {
    await deleteDocument(data.id);
    await notifyAPI({
      table: tableName,
      operation: 'DELETE',
      data: data,
      timestamp: new Date().toISOString()
    });
  }
}

async function createReplicationSlot() {
  const client = new Client(config);
  await client.connect();

  try {
    const checkSlot = await client.query(
      "SELECT * FROM pg_replication_slots WHERE slot_name = 'my_replication_slot'"
    );

    if (checkSlot.rows.length === 0) {
      await client.query(
        "SELECT * FROM pg_create_logical_replication_slot('my_replication_slot', 'pgoutput')"
      );
      console.log('Created replication slot: my_replication_slot');
    } else {
      console.log('Replication slot already exists');
    }
  } finally {
    await client.end();
  }
}

async function startReplication() {
  await createReplicationSlot();

  const service = new LogicalReplicationService(config, {
    acknowledge: {
      auto: false,
      timeoutSeconds: 10
    }
  });

  const plugin = new PgoutputPlugin({
    protoVersion: 1,
    publicationNames: ['my_publication']
  });

  service.on('data', (lsn, log) => {
    if (log.tag === 'relation') {
      relationMap.set(log.relationOid, {
        schema: log.schema,
        name: log.name,
        columns: log.columns
      });
    } else if (log.tag === 'insert') {
      const relation = relationMap.get(log.relationOid);
      if (relation) {
        const data = {};
        log.newRow.forEach((col, idx) => {
          data[relation.columns[idx].name] = col;
        });
        handleInsert(data, relation.name).catch(console.error);
      }
    } else if (log.tag === 'update') {
      const relation = relationMap.get(log.relationOid);
      if (relation) {
        const data = {};
        const row = log.newRow || log.oldRow;
        row.forEach((col, idx) => {
          data[relation.columns[idx].name] = col;
        });
        handleUpdate(data, relation.name).catch(console.error);
      }
    } else if (log.tag === 'delete') {
      const relation = relationMap.get(log.relationOid);
      if (relation) {
        const data = {};
        log.oldRow.forEach((col, idx) => {
          data[relation.columns[idx].name] = col;
        });
        handleDelete(data, relation.name).catch(console.error);
      }
    } else if (log.tag === 'commit') {
      writeLSN(lsn);
      service.acknowledge(lsn);
    }
  });

  service.on('error', (err) => {
    console.error('Replication error:', err);
    setTimeout(() => startReplication(), 5000);
  });

  const savedLSN = readLSN();

  if (savedLSN) {
    console.log('Resuming replication from LSN:', savedLSN);
    await service.subscribe(plugin, savedLSN);
  } else {
    console.log('Starting replication from current position');
    await service.subscribe(plugin);
  }

  console.log('Replication started successfully');
}

module.exports = { startReplication };
