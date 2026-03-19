const { faker } = require('@faker-js/faker');
const { Client } = require('pg');
const { indexDocument } = require('./search');

const config = {
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
};

async function seedDatabase() {
  const client = new Client(config);
  await client.connect();

  try {
    const countResult = await client.query('SELECT COUNT(*) FROM products');
    const count = parseInt(countResult.rows[0].count);

    if (count > 0) {
      console.log(`Database already seeded with ${count} products`);
      return;
    }

    console.log('Seeding database with initial data...');

    const categories = [
      { name: 'Electronics', description: 'Electronic devices and gadgets' },
      { name: 'Clothing', description: 'Apparel and fashion items' },
      { name: 'Home & Garden', description: 'Home improvement and garden supplies' },
      { name: 'Books', description: 'Books and reading materials' },
      { name: 'Sports', description: 'Sports equipment and accessories' },
      { name: 'Toys', description: 'Toys and games for all ages' },
      { name: 'Beauty', description: 'Beauty and personal care products' },
      { name: 'Food', description: 'Food and beverage items' }
    ];

    const categoryIds = [];
    for (const category of categories) {
      const result = await client.query(
        'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING id',
        [category.name, category.description]
      );
      categoryIds.push(result.rows[0].id);
    }

    console.log(`Created ${categoryIds.length} categories`);

    const BATCH_SIZE = 100;
    const TOTAL_PRODUCTS = 5000;
    let totalInserted = 0;

    for (let i = 0; i < TOTAL_PRODUCTS; i += BATCH_SIZE) {
      const batchSize = Math.min(BATCH_SIZE, TOTAL_PRODUCTS - i);
      const products = [];

      for (let j = 0; j < batchSize; j++) {
        const categoryId = categoryIds[Math.floor(Math.random() * categoryIds.length)];
        const product = {
          name: faker.commerce.productName(),
          description: faker.commerce.productDescription(),
          price: parseFloat(faker.commerce.price({ min: 10, max: 1000 })),
          categoryId: categoryId
        };
        products.push(product);
      }

      await client.query('BEGIN');

      for (const product of products) {
        const result = await client.query(
          'INSERT INTO products (name, description, price, category_id) VALUES ($1, $2, $3, $4) RETURNING id',
          [product.name, product.description, product.price, product.categoryId]
        );

        const productId = result.rows[0].id;
        const quantity = Math.floor(Math.random() * 200);

        await client.query(
          'INSERT INTO inventory (product_id, quantity) VALUES ($1, $2)',
          [productId, quantity]
        );
      }

      await client.query('COMMIT');

      totalInserted += batchSize;
      console.log(`Seeded ${totalInserted}/${TOTAL_PRODUCTS} products...`);
    }

    console.log('Database seeding completed');
    console.log('Indexing products in Meilisearch...');

    const productsResult = await client.query(`
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
    `);

    const documents = productsResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: parseFloat(row.price),
      category: row.category,
      quantity: row.quantity,
      in_stock: row.in_stock
    }));

    for (let i = 0; i < documents.length; i += 1000) {
      const batch = documents.slice(i, i + 1000);
      await indexDocument(batch);
      console.log(`Indexed ${Math.min(i + 1000, documents.length)}/${documents.length} products...`);
    }

    console.log('Meilisearch indexing completed');

  } catch (err) {
    console.error('Error seeding database:', err);
    throw err;
  } finally {
    await client.end();
  }
}

module.exports = { seedDatabase };
