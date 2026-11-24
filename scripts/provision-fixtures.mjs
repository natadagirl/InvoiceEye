// Operator-only. The CLI supplies an admin key in memory for creating confirmed test users.
import {execFileSync} from 'node:child_process'
import {openSync,writeSync,closeSync} from 'node:fs'
import {randomBytes,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
const project='zvvhoamgmkvgzuccufmk'
const url=process.env.VITE_SUPABASE_URL
if(new URL(url).hostname!==project+'.supabase.co')throw new Error('Unexpected project')
const cli=process.env.SUPABASE_CLI||'supabase'
const keys=JSON.parse(execFileSync(cli,['projects','api-keys','--project-ref',project,'-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}))
const key=keys.find(k=>k.name==='service_role')?.api_key
if(!key)throw new Error('Admin provisioning key unavailable')
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
const fd=openSync('.env.fixtures','wx',0o600)
try{
 for(const prefix of ['DEMO','QA']){
  const email='invoiceeye-'+prefix.toLowerCase()+'-'+randomUUID()+'@example.invalid'
  const password=randomBytes(27).toString('base64url')
  writeSync(fd,prefix+'_EMAIL='+email+'\n'+prefix+'_PASSWORD='+password+'\n')
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true})
  if(error)throw new Error(error.message)
  writeSync(fd,prefix+'_USER_ID='+data.user.id+'\n')
 }
}finally{closeSync(fd)}
console.log('Created two confirmed synthetic users. Login details are in .env.fixtures (0600).')
