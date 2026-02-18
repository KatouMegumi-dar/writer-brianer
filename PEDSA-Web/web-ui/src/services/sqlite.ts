import SqliteWorker from '../workers/sqlite.worker.ts?worker';

// --- Type Definitions ---
interface WorkerResponse {
    id: string;
    result?: any;
    error?: string;
    type?: string; // For init messages
}

// --- Worker Instance & Request Handling ---
let worker: Worker | null = null;
let initPromise: Promise<void> | null = null;
const pendingRequests = new Map<string, { resolve: (val: any) => void, reject: (err: any) => void }>();

const getWorker = () => {
    if (!worker) {
        worker = new SqliteWorker();
        worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
            const { id, result, error, type } = e.data;

            // Handle Init Messages
            if (type === 'INIT_SUCCESS') {
                // Init promise is handled separately but this log is useful
                console.log('SQLite Worker Initialized Successfully');
                return;
            }
            if (type === 'INIT_ERROR') {
                console.error('SQLite Worker Init Error:', error);
                return;
            }

            // Handle Request Responses
            const resolver = pendingRequests.get(id);
            if (resolver) {
                if (error) resolver.reject(new Error(error));
                else resolver.resolve(result);
                pendingRequests.delete(id);
            }
        };
    }
    return worker;
};

const postMessageAsync = <T>(action: string, payload: any = {}): Promise<T> => {
    return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        pendingRequests.set(id, { resolve, reject });
        getWorker().postMessage({ id, action, ...payload });
    });
};

// --- Initialization ---

export const initSQLite = async () => {
    if (initPromise) return initPromise;

    initPromise = new Promise((resolve, reject) => {
        const w = getWorker();
        // Hook into the first response to resolve init
        const tempHandler = (e: MessageEvent<WorkerResponse>) => {
            if (e.data.type === 'INIT_SUCCESS') {
                w.removeEventListener('message', tempHandler);
                // Restore default handler behavior for future messages if we overwrote it,
                // but actually we used addEventListener logic here if we were careful.
                // Since we assigned `onmessage` above, we need to be careful.
                // Let's use the `postMessageAsync` pattern even for init to keep it clean?
                // Actually init is special because it might not have a request ID if it auto-starts.
                // But in our worker we check for `action === 'init'`.
                resolve();
            } else if (e.data.type === 'INIT_ERROR') {
                w.removeEventListener('message', tempHandler);
                reject(new Error(e.data.error));
            }
        };
        // We need to add this listener *before* sending init
        // But since we use `worker.onmessage = ...` above, we should modify that handler to handle INIT_SUCCESS.
        // Let's rely on `postMessageAsync`'s resolver if we can, but `init` in worker sends a separate message type.
        // Let's just use `postMessageAsync('init')` and have the worker reply to that ID.
        // Wait, the worker sends `postMessage({ type: 'INIT_SUCCESS' })` without ID in my previous code.
        // Let's fix the worker code slightly or handle it here.
        // Current Worker implementation:
        // if (action === 'init') { await init(); return; } -> init() sends type: 'INIT_SUCCESS'
        // It does NOT send { id, result } for init action.
        
        // Let's wrap the specific Init listener:
        const originalOnMessage = w.onmessage;
        w.onmessage = (e) => {
            if (e.data.type === 'INIT_SUCCESS') {
                w.onmessage = originalOnMessage; // Restore
                resolve();
            } else if (e.data.type === 'INIT_ERROR') {
                w.onmessage = originalOnMessage; // Restore
                reject(new Error(e.data.error));
            } else if (originalOnMessage) {
                originalOnMessage.call(w, e);
            }
        };
        
        w.postMessage({ id: 'init-seq', action: 'init' });
    });

    // Bridge for WASM (Async Exec Wrapper)
    (window as any).pedsa_sqlite_exec = async (sql: string) => {
        try {
            return await postMessageAsync('exec', { sql });
        } catch (e) {
            console.error("SQLite Exec Error (Worker):", e);
            throw e;
        }
    };

    (window as any).pedsa_sqlite_init = async () => {
        console.log("PEDSA requested SQLite init via WASM bridge (already initialized in worker)");
        return true;
    };

    return initPromise;
};

