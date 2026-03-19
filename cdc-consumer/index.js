const { seedDatabase } = require('./seed');
const { startReplication } = require('./replication');

async function main() {
  console.log('Starting CDC Consumer...');

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Seeding database if needed...');
  await seedDatabase();

  console.log('Starting replication...');
  await startReplication();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
