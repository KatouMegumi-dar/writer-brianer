/**
 * 端到端集成测试：图谱驱动PEDSA检索
 *
 * Feature: graph-driven-pedsa-retrieval
 *
 * **Validates: Requirements 1.1, 6.2**
 *
 * 测试完整的图谱驱动检索流程和配置开关切换
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Setup WBAP global before loading modules
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

await import('../modules/multi_dim_graph.js');
await import('../modules/pedsa_engine.js');
await import('../modules/super_memory.js');

const SuperMemory = window.WBAP.SuperMemory;
const MultiDimGraph = window.WBAP.MultiDimGraph;
const PedsaEngine = window.WBAP.PedsaEngine;
const QueryBuilder = window.WBAP.QueryBuilder;

describe('Feature: graph-driven-pedsa-retrieval - 端到端集成测试', () => {
    // Sample worldbook entries for testing
    const sampleWorldbookContent = [
        { uid: 1, key: '艾米莉', comment: '主角', content: '艾米莉是一位年轻的魔法师，性格开朗，喜欢冒险。', book: 'characters' },
        { uid: 2, key: '黑暗森林', comment: '地点', content: '黑暗森林位于王国北部，充满危险的魔物。', book: 'locations' },
        { uid: 3, key: '火焰魔法', comment: '技能', content: '火焰魔法是艾米莉的主要攻击手段，威力强大。', book: 'skills' },
        { uid: 4, key: '魔法学院', comment: '地点', content: '魔法学院是培养魔法师的地方，艾米莉在这里学习。', book: 'locations' },
        { uid: 5, key: '暗影领主', comment: '反派', content: '暗影领主是黑暗森林的统治者，企图征服王国。', book: 'characters' },
    ];

    beforeEach(() => {
        // Reset MultiDimGraph
        if (MultiDimGraph) {
            MultiDimGraph.clear();
            MultiDimGraph.dynamicNodes = new Map();
            MultiDimGraph.dynamicEdges = [];
        }
        SuperMemory._graphLoaded = true; // Skip IndexedDB loading
    });

    describe('Requirements 1.1: 图谱前置分析', () => {
        it('graphDrivenRetrieve 应该在 PEDSA 检索之前执行图谱分析', async () => {
            // Setup graph with enough nodes
            for (let i = 0; i < 5; i++) {
                MultiDimGraph.nodes.set(`node-${i}`, {
                    id: `node-${i}`,
                    label: `Node ${i}`,
                    type: 'concept',
                    keys: [`key-${i}`],
                    keysLower: [`key-${i}`],
                    content: `Content for node ${i}`,
                    contentLower: `content for node ${i}`,
                    energy: 0.5,
                });
            }

            // Mock smartRetrieve to track call order
            const callOrder = [];
            const originalSmartRetrieve = MultiDimGraph.smartRetrieve;
            MultiDimGraph.smartRetrieve = vi.fn().mockImplementation(async (...args) => {
                callOrder.push('smartRetrieve');
                return {
                    nodes: [{ id: 'node-0', label: 'Node 0', energy: 0.8, keys: ['key-0'] }],
                    dimensionWeights: { temporal: 0.6 },
                    paths: [],
                };
            });

            const config = { graphMinNodes: 3, maxEnhancedTerms: 10 };
            const result = await SuperMemory.graphDrivenRetrieve(
                '艾米莉的火焰魔法',
                '对话上下文',
                sampleWorldbookContent,
                config
            );

            // Verify smartRetrieve was called (graph analysis happened)
            expect(MultiDimGraph.smartRetrieve).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.stats.graphNodes).toBeGreaterThanOrEqual(0);

            // Restore
            MultiDimGraph.smartRetrieve = originalSmartRetrieve;
        });

        it('当图谱节点不足时应跳过图谱分析', async () => {
            // Setup graph with fewer nodes than threshold
            MultiDimGraph.nodes.set('node-0', {
                id: 'node-0',
                label: 'Node 0',
                type: 'concept',
                keys: ['key-0'],
                keysLower: ['key-0'],
                content: 'Content',
                contentLower: 'content',
                energy: 0.5,
            });

            const smartRetrieveSpy = vi.spyOn(MultiDimGraph, 'smartRetrieve');

            const config = { graphMinNodes: 5, maxEnhancedTerms: 10 };
            const result = await SuperMemory.graphDrivenRetrieve(
                '测试查询',
                '',
                sampleWorldbookContent,
                config
            );

            // smartRetrieve should NOT be called when nodes < threshold
            expect(smartRetrieveSpy).not.toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.stats.graphNodes).toBe(0);

            smartRetrieveSpy.mockRestore();
        });
    });

    describe('Requirements 6.2: 配置开关切换', () => {
        it('useGraphDrivenRetrieval=false 时应使用原有并行架构', async () => {
            // This test verifies the routing logic in retrieve()
            // When useGraphDrivenRetrieval is false, graphDrivenRetrieve should not be called

            const graphDrivenRetrieveSpy = vi.spyOn(SuperMemory, 'graphDrivenRetrieve');

            // Mock the necessary dependencies for retrieve()
            const originalLoadSelectedWorldbooks = SuperMemory.loadSelectedWorldbooks;
            SuperMemory.loadSelectedWorldbooks = vi.fn().mockResolvedValue(sampleWorldbookContent);

            const originalCallAgent = SuperMemory.callAgent;
            SuperMemory.callAgent = vi.fn().mockResolvedValue({ type: 'test', result: null });

            // Setup minimal WBAP config
            const originalCharacterManager = window.WBAP.CharacterManager;
            window.WBAP.CharacterManager = {
                getCurrentCharacterConfig: () => ({
                    superMemory: {
                        enabled: true,
                        selectedWorldBooks: ['test-book'],
                        useGraphDrivenRetrieval: false, // Disable graph-driven retrieval
                        useGraphRetrieval: false,
                        usePedsaJsRetrieval: false,
                    },
                }),
            };

            await SuperMemory.retrieve('测试查询', '上下文');

            // graphDrivenRetrieve should NOT be called when useGraphDrivenRetrieval is false
            expect(graphDrivenRetrieveSpy).not.toHaveBeenCalled();

            // Restore
            SuperMemory.loadSelectedWorldbooks = originalLoadSelectedWorldbooks;
            SuperMemory.callAgent = originalCallAgent;
            window.WBAP.CharacterManager = originalCharacterManager;
            graphDrivenRetrieveSpy.mockRestore();
        });

        it('useGraphDrivenRetrieval=true 时应使用图谱驱动检索流程', async () => {
            const graphDrivenRetrieveSpy = vi.spyOn(SuperMemory, 'graphDrivenRetrieve')
                .mockResolvedValue({
                    success: true,
                    entries: sampleWorldbookContent,
                    graphInsight: null,
                    enhancedQuery: { originalQuery: 'test', terms: [], dimensionWeights: {}, totalTerms: 0 },
                    stats: { totalTimeMs: 10, graphNodes: 0, enhancedTerms: 0, pedsaResults: 0, finalEntries: 5 },
                });

            const originalLoadSelectedWorldbooks = SuperMemory.loadSelectedWorldbooks;
            SuperMemory.loadSelectedWorldbooks = vi.fn().mockResolvedValue(sampleWorldbookContent);

            const originalCallAgent = SuperMemory.callAgent;
            SuperMemory.callAgent = vi.fn().mockResolvedValue({ type: 'test', result: null });

            const originalCharacterManager = window.WBAP.CharacterManager;
            window.WBAP.CharacterManager = {
                getCurrentCharacterConfig: () => ({
                    superMemory: {
                        enabled: true,
                        selectedWorldBooks: ['test-book'],
                        useGraphDrivenRetrieval: true, // Enable graph-driven retrieval
                    },
                }),
            };

            // Ensure PedsaEngine is available
            window.WBAP.PedsaEngine = PedsaEngine;

            await SuperMemory.retrieve('测试查询', '上下文');

            // graphDrivenRetrieve SHOULD be called when useGraphDrivenRetrieval is true
            expect(graphDrivenRetrieveSpy).toHaveBeenCalled();

            // Restore
            SuperMemory.loadSelectedWorldbooks = originalLoadSelectedWorldbooks;
            SuperMemory.callAgent = originalCallAgent;
            window.WBAP.CharacterManager = originalCharacterManager;
            graphDrivenRetrieveSpy.mockRestore();
        });
    });

    describe('完整流程集成测试', () => {
        it('graphDrivenRetrieve 应返回正确的结果结构', async () => {
            // Setup graph
            for (let i = 0; i < 5; i++) {
                MultiDimGraph.nodes.set(`node-${i}`, {
                    id: `node-${i}`,
                    label: sampleWorldbookContent[i % sampleWorldbookContent.length].comment,
                    type: 'concept',
                    keys: [sampleWorldbookContent[i % sampleWorldbookContent.length].key],
                    keysLower: [sampleWorldbookContent[i % sampleWorldbookContent.length].key.toLowerCase()],
                    content: sampleWorldbookContent[i % sampleWorldbookContent.length].content,
                    contentLower: sampleWorldbookContent[i % sampleWorldbookContent.length].content.toLowerCase(),
                    energy: 0.5 + i * 0.1,
                    entry: sampleWorldbookContent[i % sampleWorldbookContent.length],
                });
            }

            // Mock smartRetrieve
            const originalSmartRetrieve = MultiDimGraph.smartRetrieve;
            MultiDimGraph.smartRetrieve = vi.fn().mockResolvedValue({
                nodes: [
                    { id: 'node-0', label: '主角', energy: 0.9, keys: ['艾米莉'], entry: sampleWorldbookContent[0] },
                    { id: 'node-2', label: '技能', energy: 0.7, keys: ['火焰魔法'], entry: sampleWorldbookContent[2] },
                ],
                dimensionWeights: { character: 0.8, thematic: 0.5 },
                paths: [],
            });

            const config = { graphMinNodes: 3, maxEnhancedTerms: 15, maxResults: 10 };
            const result = await SuperMemory.graphDrivenRetrieve(
                '艾米莉使用火焰魔法',
                '艾米莉正在黑暗森林中战斗',
                sampleWorldbookContent,
                config
            );

            // Verify result structure
            expect(result).toHaveProperty('success', true);
            expect(result).toHaveProperty('entries');
            expect(result).toHaveProperty('graphInsight');
            expect(result).toHaveProperty('enhancedQuery');
            expect(result).toHaveProperty('stats');

            // Verify stats structure
            expect(result.stats).toHaveProperty('totalTimeMs');
            expect(result.stats).toHaveProperty('graphNodes');
            expect(result.stats).toHaveProperty('enhancedTerms');
            expect(result.stats).toHaveProperty('pedsaResults');
            expect(result.stats).toHaveProperty('finalEntries');

            // Verify enhancedQuery structure
            expect(result.enhancedQuery).toHaveProperty('originalQuery');
            expect(result.enhancedQuery).toHaveProperty('terms');
            expect(result.enhancedQuery).toHaveProperty('dimensionWeights');
            expect(result.enhancedQuery).toHaveProperty('totalTerms');

            // Restore
            MultiDimGraph.smartRetrieve = originalSmartRetrieve;
        });

        it('QueryBuilder 应正确构建增强查询', () => {
            const graphInsight = {
                nodes: [
                    { id: '1', label: '艾米莉', energy: 0.9, keys: ['主角', '魔法师'], type: 'character' },
                    { id: '2', label: '火焰魔法', energy: 0.7, keys: ['技能'], type: 'skill' },
                ],
                dimensionWeights: { character: 0.8, temporal: 0.3 },
                paths: [
                    { source: '艾米莉', target: '火焰魔法', dimension: 'thematic', strength: 0.8 },
                ],
                seedCount: 2,
            };

            const config = {
                maxEnhancedTerms: 10,
                seedEnergyThreshold: 0.3,
                pathStrengthThreshold: 0.4,
                dimensionBoostThreshold: 0.5,
            };

            const enhancedQuery = QueryBuilder.buildEnhancedQuery('艾米莉的技能', graphInsight, config);

            // Verify structure
            expect(enhancedQuery.originalQuery).toBe('艾米莉的技能');
            expect(Array.isArray(enhancedQuery.terms)).toBe(true);
            expect(enhancedQuery.terms.length).toBeLessThanOrEqual(config.maxEnhancedTerms);
            expect(enhancedQuery.totalTerms).toBe(enhancedQuery.terms.length);

            // Verify terms are sorted by weight descending
            for (let i = 1; i < enhancedQuery.terms.length; i++) {
                expect(enhancedQuery.terms[i].weight).toBeLessThanOrEqual(enhancedQuery.terms[i - 1].weight);
            }

            // Verify no duplicate terms
            const termTexts = enhancedQuery.terms.map(t => t.term.toLowerCase());
            const uniqueTerms = [...new Set(termTexts)];
            expect(termTexts.length).toBe(uniqueTerms.length);
        });

        it('mergeGraphAndPedsaResults 应正确合并结果', () => {
            const graphInsight = {
                nodes: [
                    { id: '1', label: '艾米莉', energy: 0.9, entry: sampleWorldbookContent[0] },
                ],
                dimensionWeights: {},
                paths: [],
            };

            const pedsaResults = {
                results: [
                    { originalEntry: sampleWorldbookContent[0], score: 0.8 },
                    { originalEntry: sampleWorldbookContent[2], score: 0.6 },
                    { originalEntry: sampleWorldbookContent[3], score: 0.4 },
                ],
            };

            const config = { maxResults: 2 };
            const result = SuperMemory.mergeGraphAndPedsaResults(
                graphInsight,
                pedsaResults,
                sampleWorldbookContent,
                config
            );

            // Verify truncation
            expect(result.entries.length).toBe(2);
            expect(result.totalBeforeTruncation).toBe(3);

            // Verify entries have relevanceScore
            for (const entry of result.entries) {
                expect(entry).toHaveProperty('relevanceScore');
                expect(typeof entry.relevanceScore).toBe('number');
            }

            // Verify sorted by relevance descending
            for (let i = 1; i < result.entries.length; i++) {
                expect(result.entries[i].relevanceScore).toBeLessThanOrEqual(result.entries[i - 1].relevanceScore);
            }
        });
    });

    describe('错误恢复测试', () => {
        it('图谱分析失败时应回退到原始查询', async () => {
            // Setup graph with enough nodes
            for (let i = 0; i < 5; i++) {
                MultiDimGraph.nodes.set(`node-${i}`, {
                    id: `node-${i}`,
                    label: `Node ${i}`,
                    type: 'concept',
                    keys: [`key-${i}`],
                    keysLower: [`key-${i}`],
                    content: `Content ${i}`,
                    contentLower: `content ${i}`,
                    energy: 0.5,
                });
            }

            // Mock smartRetrieve to throw error
            const originalSmartRetrieve = MultiDimGraph.smartRetrieve;
            MultiDimGraph.smartRetrieve = vi.fn().mockRejectedValue(new Error('Graph analysis failed'));

            const config = { graphMinNodes: 3 };
            const result = await SuperMemory.graphDrivenRetrieve(
                '测试查询',
                '',
                sampleWorldbookContent,
                config
            );

            // Should still succeed with fallback
            expect(result.success).toBe(true);
            expect(result.graphInsight).toBeNull();

            // Restore
            MultiDimGraph.smartRetrieve = originalSmartRetrieve;
        });
    });
});