// --- Graph Operations ---

export const fetchGraphData = async () => {
    await initSQLite();
    try {
        const nodes: any[] = await postMessageAsync('exec', { sql: "SELECT * FROM nodes" });
        const edges: any[] = await postMessageAsync('exec', { sql: "SELECT * FROM edges" });

        // Transform to ECharts format
        const echartsNodes = nodes.map((n: any) => ({
            id: n.hash,
            name: n.data || n.hash,
            symbolSize: n.type === 0 ? 40 : 15,
            category: n.type,
            value: n.activation
        }));

        const echartsLinks = edges.map((e: any) => ({
            source: e.source,
            target: e.target,
            value: e.weight,
            // Disable arrow for bidirectional edges (Equality=1, Inhibition=255)
            symbol: (e.type === 1 || e.type === 255) ? ['none', 'none'] : ['none', 'arrow'],
            lineStyle: {
                // Map edge type to visual style
                // Type 1: Equality (Green, Solid)
                // Type 255: Inhibition (Red, Dashed)
                // Type 0: Representation (Default/Blue, Solid)
                color: e.type === 1 ? '#22c55e' : (e.type === 255 ? '#ef4444' : '#94a3b8'),
                type: e.type === 255 ? 'dashed' : 'solid',
                width: e.type === 1 ? 2 : 1,
                curveness: e.type === 1 ? 0 : 0.3
            }
        }));

        return { nodes: echartsNodes, links: echartsLinks };
    } catch (e) {
        console.error("Fetch Graph Data Error:", e);
        return { nodes: [], links: [] };
    }
};

export const saveGraphNode = async (hash: string, type: number, activation: number, data: any) => {
    await initSQLite();
    // Ensure data is a string (primitive), or stringify if object
    const safeData = typeof data === 'object' ? JSON.stringify(data) : String(data);
    await postMessageAsync('exec', {
        sql: "INSERT OR REPLACE INTO nodes (hash, type, activation, data) VALUES (?, ?, ?, ?)",
        bind: [String(hash), Number(type), Number(activation), safeData]
    });
};

export const saveGraphEdge = async (source: string, target: string, weight: number, type: number) => {
    await initSQLite();
    await postMessageAsync('exec', {
        sql: "INSERT OR REPLACE INTO edges (source, target, weight, type) VALUES (?, ?, ?, ?)",
        bind: [String(source), String(target), Number(weight), Number(type)]
    });
};

export const clearDatabase = async () => {
    await initSQLite();
    try {
        await postMessageAsync('exec', { sql: "BEGIN TRANSACTION;" });
        await postMessageAsync('exec', { sql: "DELETE FROM nodes;" });
        await postMessageAsync('exec', { sql: "DELETE FROM edges;" });
        await postMessageAsync('exec', { sql: "COMMIT;" });
        console.log("SQLite database cleared");
    } catch (e) {
        console.error("Clear Database Error:", e);
        await postMessageAsync('exec', { sql: "ROLLBACK;" });
        throw e;
    }
};

// --- Conversation Management ---

export interface Conversation {
    id: string;
    title: string;
    updated_at: number;
}

export interface Message {
    id?: number;
    conversation_id: string;
    role: string;
    content: string;
    source_nodes?: string;
    parent_id?: number;
    extraction_raw?: string;
    full_prompt?: string;
    created_at?: number;
}

export const getConversations = async (): Promise<Conversation[]> => {
    await initSQLite();
    try {
        return await postMessageAsync('exec', {
            sql: "SELECT * FROM conversations ORDER BY updated_at DESC"
        });
    } catch (e) {
        console.error("Get Conversations Error:", e);
        return [];
    }
};

export const createConversation = async (title: string = "New Chat"): Promise<string> => {
    await initSQLite();
    const id = crypto.randomUUID();

    // Find default persona
    const defaultPersona: any[] = await postMessageAsync('exec', {
        sql: "SELECT id FROM personas WHERE is_default = 1 LIMIT 1"
    });

    const personaId = defaultPersona[0]?.id || null;

    await postMessageAsync('exec', {
        sql: "INSERT INTO conversations (id, title, persona_id) VALUES (?, ?, ?)",
        bind: [id, title, personaId]
    });
    return id;
};

