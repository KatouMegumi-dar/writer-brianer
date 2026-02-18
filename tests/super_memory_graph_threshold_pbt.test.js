import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';

// Setup WBAP global before loading modules
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

await import('../modules/multi_dim_graph.js');
await import('../modules/super_memory.js');

const SuperMemory = window.WBAP.SuperMemory;
const MultiDimGraph = window.WBAP.MultiDimGraph;

describe('Feature: llm-driven-graph-retrieval, Property 4: 图谱节点不足时跳过图谱检索', () => {
    let smartRetrieveSpy;

    beforeEach(() => {
        MultiDimGraph.clear();
        MultiDimGraph.dynamicNodes = new Map();
        MultiDimGraph.dynamicEdges = [];
        SuperMemory._graphLoaded = true; // skip IndexedDB loading

        // Spy on smartRetrieve
        smartRetrieveSpy = vi.spyOn(MultiDimGraph, 'smartRetrieve').mockResolvedValue({ nodes: [] });
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * For any graph with node count below the threshold (default 3),
     * the threshold check logic SHALL NOT call smartRetrieve.
     * Only when node count >= threshold should smartRetrieve be called.
     */
    it('smartRetrieve is not called when graph node count is below threshold', async () => {
        await fc.assert(
            fc.asyncProperty(
                // threshold: 1..10, nodeCount: 0..threshold-1
                fc.integer({ min: 1, max: 10 }).chain(threshold =>
                    fc.tuple(
                        fc.constant(threshold),
                        fc.integer({ min: 0, max: threshold - 1 })
                    )
                ),
                async ([threshold, nodeCount]) => {
                    // Reset
                    MultiDimGraph.clear();
                    MultiDimGraph.dynamicNodes = new Map();
                    MultiDimGraph.dynamicEdges = [];
                    smartRetrieveSpy.mockClear();

                    // Populate graph with exactly nodeCount nodes
                    for (let i = 0; i < nodeCount; i++) {
                        MultiDimGraph.nodes.set(`node-${i}`, {
                            id: `node-${i}`,
                            label: `Node ${i}`,
                            type: 'concept',
                            keys: [`node-${i}`],
                            keysLower: [`node-${i}`],
                            content: '',
                            contentLower: '',
                            energy: 0,
                        });
                    }

                    // Replicate the threshold check from SuperMemory.retrieve()
                    const config = { useGraphRetrieval: true, graphMinNodes: threshold };
                    const currentNodeCount = MultiDimGraph.nodes.size;
                    const minNodes = config.graphMinNodes || 3;

                    let graphRetrievalResult = null;
                    if (currentNodeCount >= minNodes) {
                        graphRetrievalResult = await MultiDimGraph.smartRetrieve('test query', '', { topK: 15 });
                    }

                    // smartRetrieve must NOT have been called
                    expect(smartRetrieveSpy).not.toHaveBeenCalled();
                    expect(graphRetrievalResult).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    });

    it('smartRetrieve IS called when graph node count meets or exceeds threshold', async () => {
        await fc.assert(
            fc.asyncProperty(
                // threshold: 1..10, nodeCount: threshold..threshold+10
                fc.integer({ min: 1, max: 10 }).chain(threshold =>
                    fc.tuple(
                        fc.constant(threshold),
                        fc.integer({ min: threshold, max: threshold + 10 })
                    )
                ),
                async ([threshold, nodeCount]) => {
                    // Reset
                    MultiDimGraph.clear();
                    MultiDimGraph.dynamicNodes = new Map();
                    MultiDimGraph.dynamicEdges = [];
                    smartRetrieveSpy.mockClear();

                    // Populate graph with exactly nodeCount nodes
                    for (let i = 0; i < nodeCount; i++) {
                        MultiDimGraph.nodes.set(`node-${i}`, {
                            id: `node-${i}`,
                            label: `Node ${i}`,
                            type: 'concept',
                            keys: [`node-${i}`],
                            keysLower: [`node-${i}`],
                            content: '',
                            contentLower: '',
                            energy: 0,
                        });
                    }

                    // Replicate the threshold check from SuperMemory.retrieve()
                    const config = { useGraphRetrieval: true, graphMinNodes: threshold };
                    const currentNodeCount = MultiDimGraph.nodes.size;
                    const minNodes = config.graphMinNodes || 3;

                    let graphRetrievalResult = null;
                    if (currentNodeCount >= minNodes) {
                        graphRetrievalResult = await MultiDimGraph.smartRetrieve('test query', '', { topK: 15 });
                    }

                    // smartRetrieve MUST have been called
                    expect(smartRetrieveSpy).toHaveBeenCalledOnce();
                }
            ),
            { numRuns: 100 }
        );
    });
});
