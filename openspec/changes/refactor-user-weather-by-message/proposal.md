# 通过自然语言查询员工天气（按昵称解析）

## Why

现有的“按用户 ID + 归属地枚举查询天气”的实现已经不再符合业务需求：

- 当前接口依赖 `userId`，而实际业务场景是用户输入一整句自然语言（例如：“我想知道员工李佳伟那边的天气”），希望系统自己从中识别出员工昵称并返回对应天气。
- App 层与 Agent 能力的边界不够清晰，需要由 Agent 负责自然语言解析（提炼员工昵称）、由 App 负责数据库查询与枚举映射，保持分层清晰、便于演进。
- 旧的 `getWeatherByUserId` 相关代码（Service / Controller / Router）已经偏离新需求，应整体移除，只保留归属地 → 城市的枚举配置，以便后续继续复用。

因此，需要引入一个新的“通过自然语言 message 查询员工天气”的能力，并重构 App 与 Agent 之间的协作方式。

## What Changes

- **移除旧的按用户 ID 查天气实现**：
  - 从 App 层移除 `getWeatherByUserId` 及对应的 Controller handler、`GET /api/users/:id/weather` 路由。
  - 保留 `config/enums.ts` 中 `USER.BELONG_PLACE_TO_CITY` 的枚举映射，不再由旧接口使用，但仍可用于后续根据归属地推导城市。

- **新增“自然语言 message 查询员工天气”接口**：
  - 新增一个 HTTP 接口（示例）：`POST /api/users/weather-by-message`。
  - 请求体包含字段：`{ message: string }`，例如 `"我想知道员工李佳伟那边的天气"`。
  - Controller 从请求体中获取 `message` 后，调用 App Service（如 `getWeatherByMessage(message)`），不直接调用 Agent。

- **重构 App Service 与 Agent Service 的交互**：
  - **Agent Service（agent/service 层）职责**：
    - 提供方法从自然语言 `message` 中提炼员工昵称（如 `"李佳伟"`）。
    - 提供方法根据城市名称返回天气描述（文本 message），仍可基于现有 DeepSeek + 天气工具实现。
  - **App Service（app/service 层）职责**：
    - 将 `message` 交给 Agent Service，获取员工昵称。
    - 使用员工昵称在数据库中查询用户信息（User 表），取出员工的 `belongPlace`。
    - 使用 `enums.USER.BELONG_PLACE_TO_CITY` 将 `belongPlace` 映射为城市名。
    - 再次调用 Agent Service，根据城市名获取天气描述。
    - 将昵称、城市和最终天气 message 组装成统一结构返回给 Controller。

## Capabilities

### New Capabilities

- `user-weather-by-message`：
  - **输入**：自然语言字段 `message`，例如 `"我想知道员工李佳伟那边的天气"`。
  - **处理流程**：
    1. Agent Service 从 `message` 中提炼员工昵称。
    2. App Service 通过昵称查询数据库中的 User，获取该员工的归属地 `belongPlace`。
    3. App Service 使用 `USER.BELONG_PLACE_TO_CITY` 将归属地映射为城市名。
    4. App Service 调用 Agent Service 的按城市查天气能力，获取天气描述。
    5. 将昵称、城市与天气描述组合为统一的 `weatherMessage` 返回给 Controller。
  - **输出示例**：
    - 成功时：`{ nickName: "李佳伟", city: "北京", weatherMessage: "李佳伟所在的北京：晴朗，气温25°C ..." }`。

### Modified / Removed Capabilities

- 移除旧的 `user-weather-by-place` 风格接口实现：
  - 不再提供 `GET /api/users/:id/weather` 这种只接受用户 ID 的天气查询能力。
  - 不再在 App Service 中直接依赖旧的 agent/tool 调用方式，而是通过新的 Agent Service 方法完成“提取昵称 + 查天气”。

## Impact

- **API**
  - 新增 `POST /api/users/weather-by-message`（或者等价、与现有 REST 风格统一的路径），请求体包含 `message: string` 字段。
  - 响应格式遵循现有规范：成功时 `{ success: true, data }`，失败时 `{ success: false, message, details? }`。

- **Backend（App 层）**
  - 删除旧的 `getWeatherByUserId`、`userWeather` handler 和 `GET /api/users/:id/weather` 路由。
  - 新增 `getWeatherByMessage(message: string)` 等 Service 方法，用于：
    - 调用 Agent Service 解析昵称。
    - 查询数据库 User 表获取 `belongPlace`。
    - 使用 `enums.USER.BELONG_PLACE_TO_CITY` 映射城市。
    - 调用 Agent Service 获取天气描述，并返回给 Controller。

- **Agent（agent 层）**
  - 在 `agent/service/weather.ts` 中新增/重构方法：
    - 提取员工昵称（自然语言解析）。
    - 根据城市返回天气描述 message。
  - Agent 不访问数据库，只处理自然语言与天气工具调用。

- **约束与约定**
  - 导入（import）语句统一放在文件的最顶部，导出（export）语句放在文件的最底部，每个文件尽量只保留一个导出语句块，保持与现有项目风格一致。

