import { defineConfig } from 'drizzle-kit';

const dataDir = process.env.DATA_DIR ?? './data';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: `${dataDir}/five-peaks.db` },
  strict: true,
  verbose: true,
});
