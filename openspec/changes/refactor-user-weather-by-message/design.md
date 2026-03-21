# Design: 通过自然语言查询员工天气（按昵称解析）

## Context

- 现有实现是通过 `userId` 和 `belongPlace` + 枚举映射去查询天气，已经不符合“用户输入自然语言一句话”的场景。
- 项目已存在：
  - `User` 模型，包含 `nickName` 与 `belongPlace` 字段。
  - `config/enums.ts` 中 `USER.BELONG_PLACE_TO_CITY`（归属地编码 → 城市名）。
  - `agent/service/weather.ts` 中基于 DeepSeek + 天气工具的天气查询能力。
- 需要新增一条调用链：**Controller → App Service → Agent Service（提取昵称）→ App Service（查 DB + 映射城市）→ Agent Service（查天气）→ Controller**。

## Goals / Non-Goals

**Goals**

- 支持客户端通过一段自然语言 `message`，例如“我想知道员工李佳伟那边的天气”，查询对应员工所在城市的天气。
- 将“自然语言解析（提炼昵称）”与“数据库查询 / 映射城市 / 组装返回”的职责拆分到 Agent 与 App 各自的 Service 层。
- 移除不再需要的旧接口代码（按 userId 查天气），但保留 `USER.BELONG_PLACE_TO_CITY` 枚举。

**Non-Goals**

- 不在此改动中变更 User / Dept 等其它业务 API。
- 不引入认证鉴权逻辑（auth 可以在后续单独变更中处理）。
- 不实现真实外部天气 API，只复用/改进现有 Agent 内模拟或封装的天气能力。

## High-level Design

### 1. API 设计

- 新接口：`POST /api/users/weather-by-message`
  - Request body：
    ```json
    { "message": "我想知道员工李佳伟那边的天气" }
    ```
  - Response（成功示例）：
    ```json
    {
      "success": true,
      "data": {
        "nickName": "李佳伟",
        "city": "北京",
        "weatherMessage": "李佳伟所在的北京：晴朗，气温25°C，空气质量良好"
      }
    }
    ```
  - 错误情况统一由全局 `errorHandler` 处理，保持与现有 API 一致。

### 2. App Service 设计（app/service）

- 在 `app/service/user.ts` 或新建 `app/service/userWeather.ts` 中新增：
  - `async function getWeatherByMessage(message: string)`：
    1. 调用 Agent Service：`extractEmployeeNickName(message)`，获取昵称 `nickName`。
    2. 使用 ORM 在 User 表中按 `nickName` 查询用户：
       - 若未找到用户：抛 `HttpError(404, "user not found")` 或更具体的文案。
    3. 从用户记录中读取 `belongPlace`，利用 `enums.USER.BELONG_PLACE_TO_CITY` 映射出 `city`：
       - 若无映射：抛 `HttpError(400, "belong_place ... has no city mapping")`。
    4. 调用 Agent Service：`getWeatherByCity(city)`，得到天气描述 `weatherMessage`。
    5. 返回 `{ nickName, city, weatherMessage }`。

- App Service 不实现自然语言解析，不直接操作 DeepSeek，只通过 Agent Service 暴露的函数进行调用。

### 3. Agent Service 设计（agent/service）

- 在 `agent/service/weather.ts` 中定义两个职责分明的方法：
  - `async function extractEmployeeNickName(message: string): Promise<string>`：
    - 使用 DeepSeek LLM，对传入的中文句子进行解析。
    - 提示词示例逻辑：
      - 只从文本中提取“员工昵称”（如“李佳伟”），不返回其它内容。
      - 若无法确定昵称，则返回空字符串或抛出错误，由上层处理。
  - `async function getWeatherByCity(city: string): Promise<string>`：
    - 复用或重构现有天气 Agent：
      - 输入为城市名称（如“北京”、“上海”）。
      - 返回一段可直接展示给用户的天气描述文本。

- Agent Service 不访问数据库，只负责 NLP + 天气生成。

### 4. Controller & Router 设计（app/controller, app/router）

- Controller：
  - 在 `app/controller/user.ts` 中新增 handler（示例）：
    - `async function userWeatherByMessage(req, res)`：
      - 从 `req.body.message` 读取字符串。
      - 若缺少或为空：抛 `HttpError(400, "message is required")`。
      - 调用 App Service：`getWeatherByMessage(message)`。
      - 返回 `{ success: true, data }`。

- Router：
  - 在 `app/router/user.ts` 中新增路由：
    - `POST /weather-by-message` → `userWeatherByMessage`。
  - 完整路径为：`POST /api/users/weather-by-message`（沿用现有 `/api/users` 前缀）。

### 5. 旧代码清理

- 从 App 层移除（或不再使用）：
  - `getWeatherByUserId` 相关 Service 方法及导出。
  - `userWeather` Controller handler。
  - `GET /api/users/:id/weather` 路由配置。
- 保留并继续使用：
  - `config/enums.ts` 中 `USER.BELONG_PLACE_TO_CITY`。

## Error Handling & Edge Cases

- **无法解析昵称**：
  - Agent Service 返回空昵称或抛错时，App Service 将其转为 `HttpError(400, "could not extract employee nickname")`。
- **用户不存在**：
  - 按昵称查不到 User 时，抛 `HttpError(404, "user not found")`。
- **归属地无映射**：
  - `belongPlace` 找不到对应城市时，抛 `HttpError(400, "belong_place ... has no city mapping")`。
- **Agent 调用失败**：
  - 调用 Agent Service 任何方法出错时，App Service catch 后抛 `HttpError(502, "weather service unavailable")`，不泄露内部细节。

## Implementation Notes

- 保持现有项目风格：
  - 所有 `import` 放在文件顶部。
  - 所有 `export` 放在文件底部，尽量一个文件只保留一个导出语句块。
- 优先考虑在现有 `user` 相关 Service/Controller/Router 中扩展，实现简单且贴合当前结构；若逻辑过多再考虑拆分为独立文件。

