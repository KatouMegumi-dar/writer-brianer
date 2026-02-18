/**
 * Property 3: formatGraphResults 包含必要字段
 *
 * Feature: llm-driven-graph-retrieval, Property 3: formatGraphResults 包含必要字段
 *
 * **Validates: Requirements 4.4**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

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

const { formatGraphResults } = window.WBAP.FunctionCalling;

/** Arbitrary for a single graph node with required fields */
const nodeArb = fc.record({
    label: fc.string({ minLength: 1, maxLength: 50 }),
    type: fc.string({ minLength: 1, maxLength: 30 }),
    energy: fc.double({ min: 0, max: 1, noNaN: true }),
});

describe('Feature: llm-driven-graph-retrieval, Property 3: formatGraphResults 包含必要字段', () => {
    /**
     * **Validates: Requirements 4.4**
     *
     * For any non-empty array of nodes with label, type, and energy,
     * formatGraphResults output SHALL contain each node's label, type, and energy value.
     */
    it('output contains label, type, and energy for every node (with sufficient maxLength)', () => {
        fc.assert(
            fc.property(
                fc.array(nodeArb, { minLength: 1, maxLength: 20 }),
                (nodes) => {
                    // Use a large maxLength to avoid truncation
                    const output = formatGraphResults(nodes, 1_000_000);

                    for (const node of nodes) {
                        expect(output).toContain(node.label);
                        expect(output).toContain(node.type);
                        // Energy is formatted as integer percentage
                        const energyPct = ((node.energy || 0) * 100).toFixed(0);
                        expect(output).toContain(`${energyPct}%`);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
