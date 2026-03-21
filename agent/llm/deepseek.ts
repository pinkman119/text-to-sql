import { ChatOpenAI } from "@langchain/openai";
import { deepseekConfig } from "../../config/_index";

// 加载环境变量

/**
 * 创建并配置 DeepSeek LLM 实例
 * DeepSeek 使用 OpenAI 兼容的 API 接口
 */
function createDeepSeekLLM() {
  return new ChatOpenAI({
    modelName: deepseekConfig.modelName,
    temperature: 0.7,
    apiKey: deepseekConfig.apiKey,
    configuration: {
      baseURL: deepseekConfig.baseUrl,
    },
  });
}

export { createDeepSeekLLM };