export const deleteConversation = async (id: string) => {
    await initSQLite();
    await postMessageAsync('exec', {
        sql: "DELETE FROM conversations WHERE id = ?",
        bind: [id]
    });
};

export const updateConversationTitle = async (id: string, title: string) => {
    await initSQLite();
    await postMessageAsync('exec', {
        sql: "UPDATE conversations SET title = ?, updated_at = unixepoch() WHERE id = ?",
        bind: [title, id]
    });
};

// --- Message Management ---

export const getMessages = async (conversationId: string): Promise<Message[]> => {
    await initSQLite();
    try {
        return await postMessageAsync('exec', {
            sql: "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
            bind: [conversationId]
        });
    } catch (e) {
        console.error("Get Messages Error:", e);
        return [];
    }
};

export const addMessage = async (conversationId: string, role: string, content: string, sourceNodes: string[] = [], parentId: number | null = null, fullPrompt: string | null = null) => {
    await initSQLite();
    const sourceNodesJson = JSON.stringify(sourceNodes);

    await postMessageAsync('exec', {
        sql: "INSERT INTO messages (conversation_id, role, content, source_nodes, parent_id, full_prompt) VALUES (?, ?, ?, ?, ?, ?)",
        bind: [conversationId, role, content, sourceNodesJson, parentId, fullPrompt]
    });
    
    // Return the inserted message (need to fetch latest or return ID logic if needed, but simple insert is OK for now)
    // Actually frontend might need the ID. 
    // SQLite WASM exec resultRows doesn't return lastInsertRowid easily unless we ask.
    // Let's do a SELECT or use RETURNING if SQLite version supports it (3.35+).
    // Assuming SQLite 3.40+ (WASM build usually is new).
    try {
         const res: any[] = await postMessageAsync('exec', {
            sql: "SELECT id, created_at FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1",
            bind: [conversationId]
        });
        return res[0];
    } catch (e) {
        return null;
    }
};

export const updateMessageSourceNodes = async (messageId: number, sourceNodes: any[]) => {
    await initSQLite();
    const json = JSON.stringify(sourceNodes);
    await postMessageAsync('exec', {
        sql: "UPDATE messages SET source_nodes = ? WHERE id = ?",
        bind: [json, messageId]
    });
};

export const updateMessageExtractionRaw = async (messageId: number, raw: string) => {
    await initSQLite();
    await postMessageAsync('exec', {
        sql: "UPDATE messages SET extraction_raw = ? WHERE id = ?",
        bind: [raw, messageId]
    });
};

export const deleteMessageTransaction = async (messageId: number) => {
    await initSQLite();
    await postMessageAsync('exec', {
        sql: "DELETE FROM messages WHERE id = ?",
        bind: [messageId]
    });
};

// --- Persona Management ---

export interface Persona {
    id?: number;
    name: string;
    prompt: string;
    is_default: boolean | number;
    created_at?: number;
}

export const getPersonas = async (): Promise<Persona[]> => {
    await initSQLite();
    try {
        return await postMessageAsync('exec', {
            sql: "SELECT * FROM personas ORDER BY created_at DESC"
        });
    } catch (e) {
        return [];
    }
};

export const savePersona = async (persona: Persona) => {
    await initSQLite();
    
    // If setting as default, unset others first to ensure single default
    if (persona.is_default) {
         await postMessageAsync('exec', {
            sql: "UPDATE personas SET is_default = 0 WHERE is_default = 1"
        });
    }

    const isDefaultInt = persona.is_default ? 1 : 0;

    if (persona.id) {
        await postMessageAsync('exec', {
            sql: "UPDATE personas SET name = ?, prompt = ?, is_default = ? WHERE id = ?",
            bind: [persona.name, persona.prompt, isDefaultInt, persona.id]
        });
    } else {
        await postMessageAsync('exec', {
            sql: "INSERT INTO personas (name, prompt, is_default) VALUES (?, ?, ?)",
            bind: [persona.name, persona.prompt, isDefaultInt]
        });
    }
};

export const deletePersona = async (id: number) => {
    await initSQLite();
    await postMessageAsync('exec', {
        sql: "DELETE FROM personas WHERE id = ?",
        bind: [id]
    });
}; 
