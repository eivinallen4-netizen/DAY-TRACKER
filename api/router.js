import { openDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';

let appPromise;

function initialize() {
  if (!/^(libsql|https):\/\//.test(process.env.TURSO_DATABASE_URL || '') || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('Turso environment variables are required.');
  }
  return openDatabase().then(db => createApp(db, { secure: true, polling: true }).app);
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/router') {
    const endpoint = url.searchParams.get('endpoint') || '';
    if (!/^[a-zA-Z0-9/-]+$/.test(endpoint)) return res.status(404).json({error: 'Unknown endpoint.'});
    req.url = '/api/' + endpoint;
  }
  let app;
  try {
    appPromise ??= initialize();
    app = await appPromise;
  } catch {
    appPromise = undefined;
    return res.status(503).json({error: 'Database unavailable. Check the server configuration.'});
  }
  return app(req, res);
}
