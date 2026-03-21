# Spec: 通过自然语言 message 查询员工天气（user-weather-by-message）

## ADDED Requirements

### Requirement: 提供按自然语言 message 查询员工天气的接口

系统 SHALL 提供一 HTTP 接口，接受包含员工昵称的自然语言 `message` 字符串（例如“我想知道员工李佳伟那边的天气”），通过 Agent Service 提取员工昵称，再由 App Service 根据昵称查询员工归属地并返回对应城市的天气信息。

#### Scenario: 成功返回天气

- **WHEN** 客户端 `POST` 到该接口并提供有效的 `message`，且 Agent 能从中成功解析出员工昵称，数据库中存在该昵称的员工记录，其 `belongPlace` 在系统中配置了城市映射，且天气查询成功
- **THEN** 响应 SHALL 为 200，body SHALL 为 `{ success: true, data: { nickName, city, weatherMessage } }`

#### Scenario: 缺少 message

- **WHEN** 客户端请求未提供 `message` 字段或 `message` 为空字符串
- **THEN** 响应 SHALL 为 400

#### Scenario: 无法从 message 中解析出昵称

- **WHEN** Agent Service 无法从 `message` 文本中提取出有效的员工昵称
- **THEN** App Service SHALL 返回 400（例如 `could not extract employee nickname`），且 SHALL 不进行数据库查询和天气查询

#### Scenario: 员工不存在

- **WHEN** 通过解析出的昵称在数据库中查不到对应的员工记录
- **THEN** 响应 SHALL 为 404

#### Scenario: 归属地无映射

- **WHEN** 查到的员工存在，但其 `belongPlace` 在 `USER.BELONG_PLACE_TO_CITY` 中找不到对应城市
- **THEN** 响应 SHALL 为 400，且 SHALL 不调用天气查询能力

#### Scenario: 天气查询失败

- **WHEN** App Service 调用 Agent Service 的按城市查天气能力时发生异常或超时
- **THEN** 响应 SHALL 为 5xx（如 502 或 500），且 SHALL 符合现有错误响应格式 `{ success: false, message }`

### Requirement: App Service 与 Agent Service 的职责划分

自然语言解析与天气查询 SHALL 由 Agent Service 完成；数据库查询与归属地到城市的映射 SHALL 由 App Service 完成。

#### Scenario: 分层调用链

- **WHEN** 实现该接口
- **THEN** Controller 代码中 SHALL 不直接调用 Agent 工具；Controller SHALL 只调用 App Service（例如 `getWeatherByMessage(message)`）
- **AND** App Service SHALL：
  - 调用 Agent Service 提取员工昵称
  - 使用提取出的昵称查询数据库中的 User
  - 使用 `USER.BELONG_PLACE_TO_CITY` 将 `belongPlace` 映射为城市
  - 调用 Agent Service 的按城市查天气方法
  - 将昵称、城市和天气描述组合后返回给 Controller

#### Scenario: Agent 仅负责 NLP 与天气

- **WHEN** 实现该接口
- **THEN** Agent Service SHALL 不直接访问数据库或 ORM；SHALL 只负责从自然语言中提取昵称以及根据城市生成天气描述文本

### Requirement: 移除旧的按 userId 查询天气接口

系统 SHALL 移除（或不再暴露）旧的基于 `userId` 的按用户查询天气接口（如 `GET /api/users/:id/weather`），以避免与新的 message 驱动能力产生混淆。

#### Scenario: 旧接口不再可用

- **WHEN** 部署该变更后
- **THEN** 旧的按 `userId` 查询天气接口 SHALL 不再接受请求或 SHALL 返回 404（根据实现决定是物理删除路由还是保留路由但返回明确错误）
