# Tasks: 通过自然语言 message 查询员工天气

## 1. 清理旧的按 userId 查询天气实现

- [x] 1.1 在 `app/service/user.ts` 中移除 `getWeatherByUserId` 及相关导出（若仍存在）
- [x] 1.2 在 `app/controller/user.ts` 中移除旧的 `userWeather` handler（若仍存在）
- [x] 1.3 在 `app/router/user.ts` 中移除 `GET /api/users/:id/weather` 对应的路由配置（若仍存在）
- [x] 1.4 确认 `USER.BELONG_PLACE_TO_CITY` 枚举仍保留在 `config/enums.ts` 中，并无编译错误

## 2. Agent Service：昵称提取与按城市查天气

- [x] 2.1 在 `agent/service/weather.ts` 中新增 `extractEmployeeNickName(message: string): Promise<string>`，使用 DeepSeek LLM 从自然语言中提炼员工昵称
- [x] 2.2 在 `agent/service/weather.ts` 中规范化 `getWeatherByCity(city: string): Promise<string>`，确保输入为城市名，输出为可直接展示的天气描述文本
- [x] 2.3 确保 Agent Service 不访问数据库，只依赖 LLM 与天气工具

## 3. App Service：message 驱动的员工天气查询

- [x] 3.1 在 `app/service/user.ts` 或新建 `app/service/userWeather.ts` 中新增 `getWeatherByMessage(message: string)`：
  - 调用 Agent Service 的 `extractEmployeeNickName` 获取 `nickName`
  - 按 `nickName` 查询 User 表，查不到时抛 `HttpError(404, "user not found")`
  - 从用户记录中读取 `belongPlace`，使用 `enums.USER.BELONG_PLACE_TO_CITY` 映射出 `city`，找不到时抛 `HttpError(400, ...)`
  - 调用 Agent Service 的 `getWeatherByCity(city)` 获取 `weatherMessage`
  - 返回 `{ nickName, city, weatherMessage }`
- [x] 3.2 遵守代码规范：所有 import 放在文件最顶部，所有 export 放在文件最底部，该文件尽量保持单一 export（若已有多个 export 则仅新增方法，不新增导出点）

## 4. Controller 与路由

- [x] 4.1 在 `app/controller/user.ts` 中新增 `userWeatherByMessage` handler：
  - 从 `req.body.message` 解析字符串，缺失或为空时抛 `HttpError(400, "message is required")`
  - 调用 App Service 的 `getWeatherByMessage(message)`
  - 成功时 `res.json({ success: true, data })`
- [x] 4.2 在 `app/router/user.ts` 中注册 `POST /weather-by-message` 路由，使用现有 `wrap` 包裹 `userWeatherByMessage`

## 5. 路由挂载与验证

- [x] 5.1 确认 `app/router/index.ts` 中仍挂载 `app.use("/api/users", userRouter())`
- [ ] 5.2 通过本地调用 `POST /api/users/weather-by-message`（传入示例 message）进行联调，验证成功 / 各类错误场景是否符合 spec 要求

