# AGENTS.md

## 项目概览

本仓库是一个面向自部署场景的数据库备份管理台，采用 Rust workspace 组织。

- 后端：`crates/backup-manager`，基于 Axum 的单体服务，使用 SQLite 保存元数据。
- 前端：`apps/web/`，基于 React、Vite、TypeScript 和 pnpm 的管理界面；生产构建产物由后端服务直接托管。
- 端到端测试：`apps/e2e/`，基于 Playwright，启动真实后端服务并驱动浏览器验证关键流程。
- 部署：`deploy/`，包含 Dockerfile 和 Docker Compose 配置。
- 文档：`docs/`，包含中文产品计划和架构设计文档。

当前服务提供登录、数据库源管理、备份目标管理、定时备份任务、手动触发执行、执行历史和执行日志等能力。

## 目录结构

- `Cargo.toml`：workspace 定义，默认成员是 `crates/backup-manager`。
- `crates/backup-manager/src/main.rs`：应用启动入口，负责 tracing、SQLite 连接池、migrations、调度器、API 路由和静态前端托管。
- `crates/backup-manager/src/config.rs`：基于环境变量的运行配置。
- `crates/backup-manager/src/api.rs`：HTTP API 路由和请求处理。
- `crates/backup-manager/src/domain.rs`：领域类型和 API 入参/出参结构。
- `crates/backup-manager/src/repository.rs`：SQLite 持久化层。
- `crates/backup-manager/src/executor.rs`：备份执行流程。
- `crates/backup-manager/src/scheduler.rs`：定时任务加载和调度。
- `crates/backup-manager/src/adapters/database/`：数据库适配器，例如 MySQL、PostgreSQL。
- `crates/backup-manager/src/adapters/target/`：备份目标适配器，例如 SSH/rsync 目标。
- `crates/backup-manager/migrations/`：SQLx 数据库迁移脚本。
- `apps/web/index.html`：Vite 入口 HTML。
- `apps/web/src/main.tsx`、`apps/web/src/App.tsx`：React 管理界面入口和主应用。
- `apps/web/src/styles.css`：前端全局样式。
- `apps/web/src/components/ui/`：管理界面复用 UI 组件。
- `apps/web/dist/`：前端生产构建产物，由后端服务托管，不应手工编辑。
- `apps/e2e/`：Playwright 端到端测试项目。
- `data/` 和 `backups/`：本地运行时状态目录，已被 git 忽略，不应提交。

## 本地开发

首次本地运行前，复制环境变量文件：

```bash
cp .env.example .env
```

首次访问后端托管页面前，需要先构建前端产物：

```bash
pnpm install
cd apps/web
pnpm build
cd ../..
cargo run -p backup-manager
```

打开 `http://127.0.0.1:8080`，使用 `.env` 中的开发账号登录；未配置时默认账号为：

- 用户名：`admin`
- 密码：`admin123`

代码中的默认监听地址是 `0.0.0.0:8080`。如果本地端口冲突，可在 `.env` 中通过 `BIND_ADDR` 调整。

## 常用命令

运行测试：

```bash
cargo test
```

格式化 Rust 代码：

```bash
cargo fmt
```

运行 Clippy：

```bash
cargo clippy --all-targets --all-features
```

构建 workspace：

```bash
cargo build
```

构建前端：

```bash
cd apps/web
pnpm build
```

运行端到端测试：

```bash
pnpm e2e
```

启动前端开发服务器：

```bash
cd apps/web
pnpm dev
```

使用 Docker Compose 启动：

```bash
cd deploy
docker compose up --build
```

## 配置说明

运行配置会先通过 `dotenvy` 加载 `.env`，再读取进程环境变量。

重要环境变量：

- `BIND_ADDR`：HTTP 监听地址，默认 `0.0.0.0:8080`。
- `DATA_DIR`：元数据目录，默认 `data`。
- `BACKUPS_DIR`：本地备份目录，默认 `backups`。
- `DATABASE_PATH`：SQLite 文件路径，默认 `${DATA_DIR}/backup-manager.db`。
- `ADMIN_USERNAME`：管理员登录用户名，默认 `admin`。
- `ADMIN_PASSWORD`：管理员登录密码，默认 `admin123`。
- `APP_SECRET`：用于加密已保存密钥的密钥材料。保存过真实密钥后，不要随意丢失或更换。

不要提交 `.env`、本地数据库文件，或 `data/`、`backups/` 下的运行时文件。

## 实现约定

- API JSON 字段保持 `camelCase`；领域结构体已使用 `serde(rename_all = "camelCase")`。
- 敏感信息必须加密落库。数据库密码、备份目标密钥等明文信息只应在适配器执行边界按需解密。
- 新增持久化字段时，需要在 `crates/backup-manager/migrations/` 中添加 SQL migration，并同步更新 `domain.rs`、`repository.rs` 和前端界面。
- 新增 API 时，在 `api.rs` 的 `/api` router 下注册路由，并明确认证要求。
- 修改调度器或执行器逻辑时，运行相关单元测试以及 `cargo test`。
- 生产环境由 Rust 二进制通过 `ServeDir` 托管 `apps/web/dist/`；修改前端后需要执行 `cd apps/web && pnpm build` 生成最新产物。
- 前端本地开发可使用 `cd apps/web && pnpm dev`，Vite 会将 `/api` 代理到后端服务。
- 优先保持变更小而聚焦，延续当前单二进制部署模型。

## 验证要求

后端代码变更后，至少运行：

```bash
cargo fmt
cargo test
```

如果变更涉及适配器、调度、执行、仓储查询、数据库迁移或公开 API 行为，还应运行：

```bash
cargo clippy --all-targets --all-features
```

如果变更涉及 UI 或端到端行为，使用 `cargo run -p backup-manager` 启动服务，打开 `http://127.0.0.1:8080`，手动验证受影响流程。

## 文档维护

现有项目文档使用中文。除非任务明确要求其他语言，新增项目文档也应使用中文。

- `docs/01-requirements/数据库备份管理台计划.md`：产品计划和功能范围上下文。
- `docs/02-architecture/数据库备份管理台架构设计.md`：架构和设计上下文。

当行为、部署方式、配置项或运维流程发生变化时，同步更新相关文档。
