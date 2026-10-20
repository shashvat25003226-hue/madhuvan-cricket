import test from 'node:test';
import assert from 'node:assert/strict';
import {Collection,isId,oid} from './supabase-collection.js';

function harness(seed=[]){
  const rows=seed.map(x=>({id:x._id,data:Object.fromEntries(Object.entries(x).filter(([k])=>k!=='_id'))}));
  const calls=[];
  const exec=async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.startsWith('INSERT')){if(rows.some(x=>x.id===params[0])){const e=Error('duplicate');e.code='23505';throw e}rows.push({id:params[0],data:JSON.parse(params[1])});return{rowCount:1}}
    if(sql.startsWith('SELECT'))return{rows:rows.map(x=>structuredClone(x))};
    if(sql.startsWith('UPDATE')){const rec=rows.find(x=>x.id===params[0]);if(!rec)return{rowCount:0};if(sql.includes("data ->> 'version'")&&String(rec.data.version)!==params[2])return{rowCount:0};rec.data=JSON.parse(params[1]);return{rowCount:1}}
    return{rowCount:0};
  };
  const pool={query:exec,connect:async()=>({query:exec,release:()=>{}})};
  return {collection:new Collection(pool,'players'),calls,rows};
}
test('IDs are 24-char hex and stored as PostgreSQL JSONB',async()=>{
  assert.ok(isId('0123456789abcdef01234567'));assert.equal(oid('bad'),null);
  const h=harness();const result=await h.collection.insertOne({name:'Swastik',email:'test@example.com'});
  assert.ok(isId(result.insertedId));assert.match(h.calls[0].sql,/INSERT INTO public\.mc_players/);assert.equal(h.rows[0].data.email,'test@example.com');
});
test('duplicates become the app-compatible conflict code',async()=>{
  const h=harness([{_id:'0123456789abcdef01234567',email:'a@example.com'}]);
  await assert.rejects(h.collection.insertOne({_id:'0123456789abcdef01234567',email:'a@example.com'}),{code:11000});
});
test('filters are parameterized, including authentication lookup',async()=>{
  const h=harness([{_id:'0123456789abcdef01234567',email:'a@example.com'}]);
  await h.collection.findOne({email:"' OR true --"});
  const q=h.calls[0];assert.equal(q.sql.includes("' OR true --"),false);assert.deepEqual(q.params,['email',JSON.stringify("' OR true --")]);
});
test('scoring replaces documents with optimistic version guards',async()=>{
  const id='0123456789abcdef01234567',h=harness([{_id:id,version:2}]);
  assert.equal((await h.collection.replaceOne({_id:id,version:1},{_id:id,version:2})).modifiedCount,0);
  assert.equal((await h.collection.replaceOne({_id:id,version:2},{_id:id,version:3})).modifiedCount,1);
  assert.equal(h.rows[0].data.version,3);
});
test('profile updates use transactions and do not leak _id into JSON',async()=>{
  const id='0123456789abcdef01234567',h=harness([{_id:id,email:'a@example.com',name:'Old'}]);
  const result=await h.collection.updateOne({_id:id},{$set:{name:'New'}});
  assert.equal(result.modifiedCount,1);assert.equal(h.rows[0].data.name,'New');assert.equal('_id' in h.rows[0].data,false);
  assert.ok(h.calls.some(x=>x.sql==='BEGIN'));
});