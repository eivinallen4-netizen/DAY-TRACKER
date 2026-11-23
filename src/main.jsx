import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import './readability.css';
import './brand-colors.css';
import './taam.css';

async function api(path, method='GET', body) {
  const res=await fetch(`/api${path}`,{method,headers:method!=='GET'?{'Content-Type':'application/json'}:undefined,body:method!=='GET'?JSON.stringify(body||{}):undefined});
  const data=await res.json();
  if(!res.ok) throw Object.assign(new Error(data.error||'Please try again.'),{status:res.status});
  return data;
}
const fmt=(day,options)=>new Intl.DateTimeFormat('en-US',options).format(new Date(`${day}T12:00:00`));
const shift=(day,n)=>{const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const scheduled=(task,day)=>!task.archived && (task.kind==='daily'?task.start_day<=day:task.start_day===day);
function Icon({name,...props}) {
  const paths={plus:<path d="M12 5v14M5 12h14"/>,check:<path d="m5 12 4 4L19 6"/>,calendar:<><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/></>,link:<><path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" transform="translate(1 0) scale(.9)"/></>,flame:<path d="M13 2c2 6-2 6-1 10 2-1 3-3 3-5 5 5 6 8 3 12-3 4-10 3-12-1C3 12 8 8 8 8c0 3 1 4 2 4 2-3-1-6 3-10Z"/>,tv:<><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></>,close:<path d="m6 6 12 12M6 18 18 6"/>,chevron:<path d="m9 5 7 7-7 7"/>,edit:<><path d="m15 4 5 5-10 10-6 1 1-6Z"/><path d="m12 7 5 5"/></>,archive:<><path d="M5 8v12h14V8M3 4h18v4H3zM9 12h6"/></>};
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
function Modal({title,children,onClose,error}) {
  const ref=useRef();
  useEffect(()=>{ref.current.showModal();return()=>ref.current?.close();},[]);
  return <dialog aria-label={title} ref={ref} onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="dialog-head"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></div>{error&&<p className="error" role="alert">{error}</p>}{children}</dialog>;
}
function App(){
  const [phoneLayout, setPhoneLayout] = useState(() => window.matchMedia('(max-width: 600px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 600px)');
    const onChange = () => setPhoneLayout(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState(''),[month,setMonth]=useState(''),[modal,setModal]=useState(null),[pair,setPair]=useState(null);
  const [title,setTitle]=useState(''),[kind,setKind]=useState('daily'),[startDay,setStartDay]=useState(''),[code,setCode]=useState('');
  const [live,setLive]=useState(false),[toast,setToast]=useState(''),[tick,setTick]=useState(Date.now());
  const [tv,setTv]=useState(new URLSearchParams(location.search).get('view')==='tv');
  const [join,setJoin]=useState(new URLSearchParams(location.search).has('join'));
  const liveRef=useRef(false), firstLoad=useRef(true), mutation=useRef(false), previousToday=useRef(null);
  const load=useCallback(async()=>{
    try { const next=await api('/state');setData(next);setSelected(s=>s||next.today);setMonth(m=>m||next.today.slice(0,7));return next; }
    catch(e){if(e.status===401)setData(null);else throw e;}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
  useEffect(()=>{if(data?.today){const previous=previousToday.current;if(previous && previous!==data.today){setSelected(s=>s===previous?data.today:s);setMonth(m=>m===previous.slice(0,7)?data.today.slice(0,7):m);}previousToday.current=data.today;}},[data?.today]);
  useEffect(()=>{
    if(!data?.workspace)return;
    if (data.polling) {
      let stopped = false;
      let timer;
      const refresh = async () => {
        try {
          if (!document.hidden) { await load(); if (!stopped) setLive(true); }
        } catch { if (!stopped) setLive(false); }
        finally { if (!stopped) timer = setTimeout(refresh, 3000); }
      };
      refresh();
      return () => { stopped = true; clearTimeout(timer); };
    }
    const stream=new EventSource('/api/events');
    const refresh=()=>load().catch(()=>{setLive(false);liveRef.current=false;});
    stream.addEventListener('connected',()=>{setLive(true);liveRef.current=true;refresh();});
    stream.addEventListener('change',refresh);
    stream.onerror=()=>{setLive(false);liveRef.current=false;};
    // Also reconciles midnight, reconnects and writes from another server instance.
    const poll=setInterval(refresh,15_000);
    const onFocus=()=>refresh();window.addEventListener('focus',onFocus);
    return()=>{stream.close();clearInterval(poll);window.removeEventListener('focus',onFocus);};
  },[data?.workspace,data?.polling,load]);
  useEffect(()=>{const timer=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(''),2800);return()=>clearTimeout(timer);}},[toast]);
  useEffect(()=>{
    if(tv && data && firstLoad.current){firstLoad.current=false;if(data.devices<2)openPair();}
  },[data,tv]);
  useEffect(()=>{
    if(!tv)return;
    const move=e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
      const root=document.querySelector('dialog[open]')||document;
      const nodes=[...root.querySelectorAll('button:not(:disabled),a,input,select')].filter(n=>n.getBoundingClientRect().width>0);
      if(!nodes.length)return;
      const active=document.activeElement;
      if(!nodes.includes(active)){(root.querySelector('.day.selected')||nodes[0]).focus();e.preventDefault();return;}
      const a=active.getBoundingClientRect(),ax=a.x+a.width/2,ay=a.y+a.height/2;
      const horizontal=['ArrowLeft','ArrowRight'].includes(e.key),positive=['ArrowRight','ArrowDown'].includes(e.key);
      let best,score=Infinity;
      for(const node of nodes){if(node===active)continue;const b=node.getBoundingClientRect(),dx=b.x+b.width/2-ax,dy=b.y+b.height/2-ay;const major=horizontal?dx:dy,minor=horizontal?dy:dx;if((positive?major:-major)<8)continue;const s=Math.abs(major)+Math.abs(minor)*3;if(s<score){score=s;best=node;}}
      if(best){best.focus();best.scrollIntoView({block:'nearest'});}e.preventDefault();
    };
    window.addEventListener('keydown',move);return()=>window.removeEventListener('keydown',move);
  },[tv]);
  useEffect(() => {
    if (tv && data?.workspace && !modal && document.activeElement === document.body) {
      document.querySelector('.day.selected')?.focus({preventScroll:true});
    }
  }, [tv, data?.workspace, modal]);

  async function act(fn){if(mutation.current)return;mutation.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{mutation.current=false;setBusy(false);}}
  async function create(){await act(async()=>{await api('/workspaces','POST',{timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});await load();setJoin(false);});}
  async function claim(e){e.preventDefault();await act(async()=>{await api('/pair/claim','POST',{code});await load();setJoin(false);setModal(null);setCode('');setToast('You’re connected. Let’s make progress.');});}
  async function openPair(){setModal('pair');setPair(null);await act(async()=>setPair(await api('/pair','POST',{})));}
  function add(){setTitle('');setKind('daily');setStartDay(selected||data.today);setModal('add');}
  async function saveTask(e){e.preventDefault();await act(async()=>{if(typeof modal==='object')await api(`/tasks/${modal.id}`,'PATCH',{title});else await api('/tasks','POST',{title,kind,start_day:startDay});await load();setModal(null);setToast(modal==='add'?'Task added.':'Task updated.');});}
  function switchTv(){const next=!tv;setTv(next);const u=new URL(location.href);if(next)u.searchParams.set('view','tv');else u.searchParams.delete('view');history.replaceState({},'',u);}
  function goMonth(amount){const d=new Date(`${month}-15T12:00:00`);d.setMonth(d.getMonth()+amount);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
  const joinForm=<form onSubmit={claim}><label htmlFor="pair-code">Code from your other screen</label><input id="pair-code" autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="0000 0000" className="code-input" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,8))} required minLength={8} maxLength={8}/><button className="primary wide" disabled={busy||code.length!==8}>Connect this device</button><p className="hint">Codes work once and expire after 10 minutes. Connecting switches this device to that board.</p></form>;
  if(loading)return <div className="loading"><img src="/icon.svg" alt=""/><p>Making room for progress…</p></div>;
  if(!data)return <div className="onboarding"><div className="welcome-art"><div className="brand-lockup"><img src="/brand/taam-white.png" alt="TAAM"/><span>Work Better</span></div><div><h1>Work <br/>Better<span className="lime">.</span></h1><p>Track daily habits on your phone and see your progress on TV.</p></div><div className="sample-week" aria-label="Illustration of a week of progress">{['M','T','W','T','F','S','S'].map((d,i)=><div key={i}><span>{d}</span><div className={i<4?'filled':''}>{i<4?<Icon name="check"/>:i===4?'·':''}</div></div>)}</div></div><section className="welcome-form"><span className="eyebrow">BOARD SETUP</span><h2>{join?'Pair this device':'Set up your board'}</h2><p>{join?'On your other screen, select Connect device to see the code.':'Start a new calendar or connect to one you already use.'}</p>{error&&<p className="error" role="alert">{error}</p>}{join?joinForm:<><button className="primary wide" disabled={busy} onClick={create}>Start my board <Icon name="plus"/></button><button className="secondary wide" onClick={()=>setJoin(true)}>Connect with a code <Icon name="link"/></button></>}{join&&<button className="text-button" onClick={()=>setJoin(false)}>Create a new board instead</button>}<small>No account needed. Pair devices with a one-time code.</small></section></div>;
  const doneSet=new Set(data.completions.map(c=>`${c.task_id}:${c.day}`));
  const dayTasks=data.tasks.filter(t=>scheduled(t,selected)),finished=dayTasks.filter(t=>doneSet.has(`${t.id}:${selected}`)).length;
  const first=`${month}-01`,offset=(new Date(`${first}T12:00:00`).getDay()+6)%7;
  const count=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
  const cells=Math.ceil((offset+count)/7)*7;
  const dayCounts=new Map();for(const c of data.completions)dayCounts.set(c.day,(dayCounts.get(c.day)||0)+1);
  const progress=data.metrics.xp%100;
  const baseUrl=(data.publicUrl||location.origin).replace(/\/$/,'');
  const calendarPanel = (<section key="calendar" className="calendar-panel"><div className="panel-heading"><h2>{fmt(first,{month:'long'})} <span>{month.slice(0,4)}</span></h2><div className="month-controls"><button className="text-button today" onClick={()=>{setMonth(data.today.slice(0,7));setSelected(data.today);}}>Today</button><button className="icon-button previous" aria-label="Previous month" onClick={()=>goMonth(-1)}><Icon name="chevron"/></button><button className="icon-button" aria-label="Next month" onClick={()=>goMonth(1)}><Icon name="chevron"/></button></div></div><div className="weekdays">{['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d=><span key={d}>{d}</span>)}</div><div className="calendar-grid">{Array.from({length:cells},(_,i)=>{const day=shift(first,i-offset),inMonth=day.slice(0,7)===month,completed=dayCounts.get(day)||0,tasks=data.tasks.filter(t=>scheduled(t,day)),all=tasks.length>0&&tasks.every(t=>doneSet.has(`${t.id}:${day}`));return <button key={day} aria-label={`${fmt(day,{month:'long',day:'numeric',year:'numeric'})}, ${completed} completed`} aria-pressed={selected===day} className={`day ${!inMonth?'outside':''} ${selected===day?'selected':''} ${day===data.today?'is-today':''} ${completed?'has-progress':''} ${all?'all-done':''}`} onClick={()=>{setSelected(day);if(!inMonth)setMonth(day.slice(0,7));if(!tv && window.matchMedia('(max-width: 600px)').matches)document.getElementById('day-tasks').focus();}}><span className="day-number">{Number(day.slice(-2))}</span>{completed>0?<span className="day-mark"><Icon name="check"/></span>:null}<span className="day-bottom">{completed>0?<><b>{completed}</b> <span>done</span></>:tasks.length>0?<><b>{tasks.length}</b> <span>planned</span></>:day===data.today?<span>Today</span>:null}</span></button>;})}</div><div className="calendar-legend"><span><i/> A little progress</span><span><i/> Everything done</span></div></section>);
  const taskPanel = (<section key="tasks" id="day-tasks" aria-label="Tasks for the selected date" tabIndex={-1} className="task-panel"><div className="panel-heading"><div><span className="eyebrow">{fmt(selected,{weekday:'long',month:'short',day:'numeric'})}</span><h2>{selected===data.today?'Today’s tasks':'Scheduled tasks'}</h2></div><span className="count-pill">{finished}/{dayTasks.length}</span></div><div className="daily-track"><i style={{width:`${dayTasks.length?finished/dayTasks.length*100:0}%`}}/></div><p className="task-subtitle">{dayTasks.length ? `${finished} of ${dayTasks.length} complete` : ''}</p><div className="task-list">{dayTasks.map(task=>{const done=doneSet.has(`${task.id}:${selected}`);return <div className={`task ${done?'done':''}`} key={task.id}><button className="task-check" disabled={busy||selected>data.today} aria-label={`${done?'Undo':'Complete'} ${task.title}`} aria-pressed={done} onClick={()=>act(async()=>{await api(`/tasks/${task.id}/completion`,'PUT',{day:selected,done:!done});await load();setToast(done?'Check-off undone.':'Task complete · +10 XP');})}>{done&&<Icon name="check"/>}</button><div className="task-copy"><span>{task.title}</span><small>{task.kind==='daily'?'Daily habit':'One-time task'}</small></div><button className="icon-button task-edit" aria-label={`Edit ${task.title}`} onClick={()=>{setTitle(task.title);setModal(task);}}><Icon name="edit"/></button><span className="task-xp">+10</span></div>;})}{!dayTasks.length&&<div className="empty"><h3>No tasks scheduled.</h3><p>Add a daily habit or a one-time task for this date.</p></div>}</div><button className="add-task" onClick={add}><Icon name="plus"/> Add a task</button><div className="focus-note"><Icon name="flame"/><p>One completed task keeps your streak going. </p></div></section>);
  return <div className={`app ${tv?'tv':''}`}>
    <aside className="sidebar"><a className="wordmark" href="/" aria-label="Work Better home"><img src="/icon.svg" alt=""/>work<br/>better</a><span className="eyebrow workspace-label">YOUR SPACE</span><button className="nav active" onClick={()=>{setSelected(data.today);setMonth(data.today.slice(0,7));}}><Icon name="calendar"/> My calendar</button><button className="nav" onClick={openPair}><Icon name="link"/> Connect a device</button><button className="nav" onClick={switchTv}><Icon name="tv"/> {tv?'Exit TV view':'TV view'}</button><div className="sidebar-note"><div className="little-star">✳</div><p>Work <br/>Better.</p></div><div className="profile"><span className="avatar">W</span><div>Your personal space<small>{data.timezone.replaceAll('_',' ')}</small></div></div></aside>
    <main><header className="topbar"><div className="brand-lockup"><img src="/brand/taam-white.png" alt="TAAM"/><span>Work Better</span></div><span className={`sync ${live?'connected':''}`}><i/>{live?'Live updates on':'Reconnecting…'}</span><button className="secondary compact" aria-label="Connect device" onClick={openPair}><Icon name="link"/> <span>Connect device</span></button></header>
    <div className="page"><section className="intro"><div><div className="eyebrow">{fmt(data.today,{weekday:'long',month:'long',day:'numeric'})}</div><h1>Daily planner<span>.</span></h1></div><button className="primary" onClick={add}><Icon name="plus"/> Add a task</button></section>
    <section className="stats" aria-label="Your progress"><div className="stat streak"><div className="stat-label"><span>CURRENT STREAK</span><Icon name="flame"/></div><div><strong>{data.metrics.streak}</strong><span>days in a row</span></div><img className="streak-sticker" src="/brand/streak-flame.webp" alt=""/></div><div className="stat"><div className="stat-label"><span>PERSONAL BEST</span><span>↗</span></div><div><strong>{data.metrics.best}</strong><span>day streak</span></div></div><div className="stat level"><div className="stat-label"><span>LEVEL {data.metrics.level}</span><span>✳</span></div><div><strong>{data.metrics.xp}</strong><span>total XP</span></div><div className="xp-track"><i style={{width:`${progress}%`}}/></div><small>{100-progress} XP to your next level</small></div></section>
    <div className="board">{phoneLayout && !tv ? [taskPanel, calendarPanel] : [calendarPanel, taskPanel]}</div>
    <footer><button className="text-button mobile-tv" onClick={switchTv}>{tv?'Exit TV view':'TV view'}</button></footer></div></main>
    {error&&<div className="error-banner" role="alert">{error}<button onClick={()=>setError('')} aria-label="Dismiss error">×</button></div>}{toast&&<div className="toast" role="status"><Icon name="check"/>{toast}</div>}
    {(modal==='add'||typeof modal==='object'&&modal!==null)&&<Modal error={error} title={modal==='add'?'A small step.':'Make it yours.'} onClose={()=>setModal(null)}><form onSubmit={saveTask}><label htmlFor="title">What would you like to do?</label><input autoFocus id="title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Read for 20 minutes" maxLength={120} required/>{modal==='add'&&<><label htmlFor="repeat">Make it a habit?</label><select id="repeat" value={kind} onChange={e=>setKind(e.target.value)}><option value="daily">Every day</option><option value="once">Just once</option></select><label htmlFor="start-day">{kind==='daily'?'Start date':'Scheduled date'}</label><input id="start-day" type="date" value={startDay} onChange={e=>setStartDay(e.target.value)} required/></>}<button className="primary wide" disabled={busy}>{modal==='add'?'Add to my day':'Save changes'}</button>{typeof modal==='object'&&<button type="button" className="archive-button" disabled={busy} onClick={()=>act(async()=>{await api(`/tasks/${modal.id}`,'DELETE');await load();setModal(null);setToast('Task archived. Your past progress is saved.');})}><Icon name="archive"/> Archive task · keep past progress</button>}</form></Modal>}
    {modal==='pair'&&<Modal error={error} title="Same progress. Bigger picture." onClose={()=>setModal(null)}><p>On your other device, open:</p><a className="pair-url" href={`${baseUrl}/?join=1`} target="_blank" rel="noreferrer">{baseUrl}/?join=1</a><p>Then enter this one-time code.</p><div className="pair-digits">{pair?`${pair.code.slice(0,4)} ${pair.code.slice(4)}`:'···· ····'}</div><p className="hint">{pair?(pair.expiresAt>tick?`Expires in ${Math.min(10,Math.ceil((pair.expiresAt-tick)/60_000))} minutes. Only share with your own devices.`:'This code has expired. Generate a new one.'):'Creating your code…'}</p>{baseUrl.includes('localhost')&&<p className="hint">On a phone or TV, use your computer’s Wi-Fi address instead of localhost. See README.md for setup.</p>}<div className="pair-actions"><button className="secondary" disabled={busy} onClick={openPair}>New code</button><button className="text-button" onClick={()=>{setCode('');setModal('join');}}>I have a code</button></div><div className="device-count"><Icon name="tv"/> {data.devices} {data.devices===1?'device':'devices'} connected</div></Modal>}
    {modal==='join'&&<Modal error={error} title="Connect this device" onClose={()=>setModal(null)}>{joinForm}</Modal>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
