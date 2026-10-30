import mysql from 'mysql2/promise';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { env } from '../src/config/env.js';

const connection = await mysql.createConnection({
  host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME,
  user: env.DB_USER, password: env.DB_PASSWORD, connectTimeout: 3000
});

try {
  const [tables] = await connection.execute(
    `SELECT TABLE_NAME AS name,TABLE_TYPE AS type FROM information_schema.TABLES
     WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME`, [env.DB_NAME]
  );
  const [columns] = await connection.execute(
    `SELECT TABLE_NAME AS tableName,COLUMN_NAME AS name,DATA_TYPE AS type,COLUMN_KEY AS keyType,
            IS_NULLABLE AS nullable,ORDINAL_POSITION AS ordinal
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,ORDINAL_POSITION`, [env.DB_NAME]
  );
  const [foreignKeys] = await connection.execute(
    `SELECT TABLE_NAME AS child,COLUMN_NAME AS childColumn,REFERENCED_TABLE_NAME AS parent,
            REFERENCED_COLUMN_NAME AS parentColumn,CONSTRAINT_NAME AS name
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION`, [env.DB_NAME]
  );
  if (!tables.length) throw new Error('Configured database has no tables. Apply migrations first.');

  const baseTables = tables.filter(table => table.type === 'BASE TABLE');
  const byTable = new Map();
  for (const column of columns) {
    if (!byTable.has(column.tableName)) byTable.set(column.tableName, []);
    byTable.get(column.tableName).push(column);
  }
  const entities = baseTables.map(({ name }) => {
    const fields = (byTable.get(name) || []).map(column => {
      const key = column.keyType === 'PRI' ? ' PK' : column.keyType === 'UNI' ? ' UK' : column.keyType === 'MUL' ? ' FK/index' : '';
      const nullable = column.nullable === 'YES' ? ' nullable' : '';
      return `  ${column.name} ${column.type}${key}${nullable}`;
    });
    return `${name} {\n${fields.join('\n')}\n}`;
  });
  const relations = foreignKeys.map(fk => `  ${fk.parent} ||--o{ ${fk.child} : "${fk.childColumn}"`);
  const views = tables.filter(table => table.type === 'VIEW').map(table => `- \`${table.name}\``);
  const output = [
    '# MySQL entity relationship diagram',
    '',
    `Generated from the configured MySQL schema \`${env.DB_NAME}\` after migrations. Run \`npm.cmd run docs:erd\` to refresh it. Table columns and foreign-key relationships below reflect the database schema; stored procedures, triggers, views and indexes are separate database objects.`,
    '',
    `Tables: ${baseTables.length} · Foreign-key relationships: ${foreignKeys.length} · Views: ${views.length}`,
    '',
    '```mermaid',
    'erDiagram',
    ...entities,
    ...relations,
    '```',
    '',
    '## Views',
    '',
    ...(views.length ? views : ['No views found in the configured schema.']),
    '',
    'See [Architecture](ARCHITECTURE.md) for workflow invariants and [Module roadmap](MODULES.md) for feature scope.',
    ''
  ].join('\n');
  const path = fileURLToPath(new URL('../../docs/ERD.md', import.meta.url));
  await writeFile(path, output, 'utf8');
  console.log(`ERD updated from MySQL schema (${baseTables.length} tables, ${foreignKeys.length} relationships, ${views.length} views).`);
} finally {
  await connection.end();
}
