import express from 'express';
import rateLimit from 'express-rate-limit';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { dayAt, validDay, metrics } from './domain.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), {status});
const YEAR = 365*24*60*60*1000;

export function createApp(db, { publicUrl = process.env.PUBLIC_URL || '', secure = process.env.COOKIE_SECURE === 'true', rateLimits = true, polling = false } = {}) {
  const app = express(), listeners = new Map();
  if(process.env.TRUST_PROXY === '1' || process.env.VERCEL === '1') app.set('trust proxy',1);
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'});
    if(req.path.startsWith('/api/')) res.set('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin=req.get('origin');
      const allowed=new Set([`${req.protocol}://${req.get('host')}`, publicUrl.replace(/\/$/,'')]);
      if(origin && !allowed.has(origin)) return res.status(403).json({error:'This request came from another website.'});
      if(!req.is('application/json')) return res.status(415).json({error:'Send JSON.'});
    }
    next();
  });
  app.use(express.json({limit:'16kb'}));
  if(rateLimits) app.use('/api',rateLimit({windowMs:60_000,limit:180,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many requests. Try again in a minute.'}}));
  const pairingLimit = rateLimits ? rateLimit({windowMs:10*60_000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many pairing attempts. Try again in ten minutes.'}}) : (req,res,next)=>next();
  const exec = (sql,...args) => db.execute({sql,args});
  const notify = id => { for(const res of listeners.get(id)||[]) res.write('event: change\ndata: {}\n\n'); };
  function sessionCookie(res, token) { res.cookie('wb_session',token,{httpOnly:true,secure,sameSite:'strict',maxAge:YEAR,path:'/'}); }
  const newSession = () => { const token=randomBytes(32).toString('hex'); return {token,digest:hash(token)}; };
  async function auth(req,res,next) {
    const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('wb_session='))?.slice(11);
    if(!token || !/^[a-f0-9]{64}$/.test(token)) throw fail(401,'Pair this device or start your own board.');
    const result=await exec('SELECT w.* FROM workspaces w JOIN sessions s ON s.workspace_id=w.id WHERE s.hash=? AND s.expires_at>?',hash(token),Date.now());
    if(!result.rows.length) throw fail(401,'Your device session expired. Pair again.');
    req.workspace=result.rows[0]; next();
  }
  app.get('/api/health',async(req,res)=>{ await exec('SELECT 1'); res.json({ok:true}); });
  app.post('/api/workspaces',pairingLimit,async(req,res)=>{
    const timezone=req.body.timezone || 'UTC';
    try { dayAt(timezone); } catch { throw fail(400,'Choose a valid timezone.'); }
    const id=randomUUID(), session=newSession(), now=Date.now();
    await db.batch([
      {sql:'INSERT INTO workspaces VALUES(?,?,?)',args:[id,timezone,now]},
      {sql:'INSERT INTO sessions VALUES(?,?,?)',args:[session.digest,id,now+YEAR]}
    ],'write');
    sessionCookie(res,session.token); res.status(201).json({ok:true});
  });
  app.post('/api/pair/claim',pairingLimit,async(req,res)=>{
    const code=String(req.body.code||'').replace(/\s/g,'');
    if(!/^\d{8}$/.test(code)) throw fail(400,'Enter the eight-digit code shown on your other screen.');
    const tx=await db.transaction('write');
    try {
      const result=await tx.execute({sql:'DELETE FROM pairing_codes WHERE hash=? AND expires_at>? RETURNING workspace_id',args:[hash(code),Date.now()]});
      if(!result.rows.length) throw fail(400,'That code expired or was already used. Generate a new one.');
      const id=result.rows[0].workspace_id, session=newSession();
      await tx.execute({sql:'INSERT INTO sessions VALUES(?,?,?)',args:[session.digest,id,Date.now()+YEAR]});
      await tx.commit(); sessionCookie(res,session.token); notify(id); res.json({ok:true});
    } catch(error) { await tx.rollback(); throw error; } finally { tx.close(); }
  });
  app.use('/api',auth);
  app.get('/api/state',async(req,res)=>{
    const id=req.workspace.id, today=dayAt(req.workspace.timezone);
    const result=await db.batch([
      {sql:'SELECT * FROM tasks WHERE workspace_id=? ORDER BY created_at,id',args:[id]},
      {sql:'SELECT task_id,day FROM completions WHERE workspace_id=? ORDER BY day',args:[id]},
      {sql:'SELECT COUNT(*) AS count FROM sessions WHERE workspace_id=? AND expires_at>?',args:[id,Date.now()]}
    ],'read');
    const completions=result[1].rows;
    res.json({workspace:id,timezone:req.workspace.timezone,today,tasks:result[0].rows,completions,metrics:metrics(completions,today),devices:Number(result[2].rows[0].count),publicUrl,polling});
  });
  app.post('/api/pair',async(req,res)=>{
    const code=String(randomInt(10_000_000,100_000_000)), expiresAt=Date.now()+10*60_000;
    await db.batch([
      {sql:'DELETE FROM pairing_codes WHERE workspace_id=? OR expires_at<?',args:[req.workspace.id,Date.now()]},
      {sql:'INSERT INTO pairing_codes VALUES(?,?,?)',args:[hash(code),req.workspace.id,expiresAt]}
    ],'write');
    res.json({code,expiresAt});
  });
  app.post('/api/tasks',async(req,res)=>{
    const {kind='daily',start_day=dayAt(req.workspace.timezone)}=req.body;
    const title=typeof req.body.title==='string'?req.body.title.trim():'';
    if(!title || title.length>120) throw fail(400,'Use a task name between 1 and 120 characters.');
    if(!['daily','once'].includes(kind) || !validDay(start_day)) throw fail(400,'Choose a valid repeat setting and date.');
    const id=randomUUID();
    await exec('INSERT INTO tasks(id,workspace_id,title,kind,start_day,created_at) VALUES(?,?,?,?,?,?)',id,req.workspace.id,title,kind,start_day,Date.now());
    notify(req.workspace.id); res.status(201).json({id});
  });
  app.put('/api/tasks/:id/completion',async(req,res)=>{
    const {day,done}=req.body, today=dayAt(req.workspace.timezone);
    if(!validDay(day) || day>today || typeof done!=='boolean') throw fail(400,'You can check off tasks for today or an earlier day.');
    const found=await exec('SELECT * FROM tasks WHERE id=? AND workspace_id=? AND archived=0',req.params.id,req.workspace.id);
    const task=found.rows[0];
    if(!task) throw fail(404,'Task not found.');
    if(day<task.start_day || (task.kind==='once' && day!==task.start_day)) throw fail(400,'This task is not scheduled for that day.');
    if(done) await exec('INSERT OR IGNORE INTO completions VALUES(?,?,?)',req.workspace.id,task.id,day);
    else await exec('DELETE FROM completions WHERE workspace_id=? AND task_id=? AND day=?',req.workspace.id,task.id,day);
    notify(req.workspace.id); res.json({ok:true});
  });
  app.patch('/api/tasks/:id',async(req,res)=>{
    const title=typeof req.body.title==='string'?req.body.title.trim():'';
    if(!title || title.length>120) throw fail(400,'Use a task name between 1 and 120 characters.');
    const result=await exec('UPDATE tasks SET title=? WHERE id=? AND workspace_id=? AND archived=0',title,req.params.id,req.workspace.id);
    if(!result.rowsAffected) throw fail(404,'Task not found.');
    notify(req.workspace.id); res.json({ok:true});
  });
  app.delete('/api/tasks/:id',async(req,res)=>{
    const result=await exec('UPDATE tasks SET archived=1 WHERE id=? AND workspace_id=?',req.params.id,req.workspace.id);
    if(!result.rowsAffected) throw fail(404,'Task not found.');
    notify(req.workspace.id); res.json({ok:true});
  });
  app.get('/api/events',(req,res)=>{
    if (polling) return res.sendStatus(204);
    const id=req.workspace.id;
    res.set({'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});
    res.flushHeaders();
    if(!listeners.has(id)) listeners.set(id,new Set());
    listeners.get(id).add(res); res.write('event: connected\ndata: {}\n\n');
    const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),25_000);
    req.on('close',()=>{clearInterval(heartbeat);listeners.get(id)?.delete(res);if(!listeners.get(id)?.size)listeners.delete(id);});
  });
  app.use('/api',(req,res)=>res.status(404).json({error:'Not found.'}));
  app.use((error,req,res,next)=>{ if(res.headersSent)return next(error); if(!error.status)console.error(error);res.status(error.status||500).json({error:error.status?error.message:'Something went wrong. Please try again.'}); });
  return {app,close:()=>{for(const group of listeners.values())for(const res of group)res.end();}};
}
