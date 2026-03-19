const { MeiliSearch } = require('meilisearch');

const client = new MeiliSearch({
  host: process.env.MEILI_HOST,
  apiKey: process.env.MEILI_KEY
});

const INDEX_NAME = 'products';

async function ensureIndex() {
  try {
    await client.getIndex(INDEX_NAME);
  } catch (err) {
    await client.createIndex(INDEX_NAME, { primaryKey: 'id' });
    const index = client.index(INDEX_NAME);
    await index.updateSettings({
      searchableAttributes: ['name', 'description', 'category'],
      filterableAttributes: ['category', 'in_stock', 'price'],
      sortableAttributes: ['price', 'name']
    });
  }
}

async function indexDocument(document) {
  await ensureIndex();
  const index = client.index(INDEX_NAME);

  if (Array.isArray(document)) {
    await index.addDocuments(document);
  } else {
    await index.addDocuments([document]);
  }
}

async function updateDocument(document) {
  await ensureIndex();
  const index = client.index(INDEX_NAME);
  await index.updateDocuments([document]);
}

async function deleteDocument(documentId) {
  await ensureIndex();
  const index = client.index(INDEX_NAME);
  await index.deleteDocument(documentId);
}

module.exports = {
  indexDocument,
  updateDocument,
  deleteDocument
};
