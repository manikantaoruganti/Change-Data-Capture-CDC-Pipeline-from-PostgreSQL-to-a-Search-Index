# CDC Pipeline: PostgreSQL to Meilisearch

Production-ready Change Data Capture pipeline that streams data from PostgreSQL to Meilisearch with real-time frontend updates.

## Architecture

```
PostgreSQL (Logical Replication)
    ↓
CDC Consumer (pg-logical-replication)
    ↓
Meilisearch (Search Index)
    ↓
API Server (SSE Stream)
    ↓
Frontend (Search UI + Live Feed)
```

## Services

1. **postgres**: PostgreSQL 14 with logical replication enabled
2. **meilisearch**: Fast search engine for product indexing
3. **cdc-consumer**: Captures changes and updates Meilisearch
4. **api**: Express server serving frontend and SSE stream

## Features

- Real-time change data capture using PostgreSQL logical replication
- 5000+ seeded products using Faker.js
- LSN checkpointing for at-least-once delivery guarantee
- Live search with Meilisearch
- Server-Sent Events (SSE) for real-time CDC feed
- Automatic recovery from last checkpoint

## Quick Start

```bash
docker-compose up --build
```

Access the application at: http://localhost:3000

## Testing

### Insert Product
```bash
docker exec -it cdc_postgres psql -U cdcuser -d cdcdb -c "
INSERT INTO products (name, description, price, category_id)
VALUES ('Test Product', 'This is a test', 99.99, 1);
"
```

### Update Product
```bash
docker exec -it cdc_postgres psql -U cdcuser -d cdcdb -c "
UPDATE products SET price = 149.99 WHERE name = 'Test Product';
"
```

### Delete Product
```bash
docker exec -it cdc_postgres psql -U cdcuser -d cdcdb -c "
DELETE FROM products WHERE name = 'Test Product';
"
```

Watch the frontend CDC feed update in real-time!

## LSN Recovery

The CDC consumer maintains a checkpoint file (`lsn_checkpoint.txt`) that stores the last committed Log Sequence Number (LSN). On restart:

1. If checkpoint exists: Resume replication from saved LSN
2. If no checkpoint: Start from current position

This ensures at-least-once delivery of all database changes.

## Data Flow

1. **Database Change**: INSERT/UPDATE/DELETE in PostgreSQL
2. **Logical Replication**: WAL stream sent to replication slot
3. **CDC Consumer**: Parses replication messages
4. **Meilisearch Update**: Index updated with changes
5. **Event Broadcast**: HTTP POST to API server
6. **SSE Stream**: Event pushed to connected clients
7. **Frontend Update**: UI updates in real-time

## Environment Variables

See `.env.example` for configuration options.

## Database Schema

- **categories**: Product categories
- **products**: Main product catalog (REPLICA IDENTITY FULL)
- **inventory**: Stock levels (REPLICA IDENTITY FULL)

## Troubleshooting

**Consumer not starting**: Check PostgreSQL health with `docker-compose logs postgres`

**No search results**: Verify Meilisearch is healthy with `docker-compose logs meilisearch`

**SSE not working**: Check API logs with `docker-compose logs api`

**Reset everything**:
```bash
docker-compose down -v
docker-compose up --build
```
