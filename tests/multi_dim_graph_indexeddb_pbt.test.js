import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import 'fake-indexeddb/auto';

// Setup WBAP global before loading the module
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

await import('../modules/multi_dim_graph.js');

const MultiDimGraph = window.WBAP.MultiDimGraph;
const EDGE_DIMENSIONS = window.WBAP.EDGE_DIMENSIONS;

const DIMENSION_IDS = Object.values(EDGE_DIMENSIONS).map(d => d.id);

// -- Arbitraries --

const arbNodeType = fc.constantFrom('character', 'location', 'event', 'item', 'concept');

const arbNode = fc.record({
    id: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    label: fc.string({ minLength: 1, maxLength: 50 }),
    type: arbNodeType,
    content: fc.string({ maxLength: 200 }),
    isDynamic: fc.boolean(),
}).map(n => ({
    ...n,
    keys: [n.label],
    keysLower: [n.label.toLowerCase()],
    contentLower: n.content.toLowerCase(),
    multiDimImportance: {},
    energy: 0,
    stateHistory: [],
    createdAt: Date.now(),
}));

const arbDimensionEntry = fc.record({
    dimensionId: fc.constantFrom(...DIMENSION_IDS),
    strength: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
});

/**
 * Generate a non-empty graph state with unique node IDs.
 */
const arbNonEmptyGraphState = fc.array(arbNode, { minLength: 1, maxLength: 8 })
    .map(nodes => {
        const seen = new Set();
        return nodes.filter(n => {
            if (seen.has(n.id)) return false;
            seen.add(n.id);
            return true;
        });
    })
    .filter(nodes => nodes.length >= 1);

/**
 * Generate two distinct character IDs.
 */
const arbTwoCharacterIds = fc.tuple(
    fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
).filter(([a, b]) => a !== b);

/**
 * Helper: populate graph with given nodes.
 */
function populateGraph(nodes) {
    MultiDimGraph.clear();
    MultiDimGraph.dynamicNodes = new Map();
    MultiDimGraph.dynamicEdges = [];
    for (const node of nodes) {
        MultiDimGraph.nodes.set(node.id, { ...node });
    }
    MultiDimGraph.buildIndices();
    MultiDimGraph.calculateMultiDimImportance();
}

/**
 * Helper: clean up IndexedDB between runs.
 */
async function clearGraphDB() {
    try {
        const db = await MultiDimGraph.openGraphDB();
        const tx = db.transaction('graphs', 'readwrite');
        tx.objectStore('graphs').clear();
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (_) { /* ignore */ }
}

describe('Feature: llm-driven-graph-retrieval, Property 5: 角色图谱存储隔离', () => {
    beforeEach(async () => {
        MultiDimGraph.clear();
        MultiDimGraph.dynamicNodes = new Map();
        MultiDimGraph.dynamicEdges = [];
        await clearGraphDB();
    });

    /**
     * **Validates: Requirements 6.3**
     *
     * For any two distinct character IDs with their own graph data,
     * saving each character's graph then loading one character's graph
     * SHALL only return that character's nodes, not the other's.
     */
    it('loading a character graph returns only that character\'s data, not another\'s', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbTwoCharacterIds,
                arbNonEmptyGraphState,
                arbNonEmptyGraphState,
                async ([charIdA, charIdB], nodesA, nodesB) => {
                    await clearGraphDB();

                    // Save character A's graph
                    populateGraph(nodesA);
                    await MultiDimGraph.saveToIndexedDB(charIdA);
                    const savedNodeIdsA = new Set(nodesA.map(n => n.id));
                    const savedCountA = nodesA.length;

                    // Save character B's graph
                    populateGraph(nodesB);
                    await MultiDimGraph.saveToIndexedDB(charIdB);
                    const savedNodeIdsB = new Set(nodesB.map(n => n.id));
                    const savedCountB = nodesB.length;

                    // Load character A and verify isolation
                    MultiDimGraph.clear();
                    MultiDimGraph.dynamicNodes = new Map();
                    MultiDimGraph.dynamicEdges = [];
                    const loadedA = await MultiDimGraph.loadFromIndexedDB(charIdA);
                    expect(loadedA).toBe(true);
                    expect(MultiDimGraph.nodes.size).toBe(savedCountA);
                    for (const [nodeId] of MultiDimGraph.nodes) {
                        expect(savedNodeIdsA.has(nodeId)).toBe(true);
                    }

                    // Load character B and verify isolation
                    MultiDimGraph.clear();
                    MultiDimGraph.dynamicNodes = new Map();
                    MultiDimGraph.dynamicEdges = [];
                    const loadedB = await MultiDimGraph.loadFromIndexedDB(charIdB);
                    expect(loadedB).toBe(true);
                    expect(MultiDimGraph.nodes.size).toBe(savedCountB);
                    for (const [nodeId] of MultiDimGraph.nodes) {
                        expect(savedNodeIdsB.has(nodeId)).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
