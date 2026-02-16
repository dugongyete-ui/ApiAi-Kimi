/**
 * Connect RPC Protocol Types
 */

export interface ConnectConfig {
    baseUrl: string;
    authToken?: string;
    deviceId?: string;
    sessionId?: string;
    userId?: string;
}

export interface ChatOptions {
    scenario?: 'SCENARIO_K2' | 'SCENARIO_SEARCH' | 'SCENARIO_RESEARCH' | 'SCENARIO_K1';
    thinking?: boolean;
    stream?: boolean;
    chatId?: string;
}

export interface MessageBlock {
    message_id: string;
    text: {
        content: string;
    };
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    blocks: MessageBlock[];
    scenario: string;
}

export interface ChatRequest {
    scenario: string;
    message: ChatMessage;
    options: {
        thinking: boolean;
    };
    chatId?: string;
}

export interface ConnectMessage {
    op?: 'set' | 'append';
    eventOffset?: number;
    mask?: string;
    chat?: {
        id: string;
        name: string;
        createTime?: string;
    };
    message?: {
        id: string;
        parentId?: string;
        role: string;
        status: string;
        scenario?: string;
        createTime?: string;
    };
    block?: {
        id: string;
        parentId?: string;
        text?: {
            content: string;
        };
        createTime?: string;
    };
    heartbeat?: {};
    done?: {};
}

export interface TextResponse {
    text: string;
    chatId?: string;
    messageId?: string;
}
