# 🎬 Git 版本迭代管理工作流

> **项目**: AI短剧创作平台 (huobao-drama-ai)  
> **制定日期**: 2026-05-20  
> **适用范围**: 所有开发迭代、Bug修复、紧急热修复  
> **核心原则**: **禁止直接推送 main 分支，所有变更必须通过分支 → PR → 审核 → 合并流程**

---

## 一、分支策略

### 1.1 分支类型

| 分支前缀 | 用途 | 命名规范 | 示例 | 生命周期 |
|----------|------|----------|------|----------|
| `feat/` | 新功能开发 | `feat/<版本>-<功能简述>` | `feat/v06-file-storage` | 开发完成后删除 |
| `fix/` | Bug修复 | `fix/<问题简述>` | `fix/white-screen-settings` | 合并后删除 |
| `hotfix/` | 紧急生产修复 | `hotfix/<问题简述>` | `hotfix/auth-crash` | 合并后删除 |
| `release/` | 发布准备 | `release/v<版本号>` | `release/v0.6.0` | 发布后删除 |
| `exp/` | 实验性功能 | `exp/<实验简述>` | `exp/new-ui-layout` | 实验完成/废弃后删除 |

### 1.2 分支关系图

```
main (受保护，生产部署)
  │
  ├── feat/v06-file-storage ──────┐
  │                                │ PR → 审核 → Squash Merge
  ├── feat/v06-gen-history ───────┤
  │                                │
  ├── fix/pipeline-step-bug ──────┤
  │                                │
  └── release/v0.7.0 ─────────────┘ (汇总多个feat后发布)
                                    │
                              ┌─────┴─────┐
                              │  v0.7.0   │ Git Tag
                              │  Release  │ GitHub Release
                              └───────────┘

hotfix/main-crash ──→ 直接从 main 拉出，修完紧急合入并打 tag
```

### 1.3 分支保护规则（main 分支）

| 规则 | 配置 | 说明 |
|------|------|------|
| 禁止直接推送 | ✅ | 包括管理员在内，必须走 PR |
| PR 必须审核 | ✅ (1人) | 单人开发时自审，强制走流程 |
| 通过状态检查 | ✅ | CI lint + type-check + build |
| 分支最新 | ✅ | PR 必须基于最新 main |
| 禁止强制推送 | ✅ | 保护历史不被覆盖 |
| Squash Merge | ✅ | 保持 main 历史整洁 |

---

## 二、开发工作流

### 2.1 完整流程（12步）

```
┌─────────────────────────────────────────────────────────┐
│  1. 从 main 拉取最新代码                                  │
│  2. 创建迭代分支 (feat/fix/hotfix)                        │
│  3. 在分支上开发 + 本地验证                                │
│  4. 提交代码 (Conventional Commits 规范)                   │
│  5. 推送分支到 GitHub                                      │
│  6. Vercel 自动创建 Preview 部署                           │
│  7. 在 Preview 环境验证功能                                │
│  8. 创建 Pull Request → 填写 PR 模板                       │
│  9. CI 自动检查 (lint + type-check + build)                │
│ 10. 自审代码变更 (Self-Review)                             │
│ 11. Squash Merge 到 main                                  │
│ 12. Vercel 自动部署到 Production + 打 Tag                  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 详细步骤

#### Step 1: 同步本地

```bash
git checkout main
git pull origin main
```

#### Step 2: 创建分支

```bash
# 新功能
git checkout -b feat/v06-file-storage

# Bug修复
git checkout -b fix/white-screen-settings

# 紧急修复
git checkout -b hotfix/auth-crash
```

#### Step 3: 开发 + 本地验证

```bash
# 开发过程中定期验证
npm run db:push    # 同步 Schema
npm run dev        # 启动开发服务器
npm run lint       # 代码检查
npm run build      # 构建验证
```

#### Step 4: 提交代码

```bash
# 遵循 Conventional Commits 规范
git add .
git commit -m "feat(storage): implement local file storage to replace data URLs"
```

#### Step 5: 推送分支

```bash
git push origin feat/v06-file-storage
```

#### Step 6-7: Preview 验证

推送后 Vercel 自动创建 Preview 部署，在 PR 页面或 Vercel Dashboard 查看 URL：
- 格式: `huobao-drama-ai-git-feat-v06-file-storage-<hash>.vercel.app`
- 在 Preview 环境完整测试功能

#### Step 8: 创建 PR

在 GitHub 上创建 Pull Request，填写以下模板：

```markdown
## 变更说明
<!-- 简要描述本次变更 -->

