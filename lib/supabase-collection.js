/** PostgreSQL/Supabase persistence for Madhuban Cricket.
 * Only a server-side SUPABASE_DATABASE_URL is used; no browser database secrets.
 * Keeps the previous collection API at the route boundary to preserve existing match logic.
 */
import {randomBytes} from 'node:crypto';

const TABLES={players:'mc_players',matches:'mc_matches',fixtures:'mc_fixtures',notifications:'mc_notifications'};
export const isId=(value)=>typeof value==='string'&&/^[a-f0-9]{24}$/.test(value);
export const oid=(value)=>isId(value)?value:null;
const asJSON=value=>JSON.stringify(value);
const unpack=row=>row?{...row.data,_id:row.id}:null;
const field=k=>k==='_id'?'id':'data';
function clause(filter={},parameters=[]){
  const clauses=[];
  for(const [k,v] of Object.entries(filter)){
    const target=k==='_id'?'id':`data ->> $${parameters.push(k)}`;
    if(v && typeof v==='object' && !(v instanceof Date) && !Array.isArray(v)){
      if('$in' in v){parameters.push(v.$in.map(String));clauses.push(`${target} = ANY($${parameters.length}::text[])`)}
      else if('$gt' in v){parameters.push(v.$gt instanceof Date?v.$gt.toISOString():String(v.$gt));clauses.push(`${target} > $${parameters.length}`)}
      else if('$ne' in v){parameters.push(String(v.$ne));clauses.push(`${target} IS DISTINCT FROM $${parameters.length}`)}
      else {parameters.push(JSON.stringify(v));clauses.push(k==='_id'?`${target} = $${parameters.length}`:`data -> $${parameters.length-1} = $${parameters.length}::jsonb`)}
    } else if(v===null){clauses.push(k==='_id'?'id IS NULL':`(data -> $${parameters.length}) IS NULL`)}
    else if(k==='_id'){parameters.push(String(v));clauses.push(`id = $${parameters.length}`)}
    else{parameters.push(JSON.stringify(v));clauses.push(`data -> $${parameters.length-1} = $${parameters.length}::jsonb`)}
  }
  return clauses.length?`WHERE ${clauses.join(' AND ')}`:'';
}
function project(doc,projection){if(!doc||!projection)return doc;let d={...doc};for(const [k,v] of Object.entries(projection)){if(v===0)delete d[k]};return d}
function compare(a,b,sort){for(const [k,dir] of Object.entries(sort)){const x=a[k],y=b[k];const nx=x instanceof Date?x.getTime():x,ny=y instanceof Date?y.getTime():y;if(nx===ny)continue;if(nx==null)return 1;if(ny==null)return -1;return (nx<ny?-1:1)*(dir<0?-1:1)}return 0}
export class Collection{
  constructor(pool,name){if(!TABLES[name])throw Error('Unknown collection');this.pool=pool;this.table=TABLES[name]}
  async read(filter={}){const params=[];const where=clause(filter,params);const {rows}=await this.pool.query(`SELECT id,data FROM public.${this.table} ${where}`,params);return rows.map(unpack)}
  async findOne(filter={}){const params=[];const where=clause(filter,params);const {rows}=await this.pool.query(`SELECT id,data FROM public.${this.table} ${where} LIMIT 1`,params);return unpack(rows[0])}
  find(filter={},options={}){let sortSpec={},max=Infinity;return {sort(spec){sortSpec=spec;return this},limit(n){max=n;return this},toArray:async()=>{let docs=await this.read(filter);if(Object.keys(sortSpec).length)docs.sort((a,b)=>compare(a,b,sortSpec));if(Number.isFinite(max))docs=docs.slice(0,max);return docs.map(d=>project(d,options.projection))},read:this.read.bind(this)}}
  async insertOne(doc){const id=doc._id||randomBytes(12).toString('hex');const clean={...doc};delete clean._id;try{await this.pool.query(`INSERT INTO public.${this.table} (id,data) VALUES ($1,$2::jsonb)`,[id,asJSON(clean)]);return {insertedId:id}}catch(e){if(e.code==='23505')e.code=11000;throw e}}
  async updateOne(filter,update){return this.edit(filter,update,false)}
  async findOneAndUpdate(filter,update){return this.edit(filter,update,true)}
  async edit(filter,update,returnDoc){const client=await this.pool.connect();try{await client.query('BEGIN');const params=[];const where=clause(filter,params);const found=await client.query(`SELECT id,data FROM public.${this.table} ${where} LIMIT 1 FOR UPDATE`,params);if(!found.rows.length){await client.query('COMMIT');return returnDoc?null:{matchedCount:0,modifiedCount:0}}
    const original=unpack(found.rows[0]);const current={...original,...update.$set};for(const k of Object.keys(update.$unset||{}))delete current[k];delete current._id;
    await client.query(`UPDATE public.${this.table} SET data=$2::jsonb,updated_at=now() WHERE id=$1`,[original._id,asJSON(current)]);await client.query('COMMIT');return returnDoc?original:{matchedCount:1,modifiedCount:1};
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
  async updateMany(filter,update){const docs=await this.read(filter);let n=0;for(const d of docs){const r=await this.updateOne({_id:d._id,...filter},update);n+=r.modifiedCount}return{modifiedCount:n}}
  async replaceOne(filter,doc){const id=String(filter._id||doc._id);const copy={...doc};delete copy._id;const params=[id,asJSON(copy)];let where='id=$1';if(Object.hasOwn(filter,'version')){params.push(String(filter.version));where+=` AND data ->> 'version' = $3`}
    const r=await this.pool.query(`UPDATE public.${this.table} SET data=$2::jsonb,updated_at=now() WHERE ${where}`,params);return {matchedCount:r.rowCount,modifiedCount:r.rowCount};
  }
}