/**
 * E2E test data seed — drama with 3 episode final cuts (real tiny MP4s)
 * + E1 scriptContent so the extractor agent can be exercised in the browser.
 * Run: bun scripts/seed-e2e-drama.ts
 */
import { execSync } from 'child_process'
import { mkdirSync, copyFileSync, existsSync } from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'

const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient()

const TMP = '/tmp/e2e-seed'
const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads')

async function main() {
  // 1. Ensure admin user
  const hashed = await bcrypt.hash('admin123', 12)
  const admin = await db.user.upsert({
    where: { email: 'admin@huobao.com' },
    update: { role: 'admin' },
    create: { email: 'admin@huobao.com', name: '管理员', password: hashed, role: 'admin' },
  })

  // 2. Create drama
  const drama = await db.drama.create({
    data: {
      title: 'E2E整剧验证',
      description: '浏览器端到端验证用数据',
      genre: '都市',
      style: 'realistic',
      status: 'active',
      userId: admin.id,
      totalEpisodes: 3,
    },
  })

  // 3. Generate 3 tiny mp4s (identical codec/dims for concat) and copy into storage
  mkdirSync(TMP, { recursive: true })
  const colors = ['red', 'green', 'blue']
  for (let i = 1; i <= 3; i++) {
    const out = path.join(TMP, `ep${i}.mp4`)
    if (!existsSync(out)) {
      execSync(
        `ffmpeg -y -f lavfi -i "testsrc=size=640x360:rate=30:duration=3,hue=h=${(i - 1) * 120}" ` +
        `-f lavfi -i "anullsrc=r=44100:cl=stereo" -t 3 ` +
        `-c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv420p -c:a aac -b:a 96k -shortest "${out}"`
      )
    }
    const dir = path.join(UPLOAD_DIR, 'dramas', drama.id, 'merged')
    mkdirSync(dir, { recursive: true })
    const dest = path.join(dir, `episode_E${i}.mp4`)
    copyFileSync(out, dest)
    await db.episode.create({
      data: {
        dramaId: drama.id,
        episodeNumber: i,
        title: `第${i}集 测试`,
        scriptStatus: 'completed',
        status: 'completed',
        videoUrl: `/api/files/dramas/${drama.id}/merged/episode_E${i}.mp4`,
        duration: 3,
        ...(i === 1
          ? {
              scriptContent:
                '第1场 内景 咖啡馆 日\n林逸坐在靠窗的位置，手里握着一杯凉透的咖啡。林逸：这个项目要是黄了，我们所有人都要失业。\n白有容推门而入，神色凝重。白有容：刚接到消息，投资人撤资了。\n林逸猛地站起，咖啡洒在桌上。林逸：什么？怎么可能！\n第2场 内景 公司会议室 夜\n白板上的数据触目惊心。林逸盯着屏幕，拳头握紧。林逸：给我三天时间，我一定找到新的投资人。',
            }
          : {}),
      },
    })
  }

  console.log('[seed-e2e] Drama created:', drama.id)
  console.log('[seed-e2e] 3 episodes with real MP4 final cuts')
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
