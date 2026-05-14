# 数据库备份管理台

面向自部署场景的数据库备份 Web 管理台。第一版采用 Rust 单体服务，内置 React 静态管理台、HTTP API、SQLite 元数据库、任务调度、备份执行器、MySQL/PostgreSQL 数据库适配器和 SSH/rsync 备份目标适配器。

## 本地运行

首次本地开发可以复制一份环境变量文件：

```bash
cp .env.example .env
```

本地需要先准备 Rust 工具链和 pnpm。前端静态资源由 Rust 服务托管，因此直接访问 `http://127.0.0.1:8080` 前，需要先生成 `web/dist/`：

```bash
cd web
pnpm install
pnpm build
cd ..
cargo run -p backup-manager
```

打开 `http://127.0.0.1:8080`，使用 `admin / admin123` 登录。

后续如果前端依赖没有变化，可以省略 `pnpm install`，只重新执行：

```bash
cd web
pnpm build
cd ..
cargo run -p backup-manager
```

## 前端开发

前端使用 React、Vite、TypeScript 和 pnpm。开发 UI 时可以启动 Vite 开发服务器：

```bash
cd web
pnpm install
pnpm dev
```

开发服务器会把 `/api` 代理到 `http://127.0.0.1:8080`，因此联调时需要另开一个终端启动后端：

```bash
cargo run -p backup-manager
```

Vite 页面默认访问 `http://127.0.0.1:5173`。生产运行和 Docker 运行时不启动 Vite，Rust 服务只托管 `web/dist/` 下的构建产物。

## Docker Compose

```bash
cd deploy
docker compose up --build
```

Docker 构建会自动执行前端 `pnpm install --frozen-lockfile` 和 `pnpm build`，不需要在宿主机提前构建 `web/dist/`。

生产环境请修改 `APP_SECRET`、`ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，并妥善保存 `APP_SECRET`。
