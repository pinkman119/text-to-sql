# langchain-express-boot

基于“约定优于配置”思想，结合 LangChain.js 与 Express.js 打造的 TypeScript 后端启动模板，内置 Sequelize（MySQL）、Agent 调用能力与基础工程化配置。项目组成：60%人工智能 + 40%智能人工

## 1 系统简介

项目面向“快速搭建可扩展后端服务”场景，提供统一配置出口、分环境配置、路由分层与基础错误处理机制，便于在业务开发中快速落地。

### 1.1 技术选型

- 语言：TypeScript（Node.js 运行时）
- Web 框架：Express 5
- Agent / LLM：LangChain、LangGraph、@langchain/openai
- 数据库：MySQL + Sequelize
- 代码质量：ESLint + Prettier
- 开发工具：nodemon + cross-env

### 1.2 VSCode 依赖插件

- ESLint（`dbaeumer.vscode-eslint`）
- Prettier（`esbenp.prettier-vscode`）

## 2 编码风格

### 2.1 基础风格

- 统一使用 TypeScript，避免新增 JS 文件。
- 默认 2 空格缩进，语句结尾保留分号。
- 优先小函数、单一职责，避免“超长函数”与“巨型文件”。
- 异步流程统一使用 `async/await`，避免链式 `then/catch` 过深。
- 所有 import 置于文件顶部，export 置于文件底部（与现有代码约定保持一致）。

### 2.2 命名相关

- 变量/函数：`camelCase`，例如 `getWeatherByMessage`。
- 类型/类/接口：`PascalCase`，例如 `DatabaseConfig`。
- 常量：`UPPER_SNAKE_CASE`（仅用于真正常量）。
- 文件命名：按模块语义命名，保持与目录职责一致，例如 `app/service/user.ts`。
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
  - 避免在业务代码中写复杂 SQL，优先沉淀到模型层/服务层。

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

sequelize框架会在你运行项目时候检测数据库相关配置，如果未创建对应数据库，`npm run dev`后，**框架会自动帮你创建数据库**。

### 3.2 配置LLM

当前项目在 `config/dev/agent_config.ts` 中维护 `deepseekConfig`：

- `modelName`
- `apiKey`
- `baseUrl`

建议将真实密钥迁移为环境变量读取，避免将敏感信息写入仓库。可以使用`lib/agent_config.example`中文件配置创建。

### 3.3 配置opensec

项目已接入 OpenSpec 工作流，基础配置位于：

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
// 生产环境
npm run dev:prod
// 测试环境
npm run dev:test
// 生产环境
npm run start
```

## 4 启动测试

### 4.1 天气助手

你可以询问当前agent某个员工那边的天气，agent根据语义分解对应员工昵称，并根据员工所在归属地查询员工所处工作地点的天气情况：

0. 执行SQL：

```
INSERT INTO `tbl_user` VALUES (1, '李佳薇', 1, 1, 1, '小李');
INSERT INTO `tbl_user` VALUES (2, '李明星', 1, 1, 2, '星星');
```

1. 执行http请求：

```
POST | http://localhost:3000/api/users/weather-by-message
{
  "message": "小李那边天气怎么样？"
}
```

2. 返回结果：

```
{
    "success": true,
    "data": {
        "nickName": "小李",
        "city": "北京",
        "weatherMessage": "根据查询结果，北京当前的天气情况是：\n- **温度**：25°C\n- **天气状况**：🌤️ 多云\n\n这是一个比较舒适的温度，适合外出活动。"
    }
}
```

3. 继续请求：

```
POST | http://localhost:3000/api/users/weather-by-message
{
  "message": "星星呢？"
}
```

4. 返回结果

```
{
    "success": true,
    "data": {
        "nickName": "星星",
        "city": "上海",
        "weatherMessage": "上海现在的天气是多云，温度为25°C。"
    }
}
```

5. 测试不存在数据库的员工：

```
POST | http://localhost:3000/api/users/weather-by-message
{
  "message": "最后我想问一下vivi那边怎么说"
}
```

6. 返回结果

```
{
    "success": false,
    "message": "user not found"
}
```
