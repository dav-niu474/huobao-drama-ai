---
Task ID: 1
Agent: Main Agent
Task: 修复Vercel登录崩溃 — Prisma schema与PostgreSQL不匹配

Work Log:
- 排查发现 Vercel 上 Prisma schema 提交为 sqlite，但数据库连接是 PostgreSQL（Supabase）
- curl 测试 /api/auth/login 返回 "URL must start with protocol file:" 错误
- 根因：prisma/schema.prisma 的 provider="sqlite" 在 Vercel 构建时未正确切换为 PostgreSQL
- 修复：将 schema.prisma 提交为 PostgreSQL（生产源），pre-dev.js 本地切换为 SQLite
- 修复：移除 relationMode="prisma"（与 Comment 自关联 NoAction 冲突）
- 修复：Comment 自关联改为 SetNull + NoAction
- 修复：build.js 不再每次部署强制重置 admin 密码（只创建不存在的 admin）
- 修复：postinstall.js 增加数据库类型检测
- 创建 PR #67 并合入 main
- Vercel 重新部署后验证：登录、注册、CSRF 全部正常

Stage Summary:
- PR #67 已合入，Vercel 部署成功
- admin@huobao.com / admin123 可以正常登录
- 新用户注册正常
- GitHub 没有开放的 PR
- 数据库资源未被破坏（prisma db push 只添加新表/列）
