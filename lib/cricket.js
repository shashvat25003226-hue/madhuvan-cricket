export const uid = value => String(value ?? '').trim().slice(0,96);
export const overs = balls => `${Math.floor(balls/6)}.${balls%6}`;
export const blankInnings=(bat,bowl)=>({bat,bowl,events:[],runs:0,wickets:0,balls:0,extras:0,closed:false});
export function rollup(innings){
  let runs=0,wickets=0,balls=0,extras=0;
  for(const e of innings.events){runs+=e.total;extras+=e.extras;if(e.wicket)wickets++;if(e.legal)balls++;}
  Object.assign(innings,{runs,wickets,balls,extras});return innings;
}
export function createDelivery(data){
  const striker=uid(data.striker),nonStriker=uid(data.nonStriker),bowler=uid(data.bowler);
  if(!striker||!nonStriker||!bowler||striker===nonStriker)throw Error('Select two different batters and a bowler');
  const type=['none','wide','no-ball','bye','leg-bye'].includes(data.extraType)?data.extraType:'none';
  const batRuns=Number(data.batRuns??0),additional=Number(data.additional??0);
  if(!Number.isInteger(batRuns)||batRuns<0||batRuns>6||!Number.isInteger(additional)||additional<0||additional>7)throw Error('Runs must be a whole number from 0 to 7');
  if(['wide','bye','leg-bye'].includes(type)&&batRuns)throw Error('Bat runs are not valid for this extra');
  if(type==='none'&&additional)throw Error('Select an extra type first');
  const wicket=Boolean(data.wicket),wicketKind=uid(data.wicketKind)||'bowled';
  if(wicket&&!['bowled','caught','lbw','stumped','run out','hit wicket'].includes(wicketKind))throw Error('Invalid wicket kind');
  if(wicket&&['wide','no-ball'].includes(type)&&!['run out','stumped'].includes(wicketKind))throw Error('That dismissal is not permitted with the selected extra');
  if(wicket&&type==='no-ball'&&wicketKind!=='run out')throw Error('Only a run out is supported on a no-ball');
  const extras=additional+(type==='wide'||type==='no-ball'?1:0);
  const legal=!['wide','no-ball'].includes(type);
  return {striker,nonStriker,bowler,strikerId:uid(data.strikerId),nonStrikerId:uid(data.nonStrikerId),bowlerId:uid(data.bowlerId),batRuns,extras,total:batRuns+extras,extraType:type,legal,wicket,wicketKind:wicket?wicketKind:'',outName:wicket?uid(data.outName)||striker:'',outId:wicket?(uid(data.outId)||(uid(data.outName)&&uid(data.outName).toLowerCase()!==striker.toLowerCase()?'':uid(data.strikerId))):'',at:new Date().toISOString()};
}
export function scorecard(innings){
  const bat=new Map(),bowl=new Map();
  const getBat=(id,name)=>{const key=id||`guest:${name}`;if(!bat.has(key))bat.set(key,{id,name,runs:0,balls:0,fours:0,sixes:0,out:false});return bat.get(key)};
  const getBowl=(id,name)=>{const key=id||`guest:${name}`;if(!bowl.has(key))bowl.set(key,{id,name,balls:0,runs:0,wickets:0});return bowl.get(key)};
  for(const e of innings.events){
    const b=getBat(e.strikerId,e.striker),w=getBowl(e.bowlerId,e.bowler);
    b.runs+=e.batRuns;if(e.extraType!=='wide'&&e.extraType!=='no-ball')b.balls++;if(e.batRuns===4)b.fours++;if(e.batRuns===6)b.sixes++;
    if(e.wicket)getBat(e.outId,e.outName).out=true;
    if(e.legal)w.balls++;
    w.runs+=e.batRuns+(['wide','no-ball'].includes(e.extraType)?e.extras:0);
    if(e.wicket&&e.wicketKind!=='run out')w.wickets++;
  }
  return {batting:[...bat.values()].map(x=>({...x,strikeRate:x.balls?+(100*x.runs/x.balls).toFixed(1):0})),bowling:[...bowl.values()].map(x=>({...x,economy:x.balls?+(6*x.runs/x.balls).toFixed(2):0}))};
}
export function resultText(match){
  if(match.status==='innings-break')return 'Innings break - ready for the chase';
  if(match.status!=='completed')return 'Match in progress';
  const [first,second]=match.innings;
  if(!second)return 'Match ended after the first innings';
  if(first.runs===second.runs)return 'Match tied';
  const rosterKey=second.bat===match.teamA?'teamA':'teamB';
  const squadSize=match.rosters?.[rosterKey]?.length;const availableWickets=squadSize?Math.max(1,squadSize-1):10;
  return second.runs>first.runs?`${second.bat} won by ${Math.max(0,availableWickets-second.wickets)} wickets`:`${first.bat} won by ${first.runs-second.runs} runs`;
}
export function allStats(matches,players,after=null){
  const stats=new Map(players.map(p=>[String(p._id),{id:String(p._id),name:p.name,role:p.role,battingStyle:p.battingStyle,bowlingStyle:p.bowlingStyle,matches:0,runs:0,balls:0,fours:0,sixes:0,wickets:0,bowlBalls:0,bowlRuns:0,catches:0}]));
  for(const m of matches){if(m.status!=='completed'||(after&&new Date(m.updatedAt)<after))continue;
    const participated=new Set();for(const inn of m.innings){const cards=scorecard(inn);
      for(const b of cards.batting){const p=stats.get(b.id);if(!p)continue;participated.add(b.id);p.runs+=b.runs;p.balls+=b.balls;p.fours+=b.fours;p.sixes+=b.sixes;}
      for(const b of cards.bowling){const p=stats.get(b.id);if(!p)continue;participated.add(b.id);p.wickets+=b.wickets;p.bowlBalls+=b.balls;p.bowlRuns+=b.runs;}
    }for(const id of participated)stats.get(id).matches++;
  }
  return [...stats.values()].map(s=>({...s,strikeRate:s.balls?+(100*s.runs/s.balls).toFixed(1):0,economy:s.bowlBalls?+(6*s.bowlRuns/s.bowlBalls).toFixed(2):0}));
}
export function nextSunday(now=new Date()){
  const d=new Date(now.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));const diff=(7-d.getDay())%7;
  d.setDate(d.getDate()+diff);d.setHours(7,0,0,0);
  if(diff===0&&now.toLocaleString('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false})>='07')d.setDate(d.getDate()+7);
  const yyyy=d.getFullYear(),mm=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');return `${yyyy}-${mm}-${dd}`;
}
export function balanceTeams(players){const ordered=[...players].sort((a,b)=>((b.skill??3)-(a.skill??3))||a.name.localeCompare(b.name));const sides=[[],[]],power=[0,0];for(const p of ordered){const index=power[0]===power[1]?(sides[0].length<=sides[1].length?0:1):(power[0]<power[1]?0:1);sides[index].push(p);power[index]+=(p.skill??3)}return {teamA:sides[0],teamB:sides[1]};}
