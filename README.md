# text-to-sql

基于「约定优于配置」思想，使用 **Express 5**、**LangChain / LangGraph** 与 **Sequelize（MySQL）** 搭建的 TypeScript 后端：提供自然语言 **Text-to-SQL Agent**（含 **SSE 纯文本流式** 与一次性 `invoke`）、部门等业务 API，以及分环境配置与基础工程化能力。

## 1 系统简介

项目面向「自然语言查库 + 可扩展 REST 服务」场景：Agent 相关逻辑集中在 `agent/`（LLM、提示词、工具、服务编排），Web 层在 `app/`（路由、控制器、服务、模型），配置统一从 `config/_index.ts` 出口读取；数据库未就绪时服务仍可先启动，连接失败仅打日志（见 `index.ts`）。

### 1.1 技术选型

- 语言：TypeScript（Node.js 运行时，ESM / NodeNext）
- Web 框架：Express 5
- Agent / LLM：LangChain、`createAgent`（ReAct）、LangGraph 流式、`@langchain/openai`（兼容 DeepSeek 等 OpenAI 兼容端点）
- 数据库：MySQL + Sequelize
- 其它：`node-sql-parser`（SQL 相关工具链）、Zod、代码质量 ESLint + Prettier
- 开发工具：nodemon + cross-env

### 1.2 VSCode 依赖插件

- ESLint（`dbaeumer.vscode-eslint`）
- Prettier（`esbenp.prettier-vscode`）

### 1.3 目录要点（与 `openspec/project.md` 一致处不重复展开）

- `agent/llm`：如 DeepSeek 封装，从配置读取 `apiKey` / `baseUrl`
- `agent/prompt`：Text-to-SQL 系统提示、外键约束等
- `agent/tool`：SQL 校验、执行查询等工具
- `agent/service`：Agent 组装与 `invoke` / 流式迭代
- `app/utils/sse.ts`：SSE 响应头与纯文本 `data:` 写出

## 2 编码风格

### 2.1 基础风格

- 统一使用 TypeScript，避免新增 JS 文件。
- 默认 2 空格缩进，语句结尾保留分号。
- 优先小函数、单一职责，避免「超长函数」与「巨型文件」。
- 异步流程统一使用 `async/await`，避免链式 `then/catch` 过深。
- 所有 import 置于文件顶部，export 置于文件底部（与 `.cursorrules` / `openspec/project.md` 约定一致）。

### 2.2 命名相关

- 变量/函数：`camelCase`，例如 `streamTextToSqlAgent`。
- 类型/类/接口：`PascalCase`，例如 `DatabaseConfig`。
- 常量：`UPPER_SNAKE_CASE`（仅用于真正常量）。
- 文件命名：按模块语义命名，保持与目录职责一致，例如 `app/service/dept.ts`。
- 枚举映射建议统一收敛到 `config/enums.ts`，避免散落在业务代码中。

### 2.3 TS 相关

- 优先显式声明关键函数入参和返回值类型。
- 禁止滥用 `any`，必要时优先使用 `unknown` 后再收窄。
- 配置对象建议使用 `as const` 保持字面量类型稳定。
- 通过集中配置出口 `config/_index.ts` 获取环境配置，避免业务层直接读取多处配置文件。

### 2.4 数据库设计

- 当前 ORM 使用 Sequelize，数据库方言为 MySQL。
- 设计建议：
  - 每张表保留主键、创建时间、更新时间等基础字段。
  - 业务枚举值优先用数字存储，展示文案通过枚举映射转换。
  - 查询高频字段建立索引（如昵称、状态、外键字段）。
  - 避免在业务代码中写复杂 SQL，优先沉淀到模型层/服务层；复杂库表结构可参考 `lib/ehr_dev.sql`。

### 2.5 系统环境

- Node.js：建议 18+（推荐 LTS）
- npm：建议 9+
- MySQL：建议 8.0+
- 操作系统：Windows / macOS / Linux 均可

## 3 快速开始

### 3.1 配置数据库

项目默认支持通过环境变量覆盖数据库连接，常用变量如下：

