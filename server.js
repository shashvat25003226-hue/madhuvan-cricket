import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {MongoClient,ObjectId} from 'mongodb';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {uid,blankInnings,rollup,createDelivery,scorecard,resultText,allStats,nextSunday,balanceTeams} from './lib/cricket.js';

if(!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length<32){console.error('SESSION_SECRET of at least 32 characters is required. See .env.example.');process.exit(1)}
if(!process.env.MONGODB_URI){console.error('MONGODB_URI is required. See .env.example.');process.exit(1)}
const app=express();app.set('trust proxy',1);app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:'48kb'}));app.use(cookieParser());
const limiter=rateLimit({windowMs:15*60*1000,limit:150,standardHeaders:'draft-7',legacyHeaders:false});
const authLimiter=rateLimit({windowMs:15*60*1000,limit:18,standardHeaders:'draft-7',legacyHeaders:false});
const aiLimiter=rateLimit({windowMs:15*60*1000,limit:15,standardHeaders:'draft-7',legacyHeaders:false});
app.use('/api',limiter);
const dbClient=new MongoClient(process.env.MONGODB_URI,{maxPoolSize:8});const db=dbClient.db(process.env.MONGODB_DB||'madhuban_cricket');
const players=db.collection('players'),matches=db.collection('matches'),fixtures=db.collection('fixtures'),notifications=db.collection('notifications');
const isId=id=>ObjectId.isValid(id)&&String(new ObjectId(id))===id;
const oid=id=>isId(id)?new ObjectId(id):null;
const now=()=>new Date();
const clean=(v,n=100)=>uid(v).slice(0,n);
const safeEmail=v=>String(v??'').trim().toLowerCase().slice(0,180);
const publicPlayer=p=>p?{id:String(p._id),name:p.name,role:p.role,battingStyle:p.battingStyle,bowlingStyle:p.bowlingStyle,bio:p.bio||'',number:p.number||'',skill:p.skill||3,joinedAt:p.createdAt}:null;
const viewMatch=m=>{const {_id,...rest}=m;return {...rest,id:String(_id),result:resultText(m),scorecards:m.innings.map(scorecard)}};
const viewFixture=f=>({...f,id:String(f._id),_id:undefined});
const err=(res,e,status=400)=>res.status(status).json({error:e?.message||String(e)});
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
function token(p){return jwt.sign({sub:String(p._id)},process.env.SESSION_SECRET,{expiresIn:'14d',issuer:'madhuban-cricket',audience:'players'})}
function setCookie(res,p){res.cookie('mc_session',token(p),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'||String(process.env.PUBLIC_ORIGIN||'').startsWith('https:'),path:'/',maxAge:14*86400*1000})}
app.use(asyncRoute(async(req,res,next)=>{req.user=null;try{if(req.cookies.mc_session){const payload=jwt.verify(req.cookies.mc_session,process.env.SESSION_SECRET,{issuer:'madhuban-cricket',audience:'players'});if(oid(payload.sub)){const p=await players.findOne({_id:oid(payload.sub)});if(p)req.user=p;}}}catch{}next()}));
function requireAuth(req,res,next){if(!req.user)return err(res,'Sign in first',401);next()}
function requireAdmin(req,res,next){if(!req.user||req.user.email!==safeEmail(process.env.ADMIN_EMAIL))return err(res,'Organizer access required',403);next()}
function sameOrigin(req,res,next){const origin=req.get('origin');const host=`${req.protocol}://${req.get('host')}`;const allowed=process.env.PUBLIC_ORIGIN?.replace(/\/$/,'');if(origin&&origin!==host&&origin!==allowed)return err(res,'Cross-site request blocked',403);next()}
app.use('/api', (req,res,next)=>['POST','PUT','PATCH','DELETE'].includes(req.method)?sameOrigin(req,res,next):next());
app.post('/api/auth/register',authLimiter,asyncRoute(async(req,res)=>{
  const name=clean(req.body.name,60),email=safeEmail(req.body.email),password=String(req.body.password||'');
  if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||password.length<8||password.length>120)return err(res,'Enter a name, valid email, and password of at least 8 characters');
  const hash=await bcrypt.hash(password,12);const doc={name,email,passwordHash:hash,role:'All-rounder',battingStyle:'Right-hand bat',bowlingStyle:'Right-arm medium',skill:3,bio:'',number:'',emailReminders:false,createdAt:now(),updatedAt:now()};
  try{const r=await players.insertOne(doc);doc._id=r.insertedId;setCookie(res,doc);res.status(201).json({player:publicPlayer(doc),admin:email===safeEmail(process.env.ADMIN_EMAIL)})}catch(e){if(e.code===11000)return err(res,'Email is already registered',409);throw e}
}));
app.post('/api/auth/login',authLimiter,asyncRoute(async(req,res)=>{
  const p=await players.findOne({email:safeEmail(req.body.email)});if(!p||!await bcrypt.compare(String(req.body.password||''),p.passwordHash))return err(res,'Invalid email or password',401);
  setCookie(res,p);res.json({player:publicPlayer(p),admin:p.email===safeEmail(process.env.ADMIN_EMAIL)});
}));
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('mc_session',{path:'/'});res.json({ok:true})});
app.get('/api/me',(req,res)=>res.json({player:publicPlayer(req.user),admin:!!req.user&&req.user.email===safeEmail(process.env.ADMIN_EMAIL),emailReminders:!!req.user?.emailReminders}));
app.patch('/api/me',requireAuth,asyncRoute(async(req,res)=>{
  const name=clean(req.body.name,60);if(name.length<2)return err(res,'Name must have at least two characters');
  const allowedRoles=['Batter','Bowler','All-rounder','Wicketkeeper'];const batting=['Right-hand bat','Left-hand bat'];const bowling=['Right-arm fast','Right-arm medium','Right-arm off spin','Right-arm leg spin','Left-arm fast','Left-arm medium','Left-arm orthodox','Left-arm wrist spin','None'];
  const role=allowedRoles.includes(req.body.role)?req.body.role:'All-rounder';const battingStyle=batting.includes(req.body.battingStyle)?req.body.battingStyle:'Right-hand bat';const bowlingStyle=bowling.includes(req.body.bowlingStyle)?req.body.bowlingStyle:'None';
  const number=clean(req.body.number,3);const skill=Number(req.body.skill);const changes={name,role,battingStyle,bowlingStyle,bio:clean(req.body.bio,180),number,emailReminders:req.body.emailReminders===true,skill:Number.isInteger(skill)&&skill>=1&&skill<=5?skill:3,updatedAt:now()};
  await players.updateOne({_id:req.user._id},{$set:changes});res.json({player:publicPlayer({...req.user,...changes})});
}));
app.get('/api/players',asyncRoute(async(_req,res)=>res.json((await players.find({},{projection:{passwordHash:0,email:0,emailReminders:0}}).sort({name:1}).limit(300).toArray()).map(publicPlayer))));
app.get('/api/leaderboard',asyncRoute(async(req,res)=>{
  const period=req.query.period==='week'?'week':'all';const day=now();day.setUTCHours(0,0,0,0);const offset=(day.getUTCDay()+6)%7;day.setUTCDate(day.getUTCDate()-offset);
  const [ps,ms]=await Promise.all([players.find({}).toArray(),matches.find({status:'completed'},{projection:{innings:1,status:1,updatedAt:1}}).toArray()]);
  const stats=allStats(ms,ps,period==='week'?day:null);
  const key=['runs','wickets','sixes','fours','matches'].includes(req.query.sort)?req.query.sort:'runs';stats.sort((a,b)=>b[key]-a[key]||b.runs-a.runs||a.name.localeCompare(b.name));res.json({period,sort:key,from:period==='week'?day:null,players:stats});
}));
app.get('/api/players/:id/stats',asyncRoute(async(req,res)=>{
  const id=oid(req.params.id);if(!id)return err(res,'Player not found',404);const p=await players.findOne({_id:id});if(!p)return err(res,'Player not found',404);
  const [ms,ps]=await Promise.all([matches.find({status:'completed'}).toArray(),players.find({}).toArray()]);const s=allStats(ms,ps).find(s=>s.id===String(id));const recent=ms.filter(m=>m.innings.some(i=>i.events.some(e=>e.strikerId===String(id)||e.bowlerId===String(id)))).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,8).map(m=>({id:String(m._id),name:m.name,result:resultText(m),date:m.updatedAt}));res.json({player:publicPlayer(p),stats:s,recent});
}));
app.get('/api/matches',asyncRoute(async(_req,res)=>res.json((await matches.find({}).sort({updatedAt:-1}).limit(60).toArray()).map(viewMatch))));
app.get('/api/matches/:id',asyncRoute(async(req,res)=>{const m=oid(req.params.id)?await matches.findOne({_id:oid(req.params.id)}):null;if(!m)return err(res,'Match not found',404);res.json(viewMatch(m))}));
async function newMatch(data,author){
  const teamA=clean(data.teamA,45),teamB=clean(data.teamB,45),overs=Number(data.overs);
  if(!teamA||!teamB||teamA.toLowerCase()===teamB.toLowerCase()||!Number.isInteger(overs)||overs<1||overs>50)throw Error('Enter two different teams and 1-50 overs');
  const tossWinner=[teamA,teamB].includes(data.tossWinner)?data.tossWinner:null,tossDecision=['bat','bowl'].includes(data.tossDecision)?data.tossDecision:null;
  if(!tossWinner||!tossDecision)throw Error('Select the toss winner and decision');
  const bat=tossDecision==='bat'?tossWinner:(tossWinner===teamA?teamB:teamA);const bowl=bat===teamA?teamB:teamA;
  const doc={name:clean(data.name,85)||'Madhuban Friendly',teamA,teamB,overs,tossWinner,tossDecision,venue:clean(data.venue,100),date:now(),status:'live',rosters:data.rosters||null,innings:[blankInnings(bat,bowl)],createdBy:String(author),createdAt:now(),updatedAt:now(),version:0};
  const r=await matches.insertOne(doc);doc._id=r.insertedId;return viewMatch(doc);
}
app.post('/api/matches',requireAuth,asyncRoute(async(req,res)=>{try{res.status(201).json(await newMatch(req.body,req.user._id))}catch(e){err(res,e)}}));
app.post('/api/matches/:id/action',requireAuth,asyncRoute(async(req,res)=>{
  const id=oid(req.params.id),m=id?await matches.findOne({_id:id}):null;if(!m)return err(res,'Match not found',404);
  if(m.createdBy!==String(req.user._id)&&req.user.email!==safeEmail(process.env.ADMIN_EMAIL))return err(res,'Only this scorer or an organizer may edit this match',403);
  if(m.version!==req.body.version)return err(res,'Someone else scored a ball. Refresh and try again.',409);
  const inn=m.innings.at(-1),action=req.body.action;
  try{
    if(action==='ball'){
      if(m.status!=='live')throw Error('This innings is not active');if(inn.wickets>=10||inn.balls>=m.overs*6)throw Error('Innings is over');
      const e=createDelivery(req.body);inn.events.push(e);rollup(inn);
      const target=m.innings.length>1?m.innings[0].runs+1:null;
      if(inn.wickets>=10||inn.balls>=m.overs*6||(target&&inn.runs>=target)){inn.closed=true;m.status=m.innings.length===1?'innings-break':'completed';}
    }else if(action==='undo'){
      if(!inn.events.length)throw Error('Nothing to undo');inn.events.pop();rollup(inn);inn.closed=false;m.status='live';
    }else if(action==='next'){
      if(m.status!=='innings-break')throw Error('Finish the first innings first');
      m.innings.push(blankInnings(inn.bowl,inn.bat));m.status='live';
    }else if(action==='finish'){
      if(m.status!=='live')throw Error('Innings already closed');inn.closed=true;m.status=m.innings.length===1?'innings-break':'completed';
    }else throw Error('Unsupported score action');
    m.updatedAt=now();const old=m.version;m.version++;
    const r=await matches.replaceOne({_id:id,version:old},m);if(!r.modifiedCount)return err(res,'Score was updated on another device. Refresh.',409);
    res.json(viewMatch(m));
  }catch(e){err(res,e)}
}));
app.get('/api/fixtures',asyncRoute(async(_req,res)=>res.json((await fixtures.find({}).sort({date:1}).limit(60).toArray()).map(viewFixture))));
app.post('/api/fixtures',requireAdmin,asyncRoute(async(req,res)=>{
  const date=clean(req.body.date,10),time=clean(req.body.time,5),venue=clean(req.body.venue,90);
  if(!/^\d{4}-\d\d-\d\d$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!venue)return err(res,'Choose a date, time and ground');
  const doc={title:clean(req.body.title,80)||'Sunday Cricket',date,time,venue,overs:Math.min(50,Math.max(1,Number(req.body.overs)||10)),status:'open',players:[],teams:null,createdBy:String(req.user._id),createdAt:now(),lastReminderKey:'',matchId:null};
  const r=await fixtures.insertOne(doc);doc._id=r.insertedId;res.status(201).json(viewFixture(doc));
}));
app.post('/api/fixtures/:id/respond',requireAuth,asyncRoute(async(req,res)=>{
  const id=oid(req.params.id),doc=id?await fixtures.findOne({_id:id}):null;if(!doc)return err(res,'Fixture not found',404);if(doc.status!=='open')return err(res,'RSVPs are closed');
  const response=['going','maybe','out'].includes(req.body.response)?req.body.response:null;if(!response)return err(res,'Choose going, maybe or out');
  const all=doc.players.filter(p=>p.id!==String(req.user._id));all.push({id:String(req.user._id),name:req.user.name,response,at:now().toISOString()});
  await fixtures.updateOne({_id:id},{$set:{players:all,teams:null}});res.json({ok:true,players:all});
}));
app.post('/api/fixtures/:id/balance',requireAdmin,asyncRoute(async(req,res)=>{
  const id=oid(req.params.id),doc=id?await fixtures.findOne({_id:id}):null;if(!doc)return err(res,'Fixture not found',404);
  const selected=doc.players.filter(p=>p.response==='going');if(selected.length<2)return err(res,'At least two players must RSVP Going');
  const ids=selected.map(p=>oid(p.id)).filter(Boolean);const ps=await players.find({_id:{$in:ids}}).toArray();const teams=balanceTeams(ps.map(p=>({id:String(p._id),name:p.name,skill:p.skill,role:p.role})));
  await fixtures.updateOne({_id:id},{$set:{teams,status:'locked'}});res.json({teams});
}));
app.post('/api/fixtures/:id/jarvis-plan',requireAdmin,aiLimiter,asyncRoute(async(req,res)=>{
  const id=oid(req.params.id),f=id?await fixtures.findOne({_id:id}):null;if(!f)return err(res,'Fixture not found',404);
  const attending=f.players.filter(p=>p.response==='going');
  const ids=attending.map(p=>oid(p.id)).filter(Boolean),registered=await players.find({_id:{$in:ids}}).toArray();
  const teams=balanceTeams(registered.map(p=>({id:String(p._id),name:p.name,skill:p.skill,role:p.role})));
  if(!process.env.GEMINI_API_KEY)return res.json({suggestion:`${f.title} at ${f.venue} on ${f.date}, ${f.time} IST. ${attending.length} players confirmed. Suggested balanced teams: Madhuban XI - ${teams.teamA.map(p=>p.name).join(', ')||'waiting for players'}; Challengers XI - ${teams.teamB.map(p=>p.name).join(', ')||'waiting for players'}. Remind everyone to arrive 20 minutes early and carry kit and water.`,fallback:true});
  const instruction='You are JARVIS, Madhuban Cricket scheduling assistant. ONLY suggest cricket match arrangements. Use only these registered RSVP details, do not invent player availability or match outcomes. Give a concise Sunday match plan with teams, arrival checklist, fair batting order idea, and a short WhatsApp invite. Never claim to send messages or confirm bookings.';
  const content=JSON.stringify({fixture:{title:f.title,date:f.date,time:f.time,venue:f.venue,overs:f.overs},players:registered.map(p=>({name:p.name,role:p.role,skill:p.skill,batting:p.battingStyle,bowling:p.bowlingStyle})),balancedTeams:teams});
  try{const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL||'gemini-2.5-flash')}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:JSON.stringify({systemInstruction:{parts:[{text:instruction}]},contents:[{role:'user',parts:[{text:content}]}],generationConfig:{maxOutputTokens:600,temperature:0.4}}),signal:AbortSignal.timeout(16000)});if(!response.ok)throw Error('Provider unavailable');const d=await response.json();const answer=d.candidates?.[0]?.content?.parts?.map(p=>p.text).join(' ').trim();if(!answer)throw Error('Empty response');res.json({suggestion:answer.slice(0,3500),fallback:false});}catch{res.json({suggestion:`Provisional teams: ${teams.teamA.map(p=>p.name).join(', ')} versus ${teams.teamB.map(p=>p.name).join(', ')}. Confirm the venue, start on time, and remind your players to bring kit and water.`,fallback:true})}
}));
app.post('/api/fixtures/:id/start',requireAdmin,asyncRoute(async(req,res)=>{
  const id=oid(req.params.id),f=id?await fixtures.findOne({_id:id}):null;if(!f)return err(res,'Fixture not found',404);if(!f.teams)return err(res,'Balance the teams first');if(f.matchId)return err(res,'Match already started');
  const created=await newMatch({name:f.title,teamA:'Madhuban XI',teamB:'Challengers XI',overs:f.overs,venue:f.venue,tossWinner:req.body.tossWinner,tossDecision:req.body.tossDecision,rosters:f.teams},req.user._id);
  await fixtures.updateOne({_id:id},{$set:{matchId:created.id,status:'started'}});res.json({match:created});
}));
async function addNotification(playerId,title,body,fixtureId){await notifications.insertOne({playerId,title,body,fixtureId,read:false,createdAt:now()})}
async function sendFixtureReminders(f,{manual=false}={}){
  const key=`${f.date}|${f.time}|${manual?'manual': 'scheduled'}`;
  if(f.lastReminderKey===key)return {created:0,sent:0,skipped:true};
  const going=f.players.filter(p=>p.response==='going');let created=0,sent=0;
  for(const p of going){const member=await players.findOne({_id:oid(p.id)});if(!member)continue;
    const title=`${f.title} - match reminder`,body=`${f.date} at ${f.time} IST | ${f.venue}. Bring your kit, arrive early, and play fair.`;
    await addNotification(String(member._id),title,body,String(f._id));created++;
    if(member.emailReminders&&process.env.RESEND_API_KEY&&process.env.REMINDER_FROM_EMAIL){
      try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.REMINDER_FROM_EMAIL,to:[member.email],subject:title,text:`Hi ${member.name},\n\n${body}\n\nMadhuban Cricket`})});if(response.ok)sent++;else console.error('Reminder email provider returned',response.status)}catch(e){console.error('Reminder email unavailable:',e.message)}
    }
  }
  await fixtures.updateOne({_id:f._id},{$set:{lastReminderKey:key}});return {created,sent};
}
app.post('/api/fixtures/:id/remind',requireAdmin,asyncRoute(async(req,res)=>{
  const f=oid(req.params.id)?await fixtures.findOne({_id:oid(req.params.id)}):null;if(!f)return err(res,'Fixture not found',404);
  const recently=f.manualRemindedAt&&now()-new Date(f.manualRemindedAt)<22*3600000;if(recently)return err(res,'Manual reminders are limited to one per day',429);
  const r=await sendFixtureReminders(f,{manual:true});await fixtures.updateOne({_id:f._id},{$set:{manualRemindedAt:now()}});res.json(r);
}));
app.get('/api/notifications',requireAuth,asyncRoute(async(req,res)=>res.json(await notifications.find({playerId:String(req.user._id)}).sort({createdAt:-1}).limit(30).toArray().then(rows=>rows.map(x=>({...x,id:String(x._id),_id:undefined}))))));
app.post('/api/notifications/read',requireAuth,asyncRoute(async(req,res)=>{await notifications.updateMany({playerId:String(req.user._id),read:false},{$set:{read:true}});res.json({ok:true})}));
app.post('/api/cron/tick',asyncRoute(async(req,res)=>{
  const expected=process.env.CRON_SECRET,received=String(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  if(!expected||received.length!==expected.length||!timingSafeEqual(Buffer.from(received),Buffer.from(expected)))return err(res,'Unauthorized',401);
  const date=nextSunday();let inserted=false;
  if(!await fixtures.findOne({date,title:'Sunday Cricket'})){const doc={title:'Sunday Cricket',date,time:'07:00',venue:process.env.DEFAULT_VENUE||'Madhuban Ground',overs:10,status:'open',players:[],teams:null,createdBy:'scheduler',createdAt:now(),lastReminderKey:'',matchId:null};await fixtures.insertOne(doc);inserted=true;}
  const fs=await fixtures.find({status:{$in:['open','locked']}}).toArray();let reminders=0;
  for(const f of fs){const when=new Date(`${f.date}T${f.time}:00+05:30`),delta=when-now();if(delta>0&&delta<=26*3600000&&!f.lastReminderKey?.startsWith(`${f.date}|${f.time}|scheduled`)){const r=await sendFixtureReminders(f);reminders+=r.created;}}
  res.json({ok:true,sunday:date,inserted,reminders});
}));
app.post('/api/jarvis',requireAuth,aiLimiter,asyncRoute(async(req,res)=>{
  const question=clean(req.body.question,480);if(question.length<5)return err(res,'Ask a cricket question');
  const cricketTerms=/cricket|bat|bowl|wicket|over|fielder|fielding|catch|match|fixture|sunday|captain|team|run|strike|spin|pace|training|fitness|practice|score|league|leaderboard|my performance|my stats|improv|technique|innings|toss|yorker|seam|stump|boundary|powerplay|umpire|rsvp|form|jarvis/i;
  if(!cricketTerms.test(question))return res.json({answer:'I am JARVIS, your cricket-only assistant. Ask about your game, technique, team selection, fixtures or cricket stats.',restricted:true});
  if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:'JARVIS is not configured yet. The club organizer needs to add GEMINI_API_KEY to the server environment.'});
  const doc=await players.find({}).toArray(),ms=await matches.find({status:'completed'}).toArray();const s=allStats(ms,doc).find(x=>x.id===String(req.user._id));
  const system=`You are JARVIS, the Madhuban Cricket club's helpful cricket-only assistant. Never answer off-topic questions, never pretend to control scheduling or contact players, never hallucinate player statistics. Help with cricket tactics, training, fair competition, scorecards, player metrics, Sunday fixtures. No medical diagnoses or dangerous training. User's verified club stats JSON: ${JSON.stringify(s||{})}. Do not mention secret keys. If asked non-cricket topics respond only: 'I am JARVIS, here for cricket only.' Be concise, actionable, encouraging, and avoid unsupported claims.`;
  try{const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL||'gemini-2.5-flash')}:generateContent`;
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:question}]}],generationConfig:{maxOutputTokens:550,temperature:0.55}}),signal:AbortSignal.timeout(16000)});
    if(!response.ok)return err(res,`JARVIS service unavailable (${response.status}). Try again later.`,503);
    const json=await response.json();const answer=json.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join(' ').trim();if(!answer)return err(res,'JARVIS could not answer this time',503);res.json({answer:answer.slice(0,2600)});
  }catch(e){console.error('Jarvis provider error:',e.message);err(res,'JARVIS could not connect. Try again later.',503)}
}));
app.get('/api/health',(_req,res)=>res.json({ok:true,app:'Madhuban Cricket',version:'2.0.0'}));
const root=dirname(fileURLToPath(import.meta.url));app.use(express.static(join(root,'public'),{maxAge:'1h'}));app.get('*',(_req,res)=>res.sendFile(join(root,'public','index.html')));
app.use((error,_req,res,_next)=>{console.error(error);err(res,'Unexpected server error',500)});
await dbClient.connect();await Promise.all([players.createIndex({email:1},{unique:true}),matches.createIndex({updatedAt:-1}),fixtures.createIndex({date:1}),notifications.createIndex({playerId:1,createdAt:-1})]);
app.listen(Number(process.env.PORT||3000),()=>console.log(`Madhuban Cricket v2 listening on ${process.env.PORT||3000}`));