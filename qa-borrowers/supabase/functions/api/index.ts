import { createClient } from 'npm:@supabase/supabase-js@2';
const url=Deno.env.get('SUPABASE_URL')!, key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, secret=Deno.env.get('APP_SESSION_SECRET')!;
const db=createClient(url,key,{auth:{persistSession:false}});
const cors={'Access-Control-Allow-Origin':Deno.env.get('APP_ORIGIN')||'https://YOUR_GITHUB_USERNAME.github.io','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const enc=new TextEncoder();
function b64(b:Uint8Array){return btoa(String.fromCharCode(...b)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
function unb64(s:string){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0))}
async function hmac(s:string){const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(s))))}
async function sign(id:string){const p=b64(enc.encode(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})));return p+'.'+await hmac(p)}
async function identity(req:Request){const t=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');const [p,s]=t.split('.');if(!p||!s||await hmac(p)!==s)throw Error('Session expired');const payload=JSON.parse(new TextDecoder().decode(unb64(p)));if(payload.exp<Date.now()/1000)throw Error('Session expired');const {data,error}=await db.from('qa_employees').select('id,employee_code,full_name,role,department,active').eq('id',payload.sub).single();if(error||!data?.active)throw Error('Unauthorized');return data}
function respond(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})}
function str(v:unknown,max=250){return String(v??'').trim().slice(0,max)}
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return respond({error:'Method not allowed'},405);
try{if(!secret||secret.length<32)throw Error('Server session secret not configured');const body=await req.json();const action=body.action;
if(action==='login'){
 const code=str(body.employee_code,60).toUpperCase(),pin=String(body.pin||'');if(!/^\d{4}$/.test(pin)||!code)return respond({error:'Invalid credentials'},401);
 const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';const ipHash=await hmac(ip);
 const since=new Date(Date.now()-15*60000).toISOString();const {count}=await db.from('qa_login_attempts').select('*',{count:'exact',head:true}).eq('ip_hash',ipHash).eq('success',false).gte('created_at',since);
 if((count||0)>=8)return respond({error:'Too many attempts. Try again later.'},429);
 const {data}=await db.rpc('qa_check_pin',{p_code:code,p_pin:pin});const valid=data?.[0];
 await db.from('qa_login_attempts').insert({employee_code:code,ip_hash:ipHash,success:!!valid});
 if(!valid)return respond({error:'Invalid credentials'},401);
 return respond({token:await sign(valid.id),employee:valid});
}
const me=await identity(req);
if(action==='me')return respond({employee:me});
if(action==='list'){const {data,error}=await db.from('qa_borrowings').select('*').order('borrowed_at',{ascending:false}).limit(2000);if(error)throw error;return respond({records:data})}
if(action==='borrow'){const r=body.record||{};const fields=['material_name','condition_out','borrower_name','borrower_department','purpose','released_by_name'];const row:Object=Object.fromEntries(fields.map(f=>[f,str(r[f],f==='purpose'?250:150)]));if(fields.some(f=>!str(r[f])))return respond({error:'Complete all required fields'},400);const {error}=await db.from('qa_borrowings').insert({...row,remarks:str(r.remarks,500),released_by_employee_id:me.id});if(error)throw error;return respond({ok:true})}
if(action==='return'){const id=str(body.id,50);const {data,error}=await db.from('qa_borrowings').update({returned_at:new Date().toISOString(),returned_by_employee_id:me.id,remarks:str(body.remarks,500)}).eq('id',id).is('returned_at',null).select('id');if(error)throw error;if(!data?.length)return respond({error:'Already returned or not found'},409);return respond({ok:true})}
if(action==='create_employee'){if(me.role!=='admin')return respond({error:'Forbidden'},403);const e=body.employee||{};if(!/^\d{4}$/.test(String(e.pin||'')))return respond({error:'PIN must be 4 digits'},400);if(!['admin','employee'].includes(e.role))return respond({error:'Invalid role'},400);const {error}=await db.rpc('qa_create_employee',{p_code:str(e.employee_code,60).toUpperCase(),p_name:str(e.full_name,120),p_department:str(e.department,120),p_role:e.role,p_pin:e.pin});if(error)throw error;return respond({ok:true})}
return respond({error:'Unknown action'},400);
}catch(e){const message=e instanceof Error?e.message:'Unexpected error';console.error(message);return respond({error:['Session expired','Unauthorized'].includes(message)?message:'Request could not be completed'},['Session expired','Unauthorized'].includes(message)?401:500)}});
