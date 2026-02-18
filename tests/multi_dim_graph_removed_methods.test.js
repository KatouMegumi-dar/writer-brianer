import { describe, it, expect } from 'vitest';

// Setup WBAP global before loading the module
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

await import('../modules/multi_dim_graph.js');

const MultiDimGraph = window.WBAP.MultiDimGraph;
const EDGE_DIMENSIONS = window.WBAP.EDGE_DIMENSIONS;

describe('Rule-based methods removed (Req 1.2, 1.3)', () => {
    it('removed methods do not exist on MultiDimGraph', () => {
        const removedMethods = [
            'build',
            'createNode',
            'buildMultiDimensionalEdges',
            'detectEdgeDimensions',
            'detectNodeType',
            'extractTemporalInfo',
            'extractSpatialInfo',
            'extractEmotionalState',
            'extractEventNodes',
            'generateEventSummary',
            'enhanceNode',
            'normalizeKeys',
        ];

        for (const method of removedMethods) {
            expect(MultiDimGraph[method], `${method} should be removed`).toBeUndefined();
        }
    });

    it('retained methods still exist on MultiDimGraph', () => {
        const retainedMethods = [
            'incrementalUpdate',
            'applyIncrementalUpdates',
            'parseUpdateResponse',
            'smartRetrieve',
            'multiDimensionalDiffuse',
            'inferDimensionWeights',
            'findNodeByLabel',
            'buildIndices',
            'calculateMultiDimImportance',
            'clear',
            'serialize',
            'deserialize',
            'saveToIndexedDB',
            'loadFromIndexedDB',
        ];

        for (const method of retainedMethods) {
            expect(typeof MultiDimGraph[method], `${method} should be a function`).toBe('function');
        }
    });

    it('EDGE_DIMENSIONS is still exported and contains expected dimensions', () => {
        expect(EDGE_DIMENSIONS).toBeDefined();
        expect(EDGE_DIMENSIONS.TEMPORAL.id).toBe('temporal');
        expect(EDGE_DIMENSIONS.SPATIAL.id).toBe('spatial');
        expect(EDGE_DIMENSIONS.EMOTIONAL.id).toBe('emotional');
        expect(EDGE_DIMENSIONS.CAUSAL.id).toBe('causal');
        expect(EDGE_DIMENSIONS.CHARACTER.id).toBe('character');
        expect(EDGE_DIMENSIONS.THEMATIC.id).toBe('thematic');
    });
});