- `DB_HOST`（默认 `127.0.0.1`）
- `DB_PORT`（默认 `3306`）
- `DB_NAME`（开发默认 `ehr_dev`）
- `DB_USER`（默认 `root`）
- `DB_PASS`（默认 `password`）
- `DB_TIMEZONE`（默认 `+08:00`）
- `DB_LOGGING`（`true/false`）

可在系统环境变量中配置，或使用你本地习惯的 `.env` 方案注入（确保不要提交敏感信息）。

Sequelize 会在运行时连接数据库；若本地尚未创建库，可按 `config` 中库名自行创建，或结合 `lib/ehr_dev.sql` 初始化表数据。

### 3.2 配置 LLM

在各环境目录下维护 Agent 所需配置（如 `config/dev/agent_config.ts`），一般包含 DeepSeek/OpenAI 兼容接口的：

- `modelName`
- `apiKey`
- `baseUrl`

**请勿将真实密钥提交到仓库**；可复制为本地文件后通过环境变量或私有配置注入（敏感文件已由 `.gitignore` 排除）。

### 3.3 配置 OpenSpec

项目可配合 OpenSpec 工作流，基础配置位于：

- `openspec/config.yaml`
- `openspec/project.md`

建议流程：

1. 在 `openspec/changes/` 下创建变更目录。
2. 完善 `proposal.md`、`design.md`、`tasks.md` 与对应 spec。
3. 按任务逐项实现并回填勾选状态。

### 3.4 格式化插件安装

安装 VSCode 插件：

- ESLint：`dbaeumer.vscode-eslint`
- Prettier：`esbenp.prettier-vscode`

推荐工作区设置（`.vscode/settings.json`）：

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "eslint.validate": ["javascript", "typescript"],
  "eslint.useFlatConfig": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "always"
  }
}
```

### 3.5 项目安装

```
npm install
```

### 3.6 项目构建

```bash
npm run build
```

### 3.7 项目运行

开发环境（推荐）：

```bash
npm run dev
```

其他运行方式：

```bash
# 生产配置 + nodemon
npm run dev:prod
# 测试环境 + nodemon
npm run dev:test
# 生产：先 build 再 node dist
npm run start
```

默认 HTTP 端口为 `3000`，可通过环境变量 `PORT` 覆盖。

## 4 启动测试

以下示例默认服务地址为 `http://localhost:3000`。

### 4.1 健康检查

```http
GET /health
```

响应示例：

```json
{ "ok": true }
```

### 4.2 Text-to-SQL（SSE 纯文本流）

使用 **Server-Sent Events**，`data:` 负载为**纯文本**（模型与工具产生的可见文本，不含 JSON 包装；结束以连接关闭为准）。

```http
GET /api/depts/stream?message=<自然语言问题>
```

示例（终端）：

```bash
curl -N "http://localhost:3000/api/depts/stream?message=请用一句话说明你能做什么"
```

浏览器可使用 `EventSource` 订阅（仅支持 GET，与当前接口一致）。

### 4.3 Text-to-SQL（一次性 JSON）

使用 Agent `invoke`，返回 LangGraph 最终状态对象（含 `messages` 等字段），外层仍为统一成功体：

```http
GET /api/depts?message=<自然语言问题>
```

响应形态：

```json
{
  "success": true,
  "data": {}
}
```

`data` 结构与 LangChain Agent 最终状态一致，便于调试完整对话与工具调用轨迹。

### 4.4 部门资源 CRUD

前缀：`/api/depts`（业务 API 约定见 `openspec/project.md`）。

| 方法   | 路径             | 说明                              |
| ------ | ---------------- | --------------------------------- |
| GET    | `/api/depts/:id` | 按 id 查询部门                    |
| POST   | `/api/depts`     | 创建部门（body 字段见控制器校验） |
| PATCH  | `/api/depts/:id` | 更新部门                          |
| DELETE | `/api/depts/:id` | 删除部门                          |

成功响应：`{ "success": true, "data": ... }`；错误由全局 `error_handler` 返回 `{ "success": false, "message": "..." }`。

---

更完整的架构说明、表名与字段映射约定见 **`openspec/project.md`**。
