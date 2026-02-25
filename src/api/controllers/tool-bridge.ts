/**
 * Tool Bridge — translates OpenAI tool-calling protocol ↔ Kimi text-based format.
 *
 * Flow (client perspective, fully standard OpenAI):
 *  1. Client sends POST /v1/chat/completions with `tools` array
 *  2. Bridge injects a system prompt that describes the tools to Kimi
 *  3. Bridge converts any role:"tool" messages → plain text Kimi can read
 *  4. Bridge sends the enriched conversation to Kimi and receives a text response
 *  5. If the response contains a TOOL_CALL: line → return finish_reason:"tool_calls"
 *     with a proper OpenAI `tool_calls` array so the client can execute the function
 *  6. Client executes the function, sends role:"tool" result back → repeat from step 2
 *  7. When Kimi produces a plain text answer → return finish_reason:"stop"
 */

import { PassThrough } from 'stream';
import logger from '@/lib/logger.ts';
import util from '@/lib/util.ts';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface OpenAITool {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, any>;
    };
}

// ─── System-prompt builder ──────────────────────────────────────────────────────

/**
 * Convert OpenAI tools array into a Kimi-readable instruction block.
 * Kimi understands natural language, so we describe every tool clearly
 * and give it a strict output format.
 */
export function buildToolsSystemPrompt(tools: OpenAITool[]): string {
    const toolDescriptions = tools.map(t => {
        const fn = t.function;
        const params = fn.parameters
            ? JSON.stringify(fn.parameters, null, 2)
            : '{}';
        return [
            `• ${fn.name}${fn.description ? ` — ${fn.description}` : ''}`,
            `  Parameters: ${JSON.stringify(fn.parameters?.properties || {})}`,
            `  Required: ${JSON.stringify(fn.parameters?.required || [])}`,
        ].join('\n');
    }).join('\n\n');

    return `[SYSTEM INSTRUCTION — HIGHEST PRIORITY — MUST FOLLOW EXACTLY]

You are operating in TOOL-CALLING MODE. You have access to real external tools/functions listed below.
You MUST use these tools to answer the user's question. Do NOT say you can't access external data — use the tools.

MANDATORY OUTPUT FORMAT:
When you need to call a tool, output EXACTLY this on its own line with no other text:
TOOL_CALL: {"name":"TOOL_NAME","args":{"param1":"value1",...}}

STRICT RULES:
1. Output ONLY the TOOL_CALL line. Nothing before it, nothing after it on that line.
2. Use valid JSON. Args must match the tool's parameter schema.
3. Call ONE tool at a time, then STOP. Wait for the tool result.
4. When you receive [TOOL RESULT], use it to answer the user.
5. NEVER say you cannot use tools or cannot access external data. USE THE TOOLS.
6. NEVER simulate or guess tool results. Always call the real tool.

AVAILABLE TOOLS:
${toolDescriptions}

[END SYSTEM INSTRUCTION]`;
}

// ─── Message transformer ────────────────────────────────────────────────────────

/**
 * Transform an OpenAI messages array so that Kimi can process it:
 *  - Inject tool instructions directly into the first user message AND as system message
 *    (dual injection maximises the chance Kimi follows the format, since the REST API
 *     collapses all messages into one text block)
 *  - Convert role:"tool" (tool results) into user messages Kimi can read
 *  - Convert assistant messages that previously held tool_calls back to text
 */
export function transformMessagesForToolBridge(messages: any[], tools: OpenAITool[]): any[] {
    const toolSystemPrompt = buildToolsSystemPrompt(tools);
    const transformed: any[] = [];

    let remainingMessages = [...messages];

    // Handle existing system message
    if (remainingMessages[0]?.role === 'system') {
        transformed.push({
            role: 'system',
            content: `${toolSystemPrompt}\n\n---\nAdditional context:\n${remainingMessages[0].content}`,
        });
        remainingMessages = remainingMessages.slice(1);
    } else {
        transformed.push({ role: 'system', content: toolSystemPrompt });
    }

    // Process remaining messages
    for (let i = 0; i < remainingMessages.length; i++) {
        const msg = remainingMessages[i];
        const isLastUserMessage = msg.role === 'user' && i === remainingMessages.length - 1;

        if (msg.role === 'tool') {
            // Tool result: convert to a user message with clear framing
            const toolName = msg.name || 'tool';
            const content = typeof msg.content === 'string'
                ? msg.content
                : JSON.stringify(msg.content);
            transformed.push({
                role: 'user',
                content: `[TOOL RESULT from ${toolName}]:\n${content}\n\nNow please continue and provide the final answer to the user based on this tool result.`,
            });
        } else if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
            // Previous assistant message that had tool_calls — convert back to TOOL_CALL: text
            const callLines = msg.tool_calls.map((tc: any) => {
                const args = typeof tc.function.arguments === 'string'
                    ? tc.function.arguments
                    : JSON.stringify(tc.function.arguments);
                return `TOOL_CALL: {"name":"${tc.function.name}","args":${args}}`;
            });
            transformed.push({
                role: 'assistant',
                content: callLines.join('\n'),
            });
        } else if (isLastUserMessage) {
            // Inject tool instructions directly into last user message for maximum effect.
            // This ensures that even when the REST API flattens all messages into one block,
            // the tool instructions are immediately visible right before the user's question.
            const userContent = typeof msg.content === 'string'
                ? msg.content
                : Array.isArray(msg.content)
                    ? msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
                    : String(msg.content);

            transformed.push({
                role: 'user',
                content: `${toolSystemPrompt}\n\nUSER REQUEST:\n${userContent}`,
            });
        } else {
            transformed.push(msg);
        }
    }

    return transformed;
}

