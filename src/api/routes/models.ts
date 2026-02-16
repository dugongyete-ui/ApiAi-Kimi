import _ from 'lodash';

const SUPPORTED_MODELS = [
    {
        "id": "kimi-k2.5-instant",
        "name": "K2.5 Instant",
        "object": "model",
        "owned_by": "moonshot",
        "description": "Quick response, 256k context, fast 3-8s responses",
        "category": "k2.5"
    },
    {
        "id": "kimi-k2.5-thinking",
        "name": "K2.5 Thinking",
        "object": "model",
        "owned_by": "moonshot",
        "description": "Deep thinking for complex questions, chain-of-thought reasoning",
        "category": "k2.5"
    },
    {
        "id": "kimi-k2.5-agent",
        "name": "K2.5 Agent",
        "object": "model",
        "owned_by": "moonshot",
        "description": "Research, slides, websites, docs, sheets - tool-calling workflows",
        "category": "k2.5"
    },
    {
        "id": "kimi-k2.5-agent-swarm",
        "name": "K2.5 Agent Swarm",
        "object": "model",
        "owned_by": "moonshot",
        "description": "Multi-agent orchestration, up to 100 parallel sub-agents for complex tasks",
        "category": "k2.5"
    },
    {
        "id": "kimi-k2-0905-preview",
        "name": "K2-0905",
        "object": "model",
        "owned_by": "moonshot",
        "description": "256k context, enhanced Agentic Coding",
        "category": "k2"
    },
    {
        "id": "kimi-k2-0711-preview",
        "name": "K2-0711",
        "object": "model",
        "owned_by": "moonshot",
        "description": "128k context, 1T params MoE architecture",
        "category": "k2"
    },
    {
        "id": "kimi-k2-turbo-preview",
        "name": "K2-Turbo",
        "object": "model",
        "owned_by": "moonshot",
        "description": "K2 high-speed, 256k context, 60-100 tokens/s",
        "category": "k2"
    },
    {
        "id": "kimi-k2-thinking",
        "name": "K2-Thinking",
        "object": "model",
        "owned_by": "moonshot",
        "description": "K2 long-thinking model, multi-step tool calls and deep reasoning",
        "category": "k2"
    },
    {
        "id": "kimi-k2-thinking-turbo",
        "name": "K2-Thinking-Turbo",
        "object": "model",
        "owned_by": "moonshot",
        "description": "K2 thinking high-speed, deep reasoning 60-100 tokens/s",
        "category": "k2"
    },
    {
        "id": "moonshot-v1-8k",
        "name": "Moonshot-8K",
        "object": "model",
        "owned_by": "moonshot",
        "description": "Short text generation, 8k context",
        "category": "moonshot"
    },
    {
        "id": "moonshot-v1-32k",
        "name": "Moonshot-32K",
        "object": "model",
        "owned_by": "moonshot",
        "description": "Long text generation, 32k context",
        "category": "moonshot"
    },
    {
        "id": "moonshot-v1-128k",
        "name": "Moonshot-128K",
        "object": "model",
        "owned_by": "moonshot",
        "description": "Ultra-long text generation, 128k context",
        "category": "moonshot"
    },
    {
        "id": "moonshot-v1-8k-vision-preview",
        "name": "Moonshot-Vision-8K",
        "object": "model",
        "owned_by": "moonshot",
        "description": "Vision model, 8k context image+text analysis",
        "category": "vision"
    },
    {
        "id": "moonshot-v1-32k-vision-preview",
        "name": "Moonshot-Vision-32K",
        "object": "model",
        "owned_by": "moonshot",
        "description": "Vision model, 32k context image+text analysis",
        "category": "vision"
    },
    {
        "id": "moonshot-v1-128k-vision-preview",
        "name": "Moonshot-Vision-128K",
        "object": "model",
        "owned_by": "moonshot",
        "description": "Vision model, 128k context image+text analysis",
        "category": "vision"
    },
    {
        "id": "kimi-latest",
        "name": "Kimi-Latest",
        "object": "model",
        "owned_by": "moonshot",
        "description": "Latest vision model, 128k context",
        "category": "latest"
    }
];

export default {

    prefix: '/v1',

    get: {
        '/models': async () => {
            return {
                "data": SUPPORTED_MODELS
            };
        }

    }
}

// 导出模型验证函数
export function isValidModel(modelId: string): boolean {
    return SUPPORTED_MODELS.some(model => model.id === modelId);
}

// 导出默认模型
export const DEFAULT_MODEL = "moonshot-v1-8k";