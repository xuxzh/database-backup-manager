# 数据库备份管理台

面向自部署场景的数据库备份 Web 管理台。第一版采用 Rust 单体服务，内置静态管理台、HTTP API、SQLite 元数据库、任务调度、备份执行器、MySQL/PostgreSQL 数据库适配器和 SSH/rsync 备份目标适配器。

## 本地运行

首次本地开发可以复制一份环境变量文件：

```bash
cp .env.example .env
```

之后直接运行：

```bash
cargo run -p backup-manager
```

打开 `http://127.0.0.1:8080`，使用 `admin / admin123` 登录。

## Docker Compose

```bash
cd deploy
docker compose up --build
```

生产环境请修改 `APP_SECRET`、`ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，并妥善保存 `APP_SECRET`。
