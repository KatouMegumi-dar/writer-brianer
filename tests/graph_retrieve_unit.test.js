/**
 * graph_retrieve 单元测试
 *
 * Feature: llm-driven-graph-retrieval
 * Requirements: 4.1, 4.5, 4.6
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Setup WBAP global before loading module
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

window.WBAP.MultiDimGraph = {
    nodes: new Map(),
    smartRetrieve: async () => ({ nodes: [] }),
};

await import('../modules/function_calling.js');

const {
    getGraphToolDefinition,
    executeGraphRetrieve,
    formatGraphResults,
    getPedsaToolDefinition,
} = window.WBAP.FunctionCalling;

// ============================================================================
// Helpers
// ============================================================================

function validateOpenAIToolSchema(tool) {
    const errors = [];
    if (tool.type !== 'function') errors.push(`Expected type "function", got "${tool.type}"`);
    if (!tool.function || typeof tool.function !== 'object') {
        errors.push('Missing or invalid "function" object');
        return { valid: false, errors };
    }
    const fn = tool.function;
    if (typeof fn.name !== 'string' || fn.name.length === 0) errors.push('Function must have a non-empty "name" string');
    if (typeof fn.description !== 'string' || fn.description.length === 0) errors.push('Function must have a non-empty "description" string');
    if (!fn.parameters || typeof fn.parameters !== 'object') {
        errors.push('Function must have a "parameters" object');
        return { valid: false, errors };
    }
    const params = fn.parameters;
    if (params.type !== 'object') errors.push(`Parameters type must be "object", got "${params.type}"`);
    if (!params.properties || typeof params.properties !== 'object') errors.push('Parameters must have a "properties" object');
    if (params.required !== undefined && !Array.isArray(params.required)) errors.push('"required" must be an array');
    return { valid: errors.length === 0, errors };
}

// ============================================================================
// Tests
// ============================================================================

describe('graph_retrieve unit tests', () => {
    beforeEach(() => {
        window.WBAP.MultiDimGraph = {
            nodes: new Map(),
            smartRetrieve: async () => ({ nodes: [] }),
        };
    });

    // Requirement 4.1: getGraphToolDefinition returns valid OpenAI schema
    describe('getGraphToolDefinition', () => {
        it('returns a valid OpenAI function calling tool schema', () => {
            const tool = getGraphToolDefinition();
            const { valid, errors } = validateOpenAIToolSchema(tool);
            expect(valid, `Schema errors: ${errors.join(', ')}`).toBe(true);
        });

        it('has name "graph_retrieve" and requires "query" parameter', () => {
            const tool = getGraphToolDefinition();
            expect(tool.function.name).toBe('graph_retrieve');
            expect(tool.function.parameters.required).toContain('query');
            expect(tool.function.parameters.properties.query.type).toBe('string');
        });

        it('has optional top_k parameter with integer type', () => {
            const tool = getGraphToolDefinition();
            const topK = tool.function.parameters.properties.top_k;
            expect(topK).toBeDefined();
            expect(topK.type).toBe('integer');
        });
    });

    // Requirement 4.6: empty graph returns empty result hint (not error)
    describe('executeGraphRetrieve - empty graph', () => {
        it('returns success:true with empty results and a message when graph is empty', async () => {
            const result = await executeGraphRetrieve({ arguments: { query: 'test query' } });
            expect(result.success).toBe(true);
            expect(result.results).toEqual([]);
            expect(result.message).toBeTruthy();
        });

        it('returns success:true with message when MultiDimGraph is null', async () => {
            window.WBAP.MultiDimGraph = null;
            const result = await executeGraphRetrieve({ arguments: { query: 'test' } });
            expect(result.success).toBe(true);
            expect(result.results).toEqual([]);
        });
    });

    // Requirement 4.5: callAgentWithTools tools array contains both tools
    describe('callAgentWithTools tools array', () => {
        it('getPedsaToolDefinition and getGraphToolDefinition both exist and have distinct names', () => {
            const pedsa = getPedsaToolDefinition();
            const graph = getGraphToolDefinition();
            expect(pedsa.function.name).toBe('pedsa_retrieve');
            expect(graph.function.name).toBe('graph_retrieve');
            expect(pedsa.function.name).not.toBe(graph.function.name);
        });
    });

    // Requirement 4.4: formatGraphResults maxLength truncation
    describe('formatGraphResults maxLength truncation', () => {
        it('truncates output when it exceeds maxLength', () => {
            const nodes = Array.from({ length: 50 }, (_, i) => ({
                label: `Entity_${i}`,
                type: 'character',
                energy: 0.9,
                content: 'A'.repeat(200),
            }));
            const result = formatGraphResults(nodes, 500);
            expect(result.length).toBeLessThanOrEqual(500);
        });

        it('includes truncation indicator when nodes are cut off', () => {
            const nodes = Array.from({ length: 20 }, (_, i) => ({
                label: `LongEntity_${i}`,
                type: 'location',
                energy: 0.5,
                content: 'B'.repeat(300),
            }));
            // Use enough space for header + 1 node + truncation message
            const result = formatGraphResults(nodes, 600);
            expect(result).toContain('truncated');
        });

        it('returns empty message for null/empty input', () => {
            expect(formatGraphResults(null)).toContain('empty');
            expect(formatGraphResults([])).toContain('empty');
        });
    });
});
