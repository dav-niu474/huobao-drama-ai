/**
 * 端到端测试 MiMo TTS 连接
 * 模拟 test-connection API 的完整流程
 * 用法: MIMO_API_KEY=xxx node test-mimo-tts-e2e.mjs
 */

const API_KEY = process.env.MIMO_API_KEY || ''

if (!API_KEY) {
  console.error('❌ 请提供 MiMo API Key:')
  console.error('   MIMO_API_KEY=xxx node test-mimo-tts-e2e.mjs')
  process.exit(1)
}

// ── 模拟 MiMoTTSAdapter.buildGenerateRequest ──
function buildRequest(config, params) {
  const model = config.model || 'mimo-v2.5-tts'
  const voiceId = params.voiceId || 'mimo_default'
  const messages = [
    { role: 'user', content: '请用自然、清晰的语速朗读。' },
    { role: 'assistant', content: params.text }
  ]
  return {
    url: config.baseUrl.replace(/\/$/, '') + '/chat/completions',
    method: 'POST',
    headers: {
      'api-key': config.apiKey,
      'Content-Type': 'application/json'
    },
    body: {
      model,
      messages,
      audio: { format: 'wav', voice: voiceId },
      stream: false
    }
  }
}

// ── 模拟 MiMoTTSAdapter.parseResponse ──
function parseResponse(result) {
  const resp = result
  const choices = resp.choices
  if (choices && choices.length > 0) {
    const message = choices[0].message
    if (message) {
      const audio = message.audio
      if (audio && typeof audio === 'object') {
        const audioData = audio.data
        if (audioData) {
          return { audioBase64: audioData, format: 'wav', sampleRate: 24000 }
        }
      }
      if (audio && typeof audio === 'string') {
        return { audioBase64: audio, format: 'wav', sampleRate: 24000 }
      }
      const content = message.content
      if (content && /^[A-Za-z0-9+/=]+$/.test(content) && content.length > 100) {
        return { audioBase64: content, format: 'wav', sampleRate: 24000 }
      }
    }
  }
  return { format: 'wav' }
}

async function main() {
  console.log('🔑 API Key: ' + API_KEY.slice(0, 8) + '...' + API_KEY.slice(-4))
  
  const config = {
    baseUrl: 'https://token-plan-sgp.xiaomimimo.com/v1',
    apiKey: API_KEY,
    model: 'mimo-v2.5-tts'
  }
  
  // 模拟 test-connection/route.ts 的 TTS 测试流程
  const params = { text: '你好', voiceId: undefined, speed: 1.0 }
  const req = buildRequest(config, params)
  
  console.log('\n📤 请求详情:')
  console.log('  URL:', req.url)
  console.log('  Headers:', JSON.stringify(req.headers))
  console.log('  Body:', JSON.stringify(req.body, null, 2))
  
  console.log('\n🔄 发送请求...')
  const startTime = Date.now()
  
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(req.body)
    })
    const elapsed = Date.now() - startTime
    
    console.log(`⏱️  耗时: ${elapsed}ms`)
    console.log(`📊 HTTP 状态: ${res.status}`)
    
    if (!res.ok) {
      const text = await res.text()
      console.log(`❌ TTS API 返回 ${res.status}: ${text.slice(0, 300)}`)
      
      if (res.status === 400) {
        console.log('\n⚠️  400 错误 = 请求格式有问题')
        console.log('   这意味着 MiMoTTSAdapter 的请求格式仍然不对！')
      } else if (res.status === 401) {
        console.log('\n⚠️  401 错误 = API Key 无效（但请求格式正确）')
      }
      process.exit(1)
    }
    
    const contentType = res.headers.get('content-type') || ''
    console.log('📋 Content-Type:', contentType)
    
    if (contentType.includes('application/json')) {
      const jsonResult = await res.json()
      console.log('\n📥 JSON 响应 (前500字符):')
      console.log(JSON.stringify(jsonResult, null, 2).slice(0, 500))
      
      const parsed = parseResponse(jsonResult)
      console.log('\n🔊 解析结果:')
      console.log('  格式:', parsed.format)
      console.log('  采样率:', parsed.sampleRate)
      console.log('  有音频数据:', !!parsed.audioBase64)
      if (parsed.audioBase64) {
        console.log('  数据长度:', parsed.audioBase64.length, '字符')
        console.log('  ✅ MiMo TTS 连接测试成功！')
      } else {
        console.log('  ⚠️  没有解析到音频数据')
      }
    } else {
      const buffer = Buffer.from(await res.arrayBuffer())
      console.log(`\n🔊 二进制响应，大小: ${(buffer.length / 1024).toFixed(1)}KB`)
      if (buffer.length > 100) {
        console.log('  ✅ MiMo TTS 连接测试成功！')
      }
    }
  } catch (err) {
    console.log(`❌ 请求失败: ${err.message}`)
    process.exit(1)
  }
}

main()
