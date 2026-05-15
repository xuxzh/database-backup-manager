# 数据库备份管理台

面向自部署场景的数据库备份 Web 管理台。第一版采用 Rust 单体服务，内置 React 静态管理台、HTTP API、SQLite 元数据库、任务调度、备份执行器、MySQL/PostgreSQL 数据库适配器和 SSH/rsync 备份目标适配器。

## 本地运行

首次本地开发可以复制一份环境变量文件：

```bash
cp .env.example .env
```

本地需要先准备 Rust 工具链、pnpm、数据库客户端工具、`openssh-client`、`rsync`。如果备份目标使用 SSH 密码认证，还需要安装 `sshpass`。前端静态资源由 Rust 服务托管，因此直接访问 `http://127.0.0.1:8080` 前，需要先生成 `web/dist/`：

```bash
pnpm -C web install
make run
```

打开 `http://127.0.0.1:8080`，使用 `admin / admin123` 登录。

后续如果前端依赖没有变化，可以省略 `pnpm -C web install`，只重新执行：

```bash
make run
```

`make run` 会先执行 `pnpm -C web build`，再执行 `cargo run -p backup-manager`。

## 前端开发

前端使用 React、Vite、TypeScript 和 pnpm。开发 UI 时可以启动 Vite 开发服务器：

```bash
pnpm -C web install
make dev
```

`make dev` 会并行启动后端和 Vite 开发服务器。开发服务器会把 `/api` 代理到 `http://127.0.0.1:8080`。

如果希望分开查看前后端日志，也可以使用两个终端分别运行：

```bash
make dev-backend
make dev-web
```

Vite 页面默认访问 `http://127.0.0.1:5173`。生产运行和 Docker 运行时不启动 Vite，Rust 服务只托管 `web/dist/` 下的构建产物。

常用 Makefile 命令：

```bash
make help       # 查看可用命令
make run        # 构建前端产物并启动后端服务
make dev        # 并行启动后端和 Vite 开发服务
make build      # 构建前端产物和 Rust workspace
make test       # 运行 Rust 测试和前端测试
make fmt        # 格式化 Rust 代码
make clippy     # 运行 Rust Clippy 检查
make docker-up  # 使用 Docker Compose 启动
```

## Docker Compose

```bash
make docker-up
```

Docker 构建会自动执行前端 `pnpm install --frozen-lockfile` 和 `pnpm build`，不需要在宿主机提前构建 `web/dist/`。

生产环境请修改 `APP_SECRET`、`ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，并妥善保存 `APP_SECRET`。
