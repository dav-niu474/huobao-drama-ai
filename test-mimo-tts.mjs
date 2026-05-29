/**
 * 本地测试 MiMo TTS Adapter
 * 验证请求格式是否正确
 */

// 手动构建与 MiMoTTSAdapter 相同的请求，然后用 fetch 发送
const BASE_URL = 'https://token-plan-sgp.xiaomimimo.com/v1'

// 从环境变量或命令行参数获取 API Key
const API_KEY = process.env.MIMO_API_KEY || process.argv[2] || ''

if (!API_KEY) {
  console.error('❌ 请提供 MiMo API Key:')
  console.error('   MIMO_API_KEY=xxx node test-mimo-tts.mjs')
  console.error('   或: node test-mimo-tts.mjs YOUR_KEY')
  process.exit(1)
}

console.log(`🔑 API Key: ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}`)
console.log(`📡 Base URL: ${BASE_URL}`)

// ── 测试1: 使用 MiMo 官方格式 (api-key 头 + audio 对象 + assistant 含合成文本) ──
async function testWithApiKeyEvent() {
  console.log('\n━━━ 测试1: api-key 认证头 + audio 对象 ━━━')
  
  const body = {
    model: 'mimo-v2.5-tts',
    messages: [
      { role: 'user', content: '请用自然、清晰的语速朗读。' },
      { role: 'assistant', content: '你好，这是一段测试语音。' }
    ],
    audio: {
      format: 'wav',
      voice: 'mimo_default'
    },
    stream: false
  }

  console.log('📤 请求体:')
  console.log(JSON.stringify(body, null, 2))

  try {
    const startTime = Date.now()
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    const elapsed = Date.now() - startTime
    console.log(`⏱️  耗时: ${elapsed}ms`)
    console.log(`📊 状态码: ${res.status}`)
    
    const text = await res.text()
    if (res.ok) {
      const data = JSON.parse(text)
      console.log('✅ 成功！')
      // 检查返回结构
      if (data.choices?.[0]?.message?.audio?.data) {
        console.log(`🔊 音频数据长度: ${data.choices[0].message.audio.data.length} 字符`)
      } else {
        console.log('⚠️  返回结构:', JSON.stringify(data).slice(0, 500))
      }
    } else {
      console.log(`❌ 失败: ${text.slice(0, 300)}`)
    }
  } catch (err) {
    console.log(`❌ 网络错误: ${err.message}`)
  }
}

// ── 测试2: 使用 Authorization: Bearer 头 ──
async function testWithBearerAuth() {
  console.log('\n━━━ 测试2: Authorization Bearer 认证头 + audio 对象 ━━━')
  
  const body = {
    model: 'mimo-v2.5-tts',
    messages: [
      { role: 'user', content: '请用自然、清晰的语速朗读。' },
      { role: 'assistant', content: '你好，这是一段测试语音。' }
    ],
    audio: {
      format: 'wav',
      voice: 'mimo_default'
    },
    stream: false
  }

  try {
    const startTime = Date.now()
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    const elapsed = Date.now() - startTime
    console.log(`⏱️  耗时: ${elapsed}ms`)
    console.log(`📊 状态码: ${res.status}`)
    
    const text = await res.text()
    if (res.ok) {
      console.log('✅ Bearer 认证也有效！')
    } else {
      console.log(`❌ 失败: ${text.slice(0, 300)}`)
    }
  } catch (err) {
    console.log(`❌ 网络错误: ${err.message}`)
  }
}

// ── 测试3: 旧格式（没有 audio 对象，assistant 内容为空）──
async function testOldFormat() {
  console.log('\n━━━ 测试3: 旧格式（无 audio 对象，assistant 空） ━━━')
  
  const body = {
    model: 'mimo-v2.5-tts',
    messages: [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '' }
    ],
    stream: false
  }

  console.log('📤 请求体:')
  console.log(JSON.stringify(body, null, 2))

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    console.log(`📊 状态码: ${res.status}`)
    const text = await res.text()
    console.log(`📝 响应: ${text.slice(0, 300)}`)
  } catch (err) {
    console.log(`❌ 网络错误: ${err.message}`)
  }
}

// 运行所有测试
async function main() {
  await testWithApiKeyEvent()
  await testWithBearerAuth()
  await testOldFormat()
  console.log('\n✅ 所有测试完成')
}

main()
