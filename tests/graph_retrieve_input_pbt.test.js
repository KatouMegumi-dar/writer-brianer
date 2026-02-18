/**
 * Property 2: graph_retrieve 工具接受有效输入
 *
 * Feature: llm-driven-graph-retrieval, Property 2: graph_retrieve 工具接受有效输入
 *
 * **Validates: Requirements 4.2, 4.6**
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

// Setup WBAP global before loading module
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

// MultiDimGraph stub (empty graph — executeGraphRetrieve checks nodes.size)
window.WBAP.MultiDimGraph = {
    nodes: new Map(),
    smartRetrieve: async () => ({ nodes: [] }),
};

await import('../modules/function_calling.js');

const { executeGraphRetrieve } = window.WBAP.FunctionCalling;

describe('Feature: llm-driven-graph-retrieval, Property 2: graph_retrieve 工具接受有效输入', () => {
    beforeEach(() => {
        // Reset to empty graph each run
        window.WBAP.MultiDimGraph.nodes = new Map();
    });

    /**
     * **Validates: Requirements 4.2, 4.6**
     *
     * For any non-empty, non-whitespace-only query string,
     * executeGraphRetrieve SHALL return { success: true }.
     * For empty or whitespace-only strings, SHALL return { success: false }.
     */
    it('returns success:true for non-empty non-whitespace queries, success:false otherwise', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 0, maxLength: 200 }),
                async (query) => {
                    const result = await executeGraphRetrieve({ arguments: { query } });

                    // Determine if query is empty/whitespace using the same Unicode-aware regex
                    const whitespaceRegex = /^[\s\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]*$/;
                    const isEmpty = !query || typeof query !== 'string' || whitespaceRegex.test(query);

                    if (isEmpty) {
                        expect(result.success).toBe(false);
                    } else {
                        expect(result.success).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
