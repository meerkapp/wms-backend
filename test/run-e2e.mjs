import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function readEnvValue(name) {
  let envFile;
  try {
    envFile = readFileSync(join(projectRoot, '.env'), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
  const line = envFile
    .split(/\r?\n/)
    .find((candidate) => candidate.trimStart().startsWith(`${name}=`));
  if (!line) return undefined;

  const value = line.slice(line.indexOf('=') + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function databaseName(url) {
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

function deriveTestDatabaseUrl(source) {
  const url = new URL(source);
  const sourceName = databaseName(url);
  if (!sourceName) throw new Error('DATABASE_URL must include a database name');
  url.pathname = `/${encodeURIComponent(`${sourceName}_test`)}`;
  return url.toString();
}

function assertIsolatedDatabase(source, target) {
  if (source.toString() === target.toString() || databaseName(source) === databaseName(target)) {
    throw new Error('Refusing to run e2e tests against the development database');
  }
  if (!databaseName(target).toLowerCase().includes('test')) {
    throw new Error('The e2e database name must contain "test"');
  }
}

async function ensureDatabaseExists(target) {
  const database = databaseName(target);
  if (!/^[a-zA-Z0-9_-]+$/.test(database)) {
    throw new Error(`Unsupported test database name: ${database}`);
  }

  const maintenanceUrl = new URL(target);
  maintenanceUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${database}"`);
    }
  } finally {
    await client.end();
  }
}

function run(command, args, env) {
  const executable = join(
    projectRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${command}.cmd` : command,
  );
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const sourceDatabaseUrl = process.env.DATABASE_URL ?? readEnvValue('DATABASE_URL');
if (!sourceDatabaseUrl) throw new Error('DATABASE_URL is required');

const source = new URL(sourceDatabaseUrl);
const target = new URL(
  process.env.TEST_DATABASE_URL ??
    readEnvValue('TEST_DATABASE_URL') ??
    deriveTestDatabaseUrl(sourceDatabaseUrl),
);
assertIsolatedDatabase(source, target);
await ensureDatabaseExists(target);

const testRedisDb = process.env.TEST_REDIS_DB ?? readEnvValue('TEST_REDIS_DB') ?? '15';
if (!/^\d+$/.test(testRedisDb) || Number(testRedisDb) === 0) {
  throw new Error('TEST_REDIS_DB must be a non-zero Redis database index');
}

const testEnv = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: target.toString(),
  REDIS_DB: testRedisDb,
};

run('prisma', ['migrate', 'deploy'], testEnv);
run('jest', ['--config', './test/jest-e2e.json', '--runInBand', ...process.argv.slice(2)], testEnv);
