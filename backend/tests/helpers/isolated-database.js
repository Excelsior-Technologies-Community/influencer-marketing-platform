import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

// Payment suites must not delete posted journals or weaken immutability triggers.
// Create/drop an entire disposable schema; never change the application schema.
export async function createIsolatedDatabase(){
 const backend=fileURLToPath(new URL('../..',import.meta.url));
 const saved=dotenv.parse(readFileSync(new URL('../../.env',import.meta.url)));
 const config={...saved,...process.env};
 const previousName=process.env.DB_NAME;
 const name='influence_wallet_test_'+randomUUID().replaceAll('-','');
 const admin=await mysql.createConnection({host:config.DB_HOST||'127.0.0.1',port:Number(config.DB_PORT||3306),user:config.DB_USER||'influencer_app',password:config.DB_PASSWORD||'',connectTimeout:3000});
 const drop=async()=>{if(!/^influence_wallet_test_[a-f0-9]{32}$/.test(name)||name===saved.DB_NAME)throw new Error('Refusing non-test database cleanup');await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);await admin.end();if(previousName===undefined)delete process.env.DB_NAME;else process.env.DB_NAME=previousName;};
 try{await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);}catch{await admin.end();throw new Error('Payment tests require permission to create a disposable MySQL database.');}
 process.env.DB_NAME=name;
 try{execFileSync(process.execPath,['scripts/migrate.js'],{cwd:backend,env:{...config,DB_NAME:name},stdio:'pipe',timeout:60000});}
 catch{await drop();throw new Error('Disposable payment database migration failed; no credentials displayed.');}
 return {name,drop,close:()=>admin.end()};
}
