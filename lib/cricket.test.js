import test from 'node:test';import assert from 'node:assert/strict';import {createDelivery,blankInnings,rollup,scorecard,balanceTeams,resultText} from './cricket.js';
test('runs, legal balls, extras, scorecards',()=>{const i=blankInnings('A','B');i.events.push(createDelivery({striker:'Sam',nonStriker:'Lee',bowler:'Joe',batRuns:4}));i.events.push(createDelivery({striker:'Sam',nonStriker:'Lee',bowler:'Joe',extraType:'wide',additional:2}));rollup(i);assert.equal(i.runs,7);assert.equal(i.extras,3);assert.equal(i.balls,1);const x=scorecard(i);assert.equal(x.batting.find(b=>b.name==='Sam').runs,4);assert.equal(x.bowling[0].runs,7)});
test('illegal extras rejected',()=>assert.throws(()=>createDelivery({striker:'A',nonStriker:'B',bowler:'C',extraType:'wide',batRuns:4})));
test('balanced sides retain all players',()=>{const a=balanceTeams([{name:'A',skill:5},{name:'B',skill:4},{name:'C',skill:3},{name:'D',skill:2}]);assert.equal(a.teamA.length+a.teamB.length,4)});


test('no balls do not count as batter balls faced',()=>{
 const i=blankInnings('A','B');
 i.events.push(createDelivery({striker:'Sam',nonStriker:'Raj',bowler:'Dev',extraType:'no-ball',batRuns:4}));
 rollup(i);const card=scorecard(i);assert.equal(i.runs,5);assert.equal(i.balls,0);assert.equal(card.batting[0].runs,4);assert.equal(card.batting[0].balls,0);assert.equal(card.bowling[0].runs,5);
});

test('run out of unregistered non striker must not attribute wicket to striker',()=>{
 const b=createDelivery({striker:'Sam',nonStriker:'Raj',bowler:'Dev',wicket:true,wicketKind:'run out',outName:'Raj',strikerId:'507f1f77bcf86cd799439011'});
 assert.equal(b.outId,'');assert.equal(b.outName,'Raj');
});

test('small sided win uses the registered chasing roster size',()=>{
 const match={status:'completed',teamA:'A',teamB:'B',rosters:{teamA:[1,2,3,4,5],teamB:[1,2,3,4,5]},innings:[{runs:40},{runs:42,wickets:1,bat:'B'}]};
 assert.equal(resultText(match),'B won by 3 wickets');
});