// ─── Response parser ────────────────────────────────────────────────────────────

export interface ParsedToolCall {
    id: string;
    name: string;
    args: Record<string, any>;
    rawArgs: string;
}

/**
 * Scan text for one or more TOOL_CALL: lines.
 * Returns null when no tool calls are found (plain text answer).
 */
export function parseToolCallsFromText(text: string): ParsedToolCall[] | null {
    const calls: ParsedToolCall[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('TOOL_CALL:')) continue;

        const jsonStr = trimmed.slice('TOOL_CALL:'.length).trim();
        try {
            const parsed = JSON.parse(jsonStr);
            if (parsed && parsed.name) {
                const args = parsed.args || {};
                calls.push({
                    id: `call_${util.uuid().replace(/-/g, '').slice(0, 24)}`,
                    name: parsed.name,
                    args,
                    rawArgs: JSON.stringify(args),
                });
            }
        } catch {
            logger.warn(`[ToolBridge] Malformed TOOL_CALL JSON: ${jsonStr.slice(0, 200)}`);
        }
    }

    return calls.length > 0 ? calls : null;
}

/**
 * Strip TOOL_CALL lines from text (for clean display of non-tool content).
 */
export function stripToolCallLines(text: string): string {
    return text.split('\n')
        .filter(line => !line.trim().startsWith('TOOL_CALL:'))
        .join('\n')
        .trim();
}

// ─── Response formatters ────────────────────────────────────────────────────────

/**
 * Format an OpenAI tool_calls response from parsed calls.
 */
export function formatToolCallsResponse(
    toolCalls: ParsedToolCall[],
    model: string,
    completionId: string,
    thinkingText?: string,
): any {
    return {
        id: completionId,
        object: 'chat.completion',
        created: util.unixTimestamp(),
        model,
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: thinkingText ? stripToolCallLines(thinkingText) || null : null,
                    tool_calls: toolCalls.map(tc => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: tc.rawArgs,
                        },
                    })),
                },
                finish_reason: 'tool_calls',
            },
        ],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        },
    };
}

/**
 * Format a normal (non-tool) OpenAI response.
 */
export function formatNormalResponse(
    text: string,
    model: string,
    completionId: string,
): any {
    return {
        id: completionId,
        object: 'chat.completion',
        created: util.unixTimestamp(),
        model,
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: text,
                },
                finish_reason: 'stop',
            },
        ],
        usage: {
            prompt_tokens: 0,
            completion_tokens: text.length,
            total_tokens: text.length,
        },
    };
}

// ─── SSE stream formatter ───────────────────────────────────────────────────────

/**
 * Build an SSE stream that delivers a tool_calls chunk (for streaming mode).
 */
export function buildToolCallsStream(
    toolCalls: ParsedToolCall[],
    model: string,
    completionId: string,
): PassThrough {
    const stream = new PassThrough();

    const write = (obj: any) => stream.write(`data: ${JSON.stringify(obj)}\n\n`);

    // First chunk: role
    write({
        id: completionId,
        object: 'chat.completion.chunk',
        created: util.unixTimestamp(),
        model,
        choices: [{ index: 0, delta: { role: 'assistant', content: null }, finish_reason: null }],
    });

    // One chunk per tool call with the full arguments (OpenAI sends incremental,
    // but sending complete args in one chunk is fully compatible)
    for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];

        // tool_calls start chunk
        write({
            id: completionId,
            object: 'chat.completion.chunk',
            created: util.unixTimestamp(),
            model,
            choices: [{
                index: 0,
                delta: {
                    tool_calls: [{
                        index: i,
                        id: tc.id,
                        type: 'function',
                        function: { name: tc.name, arguments: '' },
                    }],
                },
                finish_reason: null,
            }],
        });

        // arguments chunk
        write({
            id: completionId,
            object: 'chat.completion.chunk',
            created: util.unixTimestamp(),
            model,
            choices: [{
                index: 0,
                delta: {
                    tool_calls: [{
                        index: i,
                        function: { arguments: tc.rawArgs },
                    }],
                },
                finish_reason: null,
            }],
        });
    }

    // Finish chunk
    write({
        id: completionId,
        object: 'chat.completion.chunk',
        created: util.unixTimestamp(),
        model,
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
    });

    stream.write('data: [DONE]\n\n');
    stream.end();

    return stream;
}
