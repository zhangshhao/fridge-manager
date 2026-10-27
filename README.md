# 冰箱管家

React + TypeScript + Ant Design Mobile PWA，Fastify API，Prisma + PostgreSQL。简体中文，家庭时区 Asia/Shanghai，邀请制，每个家庭一个冰箱、最多 5 位成员。

## 本机开始

需要 Node.js 24 LTS。本机可用附带的 PostgreSQL 18 二进制，不需要预装 Docker。首次依赖安装需要联网。

```powershell
npm ci
npm run db:generate
npm run dev:local
```

打开 <http://localhost:5173>。本机演示账号 `fridge`，密码 `FreshKitchen2026!`；内含 12 种测试食材。演示脚本只允许在本机非生产环境执行，不覆盖已有账号。可在“我的 → 修改密码”更换密码。

`dev:local` 会准备 `.env`、后台启动本机数据库、迁移、创建演示数据，然后运行前后端。数据库目录 `.local/postgres` 持久保存且被 Git 忽略。停止前后端用 Ctrl+C；停止数据库可运行 `node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe -D .local/postgres -m fast stop`。

也可以分开启动：

```powershell
Copy-Item .env.example .env
npm run db:local  # 窗口 1，保持运行
npm run db:migrate
npm run demo:seed
npm run dev       # 窗口 2
```

实际使用请创建自己的管理员，不用演示账号：

```powershell
$env:ADMIN_USERNAME='your_admin'
$env:ADMIN_PASSWORD='替换为自己的长密码'
$env:FAMILY_NAME='我们的家'
npm run admin:create
Remove-Item Env:ADMIN_PASSWORD
```

## 功能

- 独立批次入库、食材别名、搜索、区域和分类、临期状态、零库存隐藏、归档。
- 手动取用、丢弃、盘点和流水，十进制字符串、定点小数、克/千克与毫升/升换算。
- 整餐多道菜、实际用量、指定批次、未入库食材、日历、修改、撤销、再做一次和审计历史。
- 家庭行锁串行校验、单事务保存与扣减、幂等操作编号、记录版本冲突和有限重试。
- Argon2id、服务端会话、同源来源检查、家庭权限、一次性邀请、成员移除即时失权。
- 百炼兼容 API、输出校验、忌口过滤、每日限额、5 分钟家庭缓存、超时与并发限制。
- 内置 331 道 HowToCook 开源菜谱，根据库存、别名、临期、忌口和时间筛选推荐；无需 AI 密钥，支持搜索、分类、分页和食材齐全筛选。
- PWA 外壳缓存、API 不缓存、离线状态、安装说明和手动更新提示。

## AI 配置

“今天吃什么”默认使用本地菜谱库，无需配置 AI。选菜后填写实际用量再记餐，不会根据原文的“适量”自动扣库存。菜谱来源、许可及重建方式见 [本地菜谱数据说明](apps/api/src/data/README.md)。

如需使用可选的“AI 灵感”，在被忽略的 `.env` 中填写 `AI_API_KEY`，按账号实际可用型号配置 `AI_MODEL`、`AI_BASE_URL`。重启 API 后生效。未设置密钥时明确显示不可用，本地菜谱、库存和手动记录不受影响。

## 验证

保持本机数据库启动，然后执行：

```powershell
npm run typecheck
npm test
npx playwright install chromium
npm run build
npm run test:e2e
```

请先 `npm run build` 再跑端到端测试，其中 PWA 场景访问生产构建预览。集成测试只使用数据库名以 `_test` 结尾的独立数据库，会清理该测试数据库中的业务数据。端到端测试在开发数据库创建独立测试家庭并在结束时删除，覆盖桌面和手机尺寸 Chromium。生产库禁止用来测试。

## 交付文档

- [执行与验收记录](docs/验收记录.md)
- [使用说明](docs/使用说明.md)
- [部署、备份恢复与维护](docs/部署运维.md)
- [业务规则与接口](docs/业务与接口.md)

生产发布仍需服务器、HTTPS 域名、实际模型账号、异机备份和目标手机验收。本机模拟手机浏览器不等于真机安装验收。Docker 配置需要在实际 Docker 主机验证。
