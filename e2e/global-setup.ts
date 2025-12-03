import { FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('Global setup: Seeding database...');
  // TODO: Connect to DB and seed test data
  // For now, we assume the dev DB has some data or we just test the UI shell
}

export default globalSetup;
