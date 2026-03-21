# 项目说明 (Project Context)

本文档描述当前系统的技术栈、目录结构、代码规范与约定，供 OpenSpec 变更设计与实现时参考。

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言与运行时 | TypeScript (ES2022)、Node.js |
| Web 框架 | Express 5.x |
| 数据库与 ORM | MySQL、Sequelize |
| AI / Agent | LangChain.js、LangGraph、@langchain/openai（兼容 DeepSeek 等） |
| 模块与构建 | NodeNext (ESM)，编译输出到 `dist/` |
| 代码质量 | ESLint 9、Prettier、EditorConfig |

---

## 项目目录结构

```
├── index.ts                 # 应用入口：Express 创建、路由注册、全局错误处理、DB 初始化
├── app/
│   ├── router/              # 路由注册：按资源拆分（user.ts, dept.ts），在 index.ts 中挂载
│   ├── controller/          # 控制器：解析 req、调用 service、写 res
│   ├── service/             # 业务逻辑：调用 model，不直接接触 req/res
│   ├── model/               # Sequelize 模型与关联，_index.ts 统一导出并 initDb
│   └── middleware/          # 全局中间件（如 error_handler）
├── config/
│   ├── _index.ts            # 配置统一出口：按 NODE_ENV 加载 dev/prod/test，业务只从此处取配置
│   ├── constant.ts          # 全局常量（与环境无关）
│   ├── enums.ts             # 全局枚举（与环境无关）
│   ├── dev/                 # 开发环境：database.ts, agent_config.ts（不提交）
│   ├── prod/                # 生产环境
│   └── test/                # 测试环境
├── agent/                   # LangChain/Agent 相关
│   ├── llm/                 # LLM 封装（如 deepSeek.ts，从 config 读 apiKey/baseUrl）
│   └── tool/                # Agent 工具
├── lib/                     # 脚本、SQL、示例配置（如 ehr_dev.sql, agent_config.example）
└── openspec/                # OpenSpec 变更与规格
    ├── config.yaml          # OpenSpec 项目配置与规则
    ├── project.md           # 本文件：项目上下文
    └── changes/<name>/      # 各变更的 proposal、design、specs、tasks
```

---

## 分层与数据流

- app：app层实现web相关实现，包括提供接口、数据库查询等常用web实现；
- agent：AI agent相关实现，通过agent/service与app/service相交互，尽量避免直接在该agent/service下进行操作数据库等web相关操作；
- **Router**：定义 HTTP 方法、路径，使用 `wrap(fn)` 将 async controller 转为 catch(next)；不写业务逻辑。
- **Controller**：从 `req.params`/`req.body`/`req.query` 解析参数，校验必填与类型，调用 **Service**，按约定写 `res.json({ success, data? })`；业务异常通过 `throw new HttpError(status, message)` 交给全局错误处理。
- **Service**：纯业务与数据访问，入参/出参为普通对象或 Model 实例；依赖 **Model** 与 `config`；不引用 Request/Response。
- **Model**：Sequelize 模型，表名与字段映射（如 `tableName: "tbl_user"`、`field: "dept_id"`）；关联在 `app/model/_index.ts` 中定义。

---

## API 约定

- **基础路径**：业务 API 以 `/api/` 为前缀（如 `/api/users`、`/api/depts`）；健康检查等为根路径（如 `GET /health`）。
- **成功响应**：`{ success: true, data?: T }`；创建成功可用 `201`。
- **错误响应**：由 `error_handler` 统一返回 `{ success: false, message, details? }`，HTTP 状态码由 `HttpError.status` 决定（如 400、401、404、409、500）。
- **参数**：路径参数用 `numParam(req, "id")` 等解析并校验；body 支持 camelCase 与 snake_case（如 `deptId`/`dept_id`）以兼容不同客户端。

---

## 配置与环境

- **环境**：由 `NODE_ENV` 决定，映射为 `dev` | `prod` | `test`；配置通过 `config/_index.ts` 按需 require 对应目录下的模块，避免多环境同时加载造成副作用。
- **数据库**：连接信息来自各环境 `config/<env>/database.ts`，支持 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASS`、`DB_LOGGING` 等环境变量覆盖。
- **敏感配置**：`config/dev|prod|test/agent_config.ts` 不提交，仓库内提供示例（如 `lib/agent_config.example`）；API Key、JWT 密钥等均通过环境或本地配置文件注入。

---

## 代码与风格

- **TypeScript**：严格模式（`strict: true`）；仅业务代码从 `config/_index` 引用配置，避免在 model 等层直接读 `process.env`。
- **格式化**：Prettier（双引号、分号、尾逗号、LF）；EditorConfig 统一 2 空格、UTF-8、末尾换行。
- **命名**：文件名小写、短横线或语义名（如 `error_handler.ts`）；模型/类 PascalCase；路由与 controller 方法按资源+动作（如 `userList`、`userGet`）。
- **模型与表**：表名统一 `tbl_<资源>`（如 `tbl_user`、`tbl_dept`）；字段在模型中用 camelCase，通过 `field` 映射到 DB 的 snake_case。
- **导出与导入**：每个文件尽可能只适用一个export，并且将export放入文件底部；每个文件import放在文件的顶层；

---

## 领域与现有能力

- **领域**：EHR 相关（用户、部门等）；User 关联 Dept（`deptId`）；部门支持树形结构（`parentId`、`pathIds`、`pathNames`）。
- **现有 API**：`GET/POST/PATCH/DELETE /api/users`、`GET /api/users/:id`；`/api/depts` 同理。列表返回带关联（如 user 含 dept）；无认证时所有接口均可访问。
- **Agent**：通过 `agent/llm` 与 `agent/tool` 集成 LangChain；LLM 配置从 `config` 读取（如 DeepSeek 的 apiKey、baseUrl）。

---

## 与 OpenSpec 的配合

- 新增或修改 API 时，保持上述分层与响应格式；新资源可参照 `app/router/user.ts` + `controller/user.ts` + `service/user.ts` + `model/user.ts` 的拆分方式。
- 数据库变更：表结构变更需在 `lib/` 下提供或更新 SQL（如 `ehr_dev.sql`），并在 model 中同步字段与映射。
- 配置与密钥：新环境变量或密钥需在文档或示例中说明，且不提交真实密钥文件（继续通过 `.gitignore` 排除）。
