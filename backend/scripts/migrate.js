import mysql from 'mysql2/promise';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { env } from '../src/config/env.js';

// SQL is maintained in reviewed project files, never supplied by HTTP clients.
function splitSql(source) {
  let delimiter = ';';
  let buffer = '';
  const statements = [];
  for (const line of source.split(/\r?\n/)) {
    const change = line.match(/^DELIMITER\s+(\S+)\s*$/i);
    if (change) { delimiter = change[1]; continue; }
    buffer += `${line}\n`;
    if (buffer.trimEnd().endsWith(delimiter)) {
      statements.push(buffer.trimEnd().slice(0, -delimiter.length).trim());
      buffer = '';
    }
  }
  if (buffer.trim()) throw new Error('SQL file has an unterminated statement');
  return statements.filter(Boolean);
}

let connection;
let locked = false;
try {
  connection = await mysql.createConnection({ host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, multipleStatements: false, connectTimeout: 3000 });
  const [locks] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [`${env.DB_NAME}:migrate`]);
  if (locks[0].acquired !== 1) throw new Error('Another migration is running');
  locked = true;
  await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
  const entries=[];
  for (const directory of ['migrations', 'stored-procedures']) {
    const folder = new URL(`../${directory}/`, import.meta.url);
    for (const file of (await readdir(folder)).filter(name => name.endsWith('.sql'))) entries.push({directory,file,folder});
  }
  // Apply the numbered schema/procedure history as one sequence. Several later
  // schema migrations add triggers that refer to tables introduced beside an
  // earlier stored procedure, so applying every migration before every routine
  // breaks clean installations even though upgraded local databases work.
  entries.sort((a,b)=>{
    const aNumber=Number(a.file.match(/^\d+/)?.[0]||0),bNumber=Number(b.file.match(/^\d+/)?.[0]||0);
    return aNumber-bNumber||a.directory.localeCompare(b.directory)||a.file.localeCompare(b.file);
  });
  for (const {directory,file,folder} of entries) {
      const name = `${directory}/${file}`;
      const sql = await readFile(new URL(file, folder), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const [existing] = await connection.execute('SELECT checksum FROM schema_migrations WHERE name = ?', [name]);
      if (existing.length) {
        if (existing[0].checksum !== checksum) throw new Error('Applied migration changed; add a new migration instead');
        console.log(`Already applied: ${name}`);
        continue;
      }
      // MySQL DDL auto-commits. Files must be restartable if interrupted.
      for (const statement of splitSql(sql)) await connection.query(statement);
      await connection.execute('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [name, checksum]);
      console.log(`Applied: ${name}`);
  }
} catch (error) {
  console.error(`Migration failed (${error.code || 'configuration or migration error'}). Check the database settings and migration history.`);
  process.exitCode = 1;
} finally {
  if (connection) {
    if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [`${env.DB_NAME}:migrate`]);
    await connection.end();
  }
}
