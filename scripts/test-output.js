#!/usr/bin/env node
const BASE = 'http://localhost:3099'
async function getCsrf() {
  const r = await fetch(BASE + '/api/auth/csrf')
  const j = await r.json()
  return { token: j.csrfToken, cookie: (r.headers.get('set-cookie')||'').split(';')[0] }
}
async function login(email, pw) {
  const { token, cookie } = await getCsrf()
  const r = await fetch(BASE + '/api/auth/callback/credentials', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','Cookie':cookie},
    body: new URLSearchParams({email,password:pw,csrfToken:token,redirect:'false',json:'true',callbackUrl:'/'}),
    redirect:'manual'
  })
  const sc = r.headers.get('set-cookie')||''
  const cookies = [cookie]
  sc.split(/,(?=[^;]+;)/).forEach(c => { const m=c.match(/([^=]+)=([^;]+)/); if(m&&m[1].includes('session')) cookies.push(m[1]+'='+m[2]) })
  return cookies.join('; ')
}
async function post(p, b, c) { const r = await fetch(BASE+p,{method:'POST',headers:{'Content-Type':'application/json','Cookie':c},body:JSON.stringify(b)}); return {s:r.status,j:await r.json().catch(()=>({}))} }
async function get(p, c) { const r = await fetch(BASE+p,{headers:{'Cookie':c}}); return {s:r.status,j:await r.json().catch(()=>({}))} }

async function main() {
  const email = 't'+Date.now()+'@e.com'
  await post('/api/auth/register', {email,password:'test12345',name:'TestUser'})
  const c = await login(email,'test12345')
  const d = await post('/api/dramas', {title:'魔法觉醒',genre:'都市',style:'realistic'}, c)
  const dramaId = d.j.id
  
  const novelText = '第1章 觉醒\n\n林逸坐在昏暗房间里。曾经他是城市最著名的魔术师，但解密风潮让他事业崩塌。突然一道金光从天而降，贯穿他的胸口。【魔法系统已绑定】。\n\n第2章 初试身手\n\n林逸调动能量，火焰从指尖窜出。邻居白有容推门而入。\n\n第3章 危机\n\n城市另一边黑暗力量酝酿，林逸是关键。'
  const u = await post('/api/novels', {dramaId,text:novelText,fileName:'test.txt'}, c)
  
  // Skeleton
  const sk = await post('/api/dramas/'+dramaId+'/generate-skeleton', {}, c)
  console.log('Skeleton:', sk.s)
  
  // Save strategy
  await fetch(BASE+'/api/novels/'+u.j.novel.id+'/parsed-content',{method:'PATCH',headers:{'Content-Type':'application/json','Cookie':c},body:JSON.stringify({key:'strategy',value:'<adaptationStrategy>测试</adaptationStrategy>'})})
  
  // Scripts
  const sc = await post('/api/dramas/'+dramaId+'/generate-scripts', {
    startEpisode:1, endEpisode:1,
    skeleton: sk.j.skeleton || '<s>测试</s>',
    strategy: '<a>测试</a>',
    targetDuration:'120s', genreStyle:'都市', targetPlatform:'douyin'
  }, c)
  console.log('Scripts:', sc.s, 'episodes:', sc.j.episodes?.length)
  
  if (sc.j.episodes?.length > 0) {
    const ep = await get('/api/episodes/'+sc.j.episodes[0].id, c)
    console.log('\n=== TITLE ===')
    console.log(ep.j.title)
    console.log('\n=== SCRIPT CONTENT ===')
    console.log(ep.j.scriptContent || '(empty)')
    console.log('\n=== LENGTH ===', (ep.j.scriptContent||'').length)
  }
  process.exit(0)
}
main().catch(e=>{console.error(e);process.exit(1)})
