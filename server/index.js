import { openDatabase } from './database.js';
import { createApp } from './app.js';
import express from 'express';
import path from 'node:path';
import os from 'node:os';

const db=await openDatabase();
const {app,close}=createApp(db);
const production=process.argv.includes('--production');
let vite;
if(production) {
  app.use(express.static(path.resolve('dist')));
  app.get('/{*path}',(req,res)=>res.sendFile(path.resolve('dist/index.html')));
} else {
  const {createServer}=await import('vite');
  vite=await createServer({server:{middlewareMode:true},appType:'spa'});
  app.use(vite.middlewares);
}
const port=Number(process.env.PORT||4317);
const server=app.listen(port,'0.0.0.0',()=>{
  console.log(`Work Better: http://localhost:${port}`);
  for(const network of Object.values(os.networkInterfaces()).flat()) if(network.family==='IPv4'&&!network.internal)console.log(`Phone / TV on same Wi-Fi: http://${network.address}:${port}`);
  console.log(process.env.TURSO_DATABASE_URL?'Database: Turso':'Database: local SQLite (data/work-better.db)');
});
async function stop(){close();server.close();await vite?.close();db.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