## 变更类型
- [ ] 新功能 (feat)
- [ ] Bug修复 (fix)  
- [ ] 紧急修复 (hotfix)
- [ ] 重构 (refactor)
- [ ] 文档 (docs)

## 影响范围
<!-- 列出影响的模块/文件 -->

## 测试验证
- [ ] 本地 `npm run dev` 验证通过
- [ ] 本地 `npm run build` 构建通过
- [ ] Preview 环境验证通过
- [ ] 数据库变更已同步 (如有)

## 截图/录屏
<!-- 附上关键UI变更的截图 -->

## Checklist
- [ ] 代码遵循项目规范
- [ ] 没有引入新的 lint 警告
- [ ] 数据库变更已考虑兼容性
```

#### Step 9: CI 检查

GitHub Actions 自动运行：
- ESLint 检查
- TypeScript 类型检查
- Next.js 构建验证

#### Step 10: 自审

单人开发的自审方法：
1. 在 PR 页面逐文件 Review 自己的 diff
2. 检查是否有调试代码残留
3. 检查是否有敏感信息泄露
4. 检查是否有未处理的 TODO
5. 确认 CI 全部通过

#### Step 11: 合并

```bash
# 在 GitHub 上点击 "Squash and Merge"
# 或使用 CLI:
gh pr merge <PR号> --squash --delete-branch
```

#### Step 12: 发布

```bash
# 合并到 main 后，打版本标签
git checkout main
git pull origin main
git tag -a v0.6.1 -m "feat: local file storage + gen history tracking"
git push origin v0.6.1
```

### 2.3 Commit 规范 (Conventional Commits)

格式: `<type>(<scope>): <description>`

#### Type 类型

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(storage): add local file upload API` |
| `fix` | Bug修复 | `fix(auth): resolve white screen on settings page` |
| `hotfix` | 紧急修复 | `hotfix(api): fix crash when model not found` |
| `refactor` | 重构 | `refactor(episode): simplify workspace state management` |
| `docs` | 文档 | `docs: update README with v0.6 features` |
| `style` | 样式 | `style(ui): adjust button spacing` |
| `perf` | 性能 | `perf(image): optimize grid image splitting` |
| `test` | 测试 | `test(api): add compose route tests` |
| `chore` | 杂务 | `chore: update dependencies` |

#### Scope 范围

| Scope | 模块 |
|-------|------|
| `storage` | 文件存储 |
| `auth` | 认证/权限 |
| `ai` | AI 供应商/模型 |
| `episode` | 剧集工作台 |
| `storyboard` | 分镜编辑 |
| `voice` | 配音/TTS |
| `video` | 视频生成/合成 |
| `grid` | 宫格图系统 |
| `ffmpeg` | FFmpeg 合成 |
| `pipeline` | 制作流水线 |
| `settings` | 设置页面 |
| `ui` | 通用UI组件 |
| `db` | 数据库/Schema |
| `api` | API路由 |
| `deploy` | 部署相关 |

---

## 三、Vercel 部署策略

### 3.1 双环境架构

```
┌──────────────────────────────────────────────┐
│                Vercel Project                 │
│                                              │
│  Production Branch: main                     │
│  ┌─────────────────────────────────┐         │
│  │  huobao-drama-ai.vercel.app     │ ← 生产  │
│  │  (PostgreSQL + 全部环境变量)      │         │
│  └─────────────────────────────────┘         │
│                                              │
│  Preview Branches: feat/*, fix/*, hotfix/*   │
│  ┌─────────────────────────────────┐         │
│  │  huobao-drama-ai-git-feat-...   │ ← 测试  │
│  │  (PostgreSQL + 全部环境变量)      │         │
│  └─────────────────────────────────┘         │
│                                              │
└──────────────────────────────────────────────┘
```

### 3.2 环境变量管理

