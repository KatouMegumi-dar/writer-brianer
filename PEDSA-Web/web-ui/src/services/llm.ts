export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface LLMConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    extractorBaseUrl?: string;
    extractorApiKey?: string;
    extractorModel?: string;
    useSeparateExtractor?: boolean;
    contextWindow?: number; // Context window in rounds
    stream?: boolean; // Enable/disable streaming
}

export async function fetchOpenAIModels(config: LLMConfig): Promise<string[]> {
    if (!config.baseUrl) {
        throw new Error("Base URL cannot be empty");
    }
    
    // Normalize URL: remove trailing slash and ensure /v1 (if not present, though users might provide full path)
    // Standard OpenAI compatible endpoints usually end with /v1
    // But /models endpoint is usually relative to base.
    // If user provides "http://localhost:11434/v1", models is at ".../v1/models"
    
    const baseUrl = config.baseUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/models`;

    try {
        const headers: Record<string, string> = {
             'Content-Type': 'application/json'
        };
        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to fetch models: ${response.status} - ${text}`);
        }

        const data = await response.json();
        // OpenAI format: { object: "list", data: [{ id: "model-name", ... }] }
        if (data.data && Array.isArray(data.data)) {
            return data.data.map((m: any) => m.id);
        }
        return [];
    } catch (e) {
        console.error("Fetch Models Error:", e);
        throw e;
    }
}

export interface LLMService {
    chat(messages: ChatMessage[]): Promise<string>;
    chatStream?(messages: ChatMessage[], onChunk: (chunk: string) => void): Promise<void>;
    extract?(messages: ChatMessage[]): Promise<string>;
    updateConfig?(config: LLMConfig): void;
}

export class MockLLMService implements LLMService {
    async chat(messages: ChatMessage[]): Promise<string> {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const lastUserMessage = [...messages].reverse().find((m: ChatMessage) => m.role === 'user')?.content || "";
        
        return `[Mock回复] 我收到了你的消息: "${lastUserMessage}"。\n\n这是一个来自 Mock 服务的占位回复。请在设置中配置真实的 OpenAI 兼容接口以启用实际对话能力。`;
    }

    async chatStream(messages: ChatMessage[], onChunk: (chunk: string) => void): Promise<void> {
        const fullResponse = await this.chat(messages);
        const chunks = fullResponse.split('');
        for (const chunk of chunks) {
            onChunk(chunk);
            await new Promise(resolve => setTimeout(resolve, 20)); // Simulate typing speed
        }
    }
}

export class OpenAILLMService implements LLMService {
    private config: LLMConfig;

    constructor(config: LLMConfig) {
        this.config = config;
    }

    updateConfig(config: LLMConfig) {
        this.config = config;
    }

    async chat(messages: ChatMessage[]): Promise<string> {
        if (!this.config.apiKey || !this.config.baseUrl) {
            throw new Error("API Key or Base URL is missing in configuration.");
        }

        const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify({
                    model: this.config.model || 'gpt-3.5-turbo',
                    messages: messages,
                    stream: false
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || "(No response content)";
        } catch (e) {
            console.error("LLM Request Failed:", e);
            throw e;
        }
    }

    async chatStream(messages: ChatMessage[], onChunk: (chunk: string) => void): Promise<void> {
        if (!this.config.apiKey || !this.config.baseUrl) {
            throw new Error("API Key or Base URL is missing in configuration.");
        }

        const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify({
                    model: this.config.model || 'gpt-3.5-turbo',
                    messages: messages,
                    stream: true
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error: ${response.status} - ${errorText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("Failed to get response reader");

            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const cleanLine = line.trim().replace(/^data: /, "");
                    if (cleanLine === "" || cleanLine === "[DONE]") continue;

                    try {
                        const parsed = JSON.parse(cleanLine);
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content) {
                            onChunk(content);
                        }
                    } catch (e) {
                        console.warn("Failed to parse stream chunk", e, cleanLine);
                    }
                }
            }
        } catch (e) {
            console.error("LLM Stream Request Failed:", e);
            throw e;
        }
    }
}

// Factory to manage the active service instance
export class LLMServiceManager implements LLMService {
    private activeService: LLMService;
    private extractorService: LLMService;

    constructor() {
        this.activeService = new MockLLMService();
        this.extractorService = new MockLLMService();

        const storedConfig = localStorage.getItem('pedsa_llm_config');
        if (storedConfig) {
            try {
                const config = JSON.parse(storedConfig);
                this.applyConfig(config);
            } catch {
                // Keep mock services
            }
        }
    }

    private applyConfig(config: LLMConfig) {
        this.activeService = new OpenAILLMService(config);

        if (config.useSeparateExtractor && config.extractorBaseUrl && config.extractorApiKey && config.extractorModel) {
            this.extractorService = new OpenAILLMService({
                baseUrl: config.extractorBaseUrl,
                apiKey: config.extractorApiKey,
                model: config.extractorModel
            });
        } else {
            this.extractorService = this.activeService;
        }
    }

    async chat(messages: ChatMessage[]): Promise<string> {
        return this.activeService.chat(messages);
    }

    async chatStream(messages: ChatMessage[], onChunk: (chunk: string) => void): Promise<void> {
        if (this.activeService.chatStream) {
            return this.activeService.chatStream(messages, onChunk);
        } else {
            const response = await this.activeService.chat(messages);
            onChunk(response);
        }
    }

    async extract(messages: ChatMessage[]): Promise<string> {
        return this.extractorService.chat(messages);
    }

    updateConfig(config: LLMConfig) {
        this.applyConfig(config);
        localStorage.setItem('pedsa_llm_config', JSON.stringify(config));
    }

    resetToMock() {
        this.activeService = new MockLLMService();
        this.extractorService = new MockLLMService();
        localStorage.removeItem('pedsa_llm_config');
    }
}

export const llmService = new LLMServiceManager();
