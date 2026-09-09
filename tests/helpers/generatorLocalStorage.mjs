// A small Supabase-shaped adapter: RPCs execute real migration functions in
// isolated PostgreSQL; Storage holds actual image bytes locally in memory.
export function localGeneratorClient(db) {
 const objects=new Map();
 const identifier=value=>{if(!/^[a-z_][a-z_0-9]*$/.test(value))throw new Error('Invalid test SQL identifier');return `"${value}"`;};
 const response=async operation=>{try{return {data:await operation(),error:null};}catch(error){return {data:null,error:{message:error.message}};}};
 const client={
  rpc(name,args={}) { return response(async()=>{
   const keys=Object.keys(args);
   const rows=(await db.query(`select public.${identifier(name)}(${keys.map((key,n)=>`${identifier(key)} => $${n+1}`).join(',')}) as result`,Object.values(args))).rows;
   return rows[0].result;
  }); },
  from(table) {
   const filters=[];let columns='*';let update=null;let single=false;
   const query={
    select(value){columns=value;return query;},eq(key,value){filters.push([key,value,false]);return query;},in(key,value){filters.push([key,value,true]);return query;},
    update(value){update=value;return query;},single(){single=true;return query;},maybeSingle(){single=true;return query;},
    then(resolve,reject){return response(async()=>{
     const args=update?Object.values(update):[];
     const set=update?Object.keys(update).map((key,n)=>`${identifier(key)}=$${n+1}`).join(','):'';
     const where=filters.map(([key,value,array])=>{args.push(value);return `${identifier(key)}${array?'=any(':'='}$${args.length}${array?')':''}`;}).join(' and ');
     const sql=update?`update public.${identifier(table)} set ${set}`:`select ${columns==='*'?'*':columns.split(',').map(identifier).join(',')} from public.${identifier(table)}`;
     const result=await db.query(sql+(where?` where ${where}`:''),args);
     return single?result.rows[0]??null:result.rows;
    }).then(resolve,reject);}
   }; return query;
  },
  storage:{from(bucket){return {
   upload(path,bytes){return response(async()=>{const key=`${bucket}/${path}`;if(objects.has(key))throw new Error('Object already exists');objects.set(key,Buffer.from(bytes));return {path};});},
   download(path){return response(async()=>{const bytes=objects.get(`${bucket}/${path}`);if(!bytes)throw new Error('Object missing');return new Blob([bytes]);});},
   remove(paths){return response(async()=>{for(const path of paths)objects.delete(`${bucket}/${path}`);return [];});}
  };}}
 };
 return {client,objects};
}
