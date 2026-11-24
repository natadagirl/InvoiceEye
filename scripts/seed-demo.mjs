import {readFileSync,mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
const uid=process.argv[2]
if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(uid??''))throw new Error('Supply an authorized demo owner UUID')
if(readFileSync('supabase/.temp/project-ref','utf8').trim()!=='zvvhoamgmkvgzuccufmk')throw new Error('Unexpected linked project')
const dir=mkdtempSync(join(tmpdir(),'invoiceeye-seed-')),file=join(dir,'demo.sql')
try{
 writeFileSync(file,readFileSync('supabase/demo.sql','utf8').replaceAll(":'demo_user'","'"+uid+"'"),{mode:0o600})
 execFileSync(process.env.SUPABASE_CLI||'supabase',['db','query','--remote','--file',file,'--yes'],{stdio:'inherit'})
}finally{unlinkSync(file);rmdirSync(dir)}
