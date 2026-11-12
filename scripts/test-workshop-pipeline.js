#!/usr/bin/env node
/**
 * Test workshop → pipeline integration
 */
const BASE = 'http://localhost:3099'

async function getCsrf() {
  const res = await fetch(`${BASE}/api/auth/csrf`)
  const json = await res.json()
  return { csrfToken: json.csrfToken, cookies: (res.headers.get('set-cookie') || '').split(';')[0] }
}

async function login(email, password) {
  const { csrfToken, cookies: csrfCookie } = await getCsrf()
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: csrfCookie },
    body: new URLSearchParams({ email, password, csrfToken, redirect: 'false', json: 'true', callbackUrl: '/' }),
    redirect: 'manual'
  })
  const setCookie = res.headers.get('set-cookie') || ''
  const cookies = [csrfCookie]
  const regex = /([^;,=\s]+)=([^;,]+)/g
  let match
  while ((match = regex.exec(setCookie)) !== null) {
    if (match[1].startsWith('next-auth')) cookies.push(`${match[1]}=${match[2]}`)
  }
  return cookies.filter(Boolean).join('; ')
}

async function req(method, path, body, cookies) {
  const headers = { 'Content-Type': 'application/json' }
  if (cookies) headers.Cookie = cookies
  const opts = { method, headers }
  if (body && method !== 'GET') opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { _raw: text.slice(0, 500) } }
  return { status: res.status, json, text }
}

async function main() {
  console.log('=== Workshop → Pipeline Integration Test ===\n')
  const email = `test-${Date.now()}@example.com`
  
  // Register + login
  await req('POST', '/api/auth/register', { email, password: 'test12345', name: 'TestUser' })
  const cookies = await login(email, 'test12345')
  const sess = await req('GET', '/api/auth/session', null, cookies)
  if (!sess.json.user) { console.log('Login failed'); process.exit(1) }
  console.log('✅ Login OK')

  // Create drama
  const drama = await req('POST', '/api/dramas', { title: '测试', genre: '都市', style: 'realistic' }, cookies)
  const dramaId = drama.json.id
  console.log(`✅ Drama: ${dramaId}`)

  // Upload novel
  const novelText = `第1章 觉醒\n\n林逸坐在昏暗房间里。曾经他是城市最著名的魔术师，但解密风潮让他事业崩塌。"如果真的有魔法就好了。" 突然，一道金光从天而降，贯穿他的胸口。【魔法系统已绑定】。\n\n第2章 初试身手\n\n林逸调动能量，火焰从指尖窜出。邻居白有容推门而入，正好看到这一幕。\n\n第3章 危机降临\n\n城市另一边黑暗力量酝酿，林逸是关键。白有容看着林逸，眼神中既有惊讶又有恐惧。`
  const upload = await req('POST', '/api/novels', { dramaId, text: novelText, fileName: 'test.txt' }, cookies)
  console.log(`✅ Novel uploaded: ${upload.json.chapters?.length} chapters`)

  // Generate skeleton
  console.log('\n--- Generate skeleton ---')
  const skel = await req('POST', `/api/dramas/${dramaId}/generate-skeleton`, {}, cookies)
  console.log(`Status: ${skel.status}`)
  if (skel.status === 200) {
    console.log(`✅ Skeleton: ${skel.json.skeleton?.slice(0, 100)}...`)
  } else {
    console.log(`❌ Error: ${JSON.stringify(skel.json).slice(0, 200)}`)
  }

  // Save skeleton if AI failed
  if (skel.status !== 200) {
    const novelId = upload.json.novel?.id
    if (novelId) {
      await req('PATCH', `/api/novels/${novelId}/parsed-content`, {
        key: 'skeleton',
        value: '<storySkeleton># 测试骨架\n## 故事核\n林逸觉醒魔法</storySkeleton>'
      }, cookies)
    }
  }

  // Generate strategy
  console.log('\n--- Generate strategy ---')
  const strat = await req('POST', `/api/dramas/${dramaId}/generate-strategy`, {}, cookies)
  console.log(`Status: ${strat.status}`)
  if (strat.status === 200) {
    console.log(`✅ Strategy: ${strat.json.strategy?.slice(0, 100)}...`)
  }

  // Save strategy if AI failed
  if (strat.status !== 200) {
    const novelId = upload.json.novel?.id
    if (novelId) {
      await req('PATCH', `/api/novels/${novelId}/parsed-content`, {
        key: 'strategy',
        value: '<adaptationStrategy>测试策略</adaptationStrategy>'
      }, cookies)
    }
  }

  // Generate scripts with NEW params (targetDuration, genreStyle, targetPlatform)
  console.log('\n--- Generate scripts (with style params) ---')
  const scripts = await req('POST', `/api/dramas/${dramaId}/generate-scripts`, {
    startEpisode: 1, endEpisode: 2,
    skeleton: '<storySkeleton>测试</storySkeleton>',
    strategy: '<adaptationStrategy>测试</adaptationStrategy>',
    targetDuration: '120s',
    genreStyle: '都市',
    targetPlatform: 'douyin'
  }, cookies)
  console.log(`Status: ${scripts.status}`)
  console.log(`Response: ${JSON.stringify(scripts.json).slice(0, 300)}`)

  // Check script status
  console.log('\n--- Script status ---')
  const status = await req('GET', `/api/dramas/${dramaId}/script-status`, null, cookies)
  console.log(`Episodes: ${status.json.episodes?.length || 0}`)
  
  if (status.json.episodes?.length > 0) {
    // Get first episode to verify scriptContent format
    const epId = status.json.episodes[0].id
    const ep = await req('GET', `/api/episodes/${epId}`, null, cookies)
    console.log(`\n--- Episode 1 details ---`)
    console.log(`scriptStatus: ${ep.json.scriptStatus}`)
    console.log(`scriptContent (first 500 chars): ${(ep.json.scriptContent || '').slice(0, 500)}`)
    console.log(`\nrawContent (first 200 chars): ${(ep.json.rawContent || '').slice(0, 200)}`)
    
    // Verify scriptContent has structured format
    const scriptContent = ep.json.scriptContent || ''
    const hasSceneMarker = scriptContent.includes('【场景') || scriptContent.includes('[场景')
    const hasScriptItem = scriptContent.includes('<scriptItem')
    const hasDialogue = /[角色名]\s*\n\s*（/.test(scriptContent) || scriptContent.includes('（')
    
    console.log(`\n--- Format verification ---`)
    console.log(`Has 【场景 marker: ${hasSceneMarker ? '✅' : '❌'}`)
    console.log(`Has <scriptItem> wrapper: ${hasScriptItem ? '✅' : '❌'}`)
    console.log(`Has dialogue format: ${hasDialogue ? '✅' : '❌'}`)
    
    // Verify rawContent is NOT same as scriptContent (the bug we fixed)
    const rawContent = ep.json.rawContent || ''
    const rawDiffersFromScript = rawContent !== scriptContent
    console.log(`rawContent differs from scriptContent: ${rawDiffersFromScript ? '✅' : '❌'}`)
    if (!rawDiffersFromScript) {
      console.log(`  ⚠️ rawContent === scriptContent (bug not fixed!)`)
    }
  }

  console.log('\n=== Done ===')
  process.exit(0)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
