// Only the two dedicated test accounts may be rotated. Never print credentials.
import {createClient} from '@supabase/supabase-js'
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs'
import {parseEnv} from 'node:util'
import {randomBytes} from 'node:crypto'
const source='.env.fixtures', pending='.env.rotation'
const original=readFileSync(source,'utf8'), current=parseEnv(original)
if(!existsSync(pending)){
 let next=original
 for(const prefix of ['DEMO','QA'])next=next.replace(new RegExp('^'+prefix+'_PASSWORD=.*$','m'),prefix+'_PASSWORD='+randomBytes(32).toString('base64url'))
 writeFileSync(pending,next,{mode:0o600,flag:'wx'})
}
const next=parseEnv(readFileSync(pending,'utf8'))
for(const prefix of ['DEMO','QA']){
 const client=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 const email=current[prefix+'_EMAIL'],password=current[prefix+'_PASSWORD'],updated=next[prefix+'_PASSWORD']
 if(!email.endsWith('@example.invalid')||!email.startsWith('invoiceeye-'))throw Error('Unexpected fixture identity')
 let result=await client.auth.signInWithPassword({email,password})
 if(result.error){result=await client.auth.signInWithPassword({email,password:updated})}
 if(result.data.user?.id!==current[prefix+'_USER_ID'])throw Error('Fixture identity check failed')
 if(result.data.session){
  const {error}=await client.auth.updateUser({password:updated})
  if(error&&error.code!=='same_password')throw Error('Password rotation failed: '+error.code)
 }
 const verified=await client.auth.signInWithPassword({email,password:updated})
 if(verified.data.user?.id!==current[prefix+'_USER_ID'])throw Error('Rotation verification failed')
 await client.auth.signOut()
 console.log(prefix+' password rotated and same account ID verified.')
}
renameSync(pending,source)
