import { describe, it, expect, beforeEach } from 'vitest';

// Setup WBAP global before loading the module
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

// Load the module (it attaches to window.WBAP)
await import('../modules/multi_dim_graph.js');

const MultiDimGraph = window.WBAP.MultiDimGraph;
const EDGE_DIMENSIONS = window.WBAP.EDGE_DIMENSIONS;

describe('MultiDimGraph serialize/deserialize', () => {
    beforeEach(() => {
        MultiDimGraph.clear();
        MultiDimGraph.dynamicNodes = new Map();
        MultiDimGraph.dynamicEdges = [];
    });

    it('serialize returns version and timestamp', () => {
        const result = MultiDimGraph.serialize();
        expect(result.version).toBe(1);
        expect(typeof result.timestamp).toBe('number');
        expect(result.nodes).toEqual([]);
        expect(result.edges).toEqual([]);
    });

    it('roundtrip preserves nodes and edges', () => {
        // Add a node
        const node = {
            id: 'n1',
            label: 'TestNode',
            type: 'character',
            keys: ['TestNode'],
            keysLower: ['testnode'],
            content: 'some content',
            contentLower: 'some content',
            multiDimImportance: {},
            energy: 0
        };
        MultiDimGraph.nodes.set('n1', node);

        // Add a second node
        const node2 = {
            id: 'n2',
            label: 'Node2',
            type: 'location',
            keys: ['Node2'],
            keysLower: ['node2'],
            content: 'other content',
            contentLower: 'other content',
            multiDimImportance: {},
            energy: 0
        };
        MultiDimGraph.nodes.set('n2', node2);

        // Add an edge with dimension references
        MultiDimGraph.edges.push({
            id: 'n1->n2',
            source: 'n1',
            target: 'n2',
            dimensions: [
                { dimension: EDGE_DIMENSIONS.TEMPORAL, strength: 0.8 },
                { dimension: EDGE_DIMENSIONS.EMOTIONAL, strength: 0.5 }
            ],
            weight: 0.65
        });

        MultiDimGraph.buildIndices();

        // Serialize
        const serialized = MultiDimGraph.serialize();
        expect(serialized.nodes).toHaveLength(2);
        expect(serialized.edges).toHaveLength(1);
        // Dimensions should be serialized as dimensionId strings
        expect(serialized.edges[0].dimensions[0].dimensionId).toBe('temporal');
        expect(serialized.edges[0].dimensions[1].dimensionId).toBe('emotional');

        // Deserialize into a fresh state
        MultiDimGraph.deserialize(serialized);

        expect(MultiDimGraph.nodes.size).toBe(2);
        expect(MultiDimGraph.edges).toHaveLength(1);
        // Dimension references should be restored
        expect(MultiDimGraph.edges[0].dimensions[0].dimension.id).toBe('temporal');
        expect(MultiDimGraph.edges[0].dimensions[1].dimension.id).toBe('emotional');
        expect(MultiDimGraph.edges[0].dimensions[0].strength).toBe(0.8);
    });

    it('deserialize ignores data with wrong version', () => {
        MultiDimGraph.nodes.set('existing', { id: 'existing', label: 'X' });
        MultiDimGraph.deserialize({ version: 99, nodes: [{ id: 'n1' }] });
        // clear() was called, so existing node is gone, but bad version means no data loaded
        expect(MultiDimGraph.nodes.size).toBe(0);
    });

    it('deserialize ignores null/undefined data', () => {
        MultiDimGraph.deserialize(null);
        expect(MultiDimGraph.nodes.size).toBe(0);
        MultiDimGraph.deserialize(undefined);
        expect(MultiDimGraph.nodes.size).toBe(0);
    });

    it('roundtrip preserves dynamic nodes and edges', () => {
        const dynNode = {
            id: 'dyn-1',
            label: 'DynNode',
            type: 'concept',
            keys: ['DynNode'],
            keysLower: ['dynnode'],
            content: '',
            contentLower: '',
            multiDimImportance: {},
            energy: 0,
            isDynamic: true
        };
        MultiDimGraph.nodes.set('dyn-1', dynNode);
        MultiDimGraph.dynamicNodes.set('dyn-1', dynNode);

        const dynEdge = {
            id: 'dyn-1->dyn-1',
            source: 'dyn-1',
            target: 'dyn-1',
            dimensions: [{ dimension: EDGE_DIMENSIONS.THEMATIC, strength: 0.6 }],
            weight: 0.6,
            isDynamic: true
        };
        MultiDimGraph.edges.push(dynEdge);
        MultiDimGraph.dynamicEdges.push(dynEdge);

        MultiDimGraph.buildIndices();

        const serialized = MultiDimGraph.serialize();
        expect(serialized.dynamicNodes).toHaveLength(1);
        expect(serialized.dynamicEdges).toHaveLength(1);

        MultiDimGraph.deserialize(serialized);
        expect(MultiDimGraph.dynamicNodes.size).toBe(1);
        expect(MultiDimGraph.dynamicEdges).toHaveLength(1);
        expect(MultiDimGraph.dynamicEdges[0].dimensions[0].dimension.id).toBe('thematic');
    });

    it('serialize strips entry references from nodes', () => {
        const node = {
            id: 'n1',
            label: 'Test',
            entry: { uid: 1, content: 'secret' },
            multiDimImportance: {},
            energy: 0
        };
        MultiDimGraph.nodes.set('n1', node);

        const serialized = MultiDimGraph.serialize();
        expect(serialized.nodes[0].entry).toBeUndefined();
    });

    it('deserialize rebuilds indices', () => {
        const data = {
            version: 1,
            timestamp: Date.now(),
            nodes: [
                { id: 'a', label: 'A', keys: ['A'], keysLower: ['a'], content: '', contentLower: '', multiDimImportance: {}, energy: 0 },
                { id: 'b', label: 'B', keys: ['B'], keysLower: ['b'], content: '', contentLower: '', multiDimImportance: {}, energy: 0 }
            ],
            edges: [{
                id: 'a->b',
                source: 'a',
                target: 'b',
                dimensions: [{ dimensionId: 'causal', strength: 0.7 }],
                weight: 0.7
            }],
            dynamicNodes: [],
            dynamicEdges: []
        };

        MultiDimGraph.deserialize(data);

        // nodeIndex should be built
        expect(MultiDimGraph.nodeIndex.get('a').outEdges).toHaveLength(1);
        expect(MultiDimGraph.nodeIndex.get('b').inEdges).toHaveLength(1);

        // dimensionIndex should be built
        expect(MultiDimGraph.dimensionIndex.get('causal')).toHaveLength(1);
    });
});