| 变量 | Production | Preview | 说明 |
|------|:----------:|:-------:|------|
| `DATABASE_URL` | ✅ PostgreSQL | ✅ 同一数据库 | 开发期共享 |
| `AUTH_TRUST_HOST` | ✅ | ✅ | 两者都需要 |
| `NEXTAUTH_SECRET` | ✅ | ✅ | 两者共用 |
| `NEXTAUTH_URL` | ✅ 生产域名 | ✅ Preview域名 | 自动处理 |
| AI Provider Keys | ✅ | ✅ | 两者共用 |

> **当前策略**: Preview 与 Production 共享同一 PostgreSQL 数据库。  
> **未来升级**: 当团队扩大或需要数据隔离时，可为 Preview 配置独立数据库。

### 3.3 Preview 验证流程

```
1. 推送分支 → Vercel 自动创建 Preview 部署
2. 获取 Preview URL (PR 页面评论 / Vercel Dashboard)
3. 在 Preview 环境验证:
   ├── 功能是否正常工作
   ├── UI 是否符合预期
   ├── API 是否正确响应
   ├── 数据库操作是否正常
   └── 没有引入回归问题
4. 验证通过 → 创建 PR → 等待 CI → 合并
5. 验证失败 → 在分支上修复 → 重新推送 → 重新验证
```

### 3.4 Vercel 忽略构建（可选）

对于纯文档变更或实验分支，可在 commit 中加入 `[skip vercel]` 跳过部署：

```bash
git commit -m "docs: update workflow doc [skip vercel]"
```

---

## 四、版本管理

### 4.1 语义化版本 (SemVer)

格式: `v<major>.<minor>.<patch>`

| 版本段 | 含义 | 何时递增 |
|--------|------|----------|
| `major` | 重大版本 | v1.0 正式发布、架构大改 |
| `minor` | 功能版本 | 新功能迭代完成 (如 v0.6→v0.7) |
| `patch` | 修复版本 | Bug修复、小优化 (如 v0.6.1) |

### 4.2 当前版本里程碑

| 版本 | 目标 | 预计 |
|------|------|------|
| `v0.6.0` | 体验打磨完成 (文件存储+历史追踪+进度优化) | 当前 |
| `v0.6.1` | Patch修复 | 按需 |
| `v0.7.0` | 发布上线准备 | v0.6 稳定后 |
| `v1.0.0` | 正式发布 | 功能完备+稳定运行 |

### 4.3 Git Tag 操作

```bash
# 创建标签
git tag -a v0.6.0 -m "feat: v0.6 - local file storage, generation history, progress optimization"

# 推送标签
git push origin v0.6.0

# 推送所有标签
git push origin --tags

# 查看标签
git tag -l

# 查看标签详情
git show v0.6.0

# 删除标签 (慎重)
git tag -d v0.6.0
git push origin :refs/tags/v0.6.0
```

### 4.4 CHANGELOG 维护

