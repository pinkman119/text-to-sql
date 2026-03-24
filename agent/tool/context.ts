import { tool, type ToolRuntime } from "@langchain/core/tools";
import { createAgent } from "langchain";
import * as z from "zod";
import { createDeepSeekLLM } from "../llm/deepseek";

/** 与 {@link agent} 的 `contextSchema` 一致，须在 `invoke` 第二参传入 `context` */
const contextSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
});

type DemoAgentContext = z.infer<typeof contextSchema>;

// 2. 定义工具，通过第二个参数 runtime 访问 context
const getUserInfo = tool(
  async (input, runtime: ToolRuntime<any, typeof contextSchema>) => {
    // ✅ 关键：通过 runtime.context 访问 invoke 时传入的 context
    const state = runtime.state;

    console.log(`state: ${JSON.stringify(state)}`);
  },
  {
    name: "get_user_info",
    description: "Get user information",
    schema: z.object({}), // 工具本身的参数
  },
);

// 3. 创建 agent
const agent = createAgent({
  model: createDeepSeekLLM(),
  tools: [getUserInfo],
  contextSchema, // 可选，但提供类型安全
});

export type { DemoAgentContext };
export { agent, contextSchema };
