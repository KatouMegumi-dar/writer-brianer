import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

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
    emotionalState: fc.constantFrom('positive', 'negative', 'neutral', null),
    spatialInfo: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 })),
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
 * Generate a valid graph state: unique nodes + edges referencing those nodes.
 */
const arbGraphState = fc.record({
    nodes: fc.array(arbNode, { minLength: 0, maxLength: 15 }),
}).chain(({ nodes }) => {
    // Deduplicate node IDs
    const seen = new Set();
    const uniqueNodes = nodes.filter(n => {
        if (seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
    });
    const nodeIds = uniqueNodes.map(n => n.id);

    // Only generate edges if we have at least 2 nodes
    const arbEdge = nodeIds.length >= 2
        ? fc.record({
            source: fc.constantFrom(...nodeIds),
            target: fc.constantFrom(...nodeIds),
            dimensions: fc.array(arbDimensionEntry, { minLength: 1, maxLength: 3 }),
            weight: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
            description: fc.string({ maxLength: 50 }),
            isDynamic: fc.boolean(),
        }).filter(e => e.source !== e.target)
          .map(e => ({ ...e, id: `${e.source}->${e.target}`, createdAt: Date.now() }))
        : fc.constant(null);

    const arbEdges = nodeIds.length >= 2
        ? fc.array(arbEdge, { minLength: 0, maxLength: 10 })
        : fc.constant([]);

    return arbEdges.map(edges => {
        const validEdges = edges.filter(Boolean);
        // Deduplicate edge IDs
        const edgeSeen = new Set();
        const uniqueEdges = validEdges.filter(e => {
            if (edgeSeen.has(e.id)) return false;
            edgeSeen.add(e.id);
            return true;
        });

        // Split into static/dynamic
        const dynamicNodes = uniqueNodes.filter(n => n.isDynamic);
        const dynamicEdges = uniqueEdges.filter(e => e.isDynamic);

        return { nodes: uniqueNodes, edges: uniqueEdges, dynamicNodes, dynamicEdges };
    });
});

describe('Feature: llm-driven-graph-retrieval, Property 1: 图谱序列化往返一致性', () => {
    beforeEach(() => {
        MultiDimGraph.clear();
        MultiDimGraph.dynamicNodes = new Map();
        MultiDimGraph.dynamicEdges = [];
    });

    /**
     * **Validates: Requirements 6.5, 6.6, 7.1, 7.2, 7.3, 7.4**
     *
     * For any valid graph state, serialize() → deserialize() must preserve:
     * - Node count
     * - Edge count
     * - Dynamic node count
     * - Dynamic edge count
     * - Dimension index correctness
     * - Node index correctness (in/out edges)
     */
    it('serialize→deserialize roundtrip preserves node count, edge count, and indices', () => {
        fc.assert(
            fc.property(arbGraphState, (state) => {
                // -- Populate graph --
                MultiDimGraph.clear();
                MultiDimGraph.dynamicNodes = new Map();
                MultiDimGraph.dynamicEdges = [];

                for (const node of state.nodes) {
                    MultiDimGraph.nodes.set(node.id, { ...node });
                }

                // Edges need real dimension object references for serialize to work
                const dimById = {};
                Object.values(EDGE_DIMENSIONS).forEach(d => { dimById[d.id] = d; });

                for (const edge of state.edges) {
                    const liveEdge = {
                        ...edge,
                        dimensions: edge.dimensions.map(d => ({
                            dimension: dimById[d.dimensionId] || EDGE_DIMENSIONS.THEMATIC,
                            strength: d.strength,
                        })),
                    };
                    MultiDimGraph.edges.push(liveEdge);
                }

                for (const node of state.dynamicNodes) {
                    MultiDimGraph.dynamicNodes.set(node.id, MultiDimGraph.nodes.get(node.id));
                }

                for (const edge of state.dynamicEdges) {
                    const liveEdge = MultiDimGraph.edges.find(e => e.id === edge.id);
                    if (liveEdge) MultiDimGraph.dynamicEdges.push(liveEdge);
                }

                MultiDimGraph.buildIndices();
                MultiDimGraph.calculateMultiDimImportance();

                // Capture pre-roundtrip counts
                const origNodeCount = MultiDimGraph.nodes.size;
                const origEdgeCount = MultiDimGraph.edges.length;
                const origDynNodeCount = MultiDimGraph.dynamicNodes.size;
                const origDynEdgeCount = MultiDimGraph.dynamicEdges.length;

                // -- Roundtrip --
                const serialized = MultiDimGraph.serialize();
                MultiDimGraph.deserialize(serialized);

                // -- Assertions --
                // Node count preserved
                expect(MultiDimGraph.nodes.size).toBe(origNodeCount);
                // Edge count preserved
                expect(MultiDimGraph.edges.length).toBe(origEdgeCount);
                // Dynamic data preserved
                expect(MultiDimGraph.dynamicNodes.size).toBe(origDynNodeCount);
                expect(MultiDimGraph.dynamicEdges.length).toBe(origDynEdgeCount);

                // Dimension index rebuilt correctly
                for (const edge of MultiDimGraph.edges) {
                    for (const d of edge.dimensions) {
                        // Each dimension reference should be a real EDGE_DIMENSIONS object
                        expect(d.dimension).toBeDefined();
                        expect(typeof d.dimension.id).toBe('string');
                        expect(DIMENSION_IDS).toContain(d.dimension.id);

                        // The dimension index should contain this edge
                        const dimEdges = MultiDimGraph.dimensionIndex.get(d.dimension.id);
                        expect(dimEdges).toBeDefined();
                        expect(dimEdges).toContain(edge);
                    }
                }

                // Node index rebuilt correctly
                for (const [nodeId] of MultiDimGraph.nodes) {
                    const idx = MultiDimGraph.nodeIndex.get(nodeId);
                    expect(idx).toBeDefined();
                    expect(Array.isArray(idx.inEdges)).toBe(true);
                    expect(Array.isArray(idx.outEdges)).toBe(true);
                }

                // Verify edge connectivity in nodeIndex
                for (const edge of MultiDimGraph.edges) {
                    const srcIdx = MultiDimGraph.nodeIndex.get(edge.source);
                    const tgtIdx = MultiDimGraph.nodeIndex.get(edge.target);
                    if (srcIdx) expect(srcIdx.outEdges).toContain(edge);
                    if (tgtIdx) expect(tgtIdx.inEdges).toContain(edge);
                }
            }),
            { numRuns: 100 }
        );
    });
});