每次版本发布时更新 `CHANGELOG.md`，格式遵循 [Keep a Changelog](https://keepachangelog.com/)：

```markdown
## [0.6.0] - 2026-05-20

### Added
- 本地文件存储优化（替代 DataURL）
- 图片/视频生成历史追踪
- 批量操作进度条优化

### Changed
- 集级 AI 配置锁定 UI 优化

### Fixed
- 修复宫格图分割后部分单元格空白问题
```

---

## 五、GitHub 分支保护配置

### 5.1 通过 API 配置

```bash
# 使用 GitHub API 设置 main 分支保护
curl -X PUT \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/dav-niu474/huobao-drama-ai/branches/main/protection \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": ["CI / lint", "CI / type-check", "CI / build"]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": false,
      "required_approving_review_count": 1
    },
    "restrictions": null
  }'
```

### 5.2 保护规则详解

| 规则 | 值 | 说明 |
|------|---|------|
| `strict` | `true` | PR 必须基于最新 main |
| `enforce_admins` | `true` | 管理员也受约束（核心！） |
| `required_approving_review_count` | `1` | 至少1人审核 |
| `dismiss_stale_reviews` | `true` | 新推送后旧审核失效 |

### 5.3 Web 界面配置（备选）

1. 打开 https://github.com/dav-niu474/huobao-drama-ai/settings/branches
2. Branch protection rules → Add rule
3. Branch name pattern: `main`
4. 勾选:
   - ☑ Require a pull request before merging (1 approval)
   - ☑ Dismiss stale pull request approvals when new commits are pushed
   - ☑ Require status checks to pass before merging
   - ☑ Require branches to be up to date before merging
   - ☑ Require conversation resolution before merging
   - ☑ Do not allow force pushes
   - ☑ Do not allow deletions

---

## 六、Prisma 迁移策略

### 6.1 双阶段策略

| 阶段 | 版本范围 | 策略 | 命令 |
|------|----------|------|------|
| 开发期 | v0.x | `db push` (开发优先) | `npx prisma db push` |
| 稳定期 | v1.0+ | `migrate dev` (可控优先) | `npx prisma migrate dev` |

### 6.2 Schema 变更安全等级

| 等级 | 操作 | 风险 | 示例 |
|------|------|------|------|
| 🟢 安全 | 新增字段(可选) | 无 | 添加 `description` 字段 |
| 🟢 安全 | 新增模型 | 无 | 添加 `VideoGeneration` 模型 |
| 🟡 注意 | 新增字段(必填) | 需默认值 | 添加 `status` 字段需设默认值 |
| 🟡 注意 | 修改字段类型 | 可能丢数据 | `Int` → `String` |
| 🔴 危险 | 删除字段 | 丢数据 | 删除 `oldField` |
| 🔴 危险 | 重命名字段 | 丢数据 | `name` → `title` |

### 6.3 分支中处理 Schema 变更

```bash
# 在功能分支上修改 Schema 后
npx prisma db push     # 同步到本地 SQLite
npm run dev            # 验证功能正常
npm run build          # 验证构建通过

# 合并 PR 后，Vercel 部署时自动执行 db push
# (通过 api/migrate 和 postinstall 脚本)
```

---

## 七、自动化配置

### 7.1 GitHub Actions 工作流

| 工作流 | 触发条件 | 功能 |
|--------|----------|------|
| `ci.yml` | PR 到 main | lint + type-check + build |
| `release.yml` | 推送 tag `v*` | 创建 GitHub Release |
| `cleanup.yml` | PR 关闭 | 删除远端功能分支 |

### 7.2 自动化矩阵

```
Push to feat/*    → Vercel Preview 部署
PR to main        → CI 检查 + Preview URL 评论
Merge to main     → Vercel Production 部署
Push tag v*       → GitHub Release 创建
PR 关闭           → 远端分支自动删除
```

---

## 八、紧急热修复流程

当生产环境出现紧急问题，需要跳过常规迭代流程：

```bash
# 1. 从 main 拉取最新代码
git checkout main
git pull origin main

# 2. 创建热修复分支
git checkout -b hotfix/auth-crash

# 3. 修复 + 验证
# ... 修改代码 ...
npm run build

# 4. 快速推送 + PR
git add .
git commit -m "hotfix(auth): fix crash when session expired"
git push origin hotfix/auth-crash

# 5. 创建 PR，标题加 [HOTFIX] 前缀
# 6. 自审 + 立即合并
# 7. 打 patch tag
git tag -a v0.6.1 -m "hotfix: fix auth crash"
git push origin v0.6.1
```

---

## 九、日常操作速查

### 创建新迭代

```bash
git checkout main && git pull
git checkout -b feat/v06-<功能名>
# ... 开发 ...
git add . && git commit -m "feat(scope): description"
git push origin feat/v06-<功能名>
# → GitHub 创建 PR → Preview 验证 → 自审 → 合并
```

### 同步主分支到功能分支

```bash
# 在功能分支上
git fetch origin
git rebase origin/main
# 解决冲突后
git push origin feat/v06-<功能名> --force-with-lease
```

### 放弃功能分支

```bash
git checkout main
git branch -D feat/v06-abandoned
git push origin --delete feat/v06-abandoned
```

---

## 十、流程检查清单

每次迭代完成前，确认以下事项：

- [ ] 代码通过 `npm run lint`
- [ ] 代码通过 `npm run build`
- [ ] 本地 `npm run dev` 功能验证
- [ ] Preview 环境验证通过
- [ ] 无调试代码残留 (`console.log`, `debugger`)
- [ ] 无敏感信息泄露 (API Key, Token)
- [ ] Schema 变更已考虑兼容性
- [ ] PR 模板已完整填写
- [ ] CI 检查全部通过
- [ ] 自审完成，无遗留问题
