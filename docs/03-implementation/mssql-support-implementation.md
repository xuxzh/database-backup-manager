# MSSQL 支持实施文档

## 目标

为数据库备份管理台增加 SQL Server 数据源支持。整体能力分两个阶段交付：第一阶段以 `sqlpackage` 导出 `.bacpac` 文件为主，接入现有本地/SSH 远端执行模型；第二阶段再评估 SQL Server 原生 `.bak` 备份能力。

## 第一阶段：`.bacpac` 导出支持

第一阶段目标是让用户可以在管理台中创建 SQL Server 数据源、测试连接、选择数据库，并通过备份任务生成 `.bacpac.gz` 归档文件。

### 范围

- 新增数据库类型 `mssql`，展示名称为 `SQL Server`。
- 默认端口为 `1433`。
- 本地连接测试使用 `sqlcmd`。
- 本地数据库列表查询使用 `sqlcmd` 查询 `sys.databases`。
- 本地备份导出使用 `sqlpackage /Action:Export` 生成 `.bacpac` 文件。
- 远端 SSH 执行模式下，默认在远端使用 `sqlpackage`，将导出内容写入远端临时文件后通过 `cat` 回传到管理台本机。
- 支持通过环境变量覆盖本地工具路径：
  - `SQLCMD_PATH`
  - `SQLPACKAGE_PATH`
- 支持通过现有“远端工具路径”字段覆盖远端 `sqlpackage` 路径。
- 备份归档沿用现有 gzip、checksum、manifest、上传和验证流程。
- 前端数据源表单增加 SQL Server 选项和默认端口。
- 更新部署/故障排查文档中的客户端工具依赖说明。

### 不在第一阶段范围内

- 不实现原生 `.bak` 文件备份。
- 不新增 SQL Server 特有高级选项，例如加密连接、证书信任、实例名、Windows 身份认证。
- 不实现自动安装 SQL Server 客户端工具。
- 不改变现有备份目标、调度、保留策略和权限模型。

### 后端设计

在 `crates/backup-manager/src/adapters/database/mod.rs` 中新增 `MssqlAdapter`，并注册到 `DatabaseRegistry::with_defaults()`。适配器负责：

- `db_type()` 返回 `mssql`。
- `config_schema()` 复用公共连接字段，默认端口 `1433`。
- `test_connection()`：
  - 本地模式执行 `sqlcmd -S host,port -U username -P password -Q "SELECT 1" -b`。
  - 远端模式通过 SSH 执行同等 `sqlcmd` 命令。
- `list_databases()`：
  - 查询 `SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name`。
  - 解析 `sqlcmd -h -1 -W` 输出，过滤空行。
- `build_backup_command()`：
  - 本地模式执行 `sqlpackage`。
  - 参数包含 `/Action:Export`、`/SourceServerName:host,port`、`/SourceDatabaseName:<db>`、`/SourceUser:<user>`、`/SourcePassword:<password>`、`/TargetFile:<path>`。
- `build_restore_hint()` 返回 `sqlpackage /Action:Import` 示例。

在 `crates/backup-manager/src/executor.rs` 中补齐 MSSQL：

- raw 文件扩展名使用 `.bacpac`。
- `run_local_dump()` 缺失工具提示支持 `SQLPACKAGE_PATH`。
- `build_remote_dump_command()` 支持 `mssql`，远端命令先导出到临时 `.bacpac`，再 `cat` 到 stdout，最后清理临时文件。

## 第二阶段：原生 `.bak` 备份评估与实现

第二阶段目标是支持 SQL Server 原生 `BACKUP DATABASE ... TO DISK`，生成 `.bak` 文件。

### 需要解决的问题

- `.bak` 文件由 SQL Server 服务端进程写入，不是管理台进程直接生成。
- SQL Server 服务账号必须对目标目录有写权限。
- 如果数据库服务和管理台不在同一机器，需要定义文件回传方式。
- Windows SQL Server 场景下，路径、权限、Shell 和远端执行方式与 Linux/macOS 差异较大。

### 候选方案

1. 数据库服务器执行备份，然后通过 SSH/SCP 回传 `.bak`。
2. 要求用户配置 SQL Server 可写的共享目录，管理台再从共享目录读取。
3. 使用容器或 sidecar 模式，让 SQL Server 客户端和备份临时目录处于明确可控的运行环境。

### 第二阶段交付内容

- 新增备份格式选项：`.bacpac` 或 `.bak`。
- 数据源或任务级别增加 SQL Server 备份格式配置。
- 实现 `.bak` 备份执行、回传、清理和失败恢复。
- 补充权限检查和操作文档。
- 补充端到端验证流程。

## 验证计划

- 后端单元测试覆盖 MSSQL 命令构建、远端命令构建、数据库列表解析和文件扩展名。
- 前端测试覆盖 SQL Server 数据源选项和默认端口。
- 运行 `cargo fmt`。
- 运行 `cargo test`。
- 涉及公开 API、适配器和执行器行为，运行 `cargo clippy --all-targets --all-features`。
- 前端变更运行 `cd web && pnpm test` 和 `cd web && pnpm build`。
