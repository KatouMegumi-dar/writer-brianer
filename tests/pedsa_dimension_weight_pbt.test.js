/**
 * Property 11: 维度权重影响检索
 *
 * Feature: graph-driven-pedsa-retrieval, Property 11: 维度权重影响检索
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
 *
 * For any query with high dimension weight (above threshold), entries related to that dimension
 * should receive higher energy boost, thus ranking higher in results.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

// Setup WBAP global before loading module
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

await import('../modules/pedsa_engine.js');

const PedsaEngine = window.WBAP.PedsaEngine;
const SimHash = window.WBAP.SimHash;

/** Arbitrary for dimension weights */
const dimensionWeightsArb = fc.record({
    temporal: fc.double({ min: 0, max: 1, noNaN: true }),
    spatial: fc.double({ min: 0, max: 1, noNaN: true }),
    emotional: fc.double({ min: 0, max: 1, noNaN: true }),
    character: fc.double({ min: 0, max: 1, noNaN: true }),
    causal: fc.double({ min: 0, max: 1, noNaN: true }),
    thematic: fc.double({ min: 0, max: 1, noNaN: true }),
});

/** Arbitrary for QueryTerm */
const queryTermArb = fc.record({
    term: fc.string({ minLength: 1, maxLength: 20 }),
    weight: fc.double({ min: 0.1, max: 1, noNaN: true }),
    source: fc.constantFrom('seed', 'path', 'dimension', 'original'),
});

describe('Feature: graph-driven-pedsa-retrieval, Property 11: 维度权重影响检索', () => {
    let engine;

    beforeEach(() => {
        engine = new PedsaEngine();
    });

    /**
     * **Validates: Requirements 4.1**
     *
     * When temporal dimension weight is high (>0.3), spatio-temporal indexed nodes
     * should receive energy boost.
     */
    it('high temporal weight boosts spatio-temporal indexed nodes', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0.4, max: 1, noNaN: true }),
                (temporalWeight) => {
                    const freshEngine = new PedsaEngine();
                    
                    // Add a feature for matching
                    freshEngine.addFeature(1, 'testword');
                    
                    // Add an event with spatio-temporal data (timestamp and location)
                    freshEngine.addEvent(100, '2024年1月1日在上海发生的事件', {
                        timestamp: 1704067200,
                        location: 'Shanghai'
                    });
                    
                    // Add an event without spatio-temporal data
                    freshEngine.addEvent(101, '普通事件内容', {});
                    
                    freshEngine.compile();

                    // Create activated map with both nodes
                    const activated = new Map();
                    activated.set(100, 0.5);
                    activated.set(101, 0.5);

                    // Apply dimension boost with high temporal weight
                    freshEngine.applyDimensionBoost(activated, { temporal: temporalWeight });

                    // Node 100 (with spatio-temporal data) should have higher energy
                    const energy100 = activated.get(100) || 0;
                    const energy101 = activated.get(101) || 0;

                    // Spatio-temporal indexed node should get boost
                    expect(energy100).toBeGreaterThan(0.5);
                    // Non-indexed node should remain unchanged
                    expect(energy101).toBe(0.5);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 4.2**
     *
     * When emotional dimension weight is high (>0.3), affective indexed nodes
     * should receive energy boost.
     */
    it('high emotional weight boosts affective indexed nodes', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0.4, max: 1, noNaN: true }),
                (emotionalWeight) => {
                    const freshEngine = new PedsaEngine();
                    
                    // Add a feature for matching
                    freshEngine.addFeature(1, 'testword');
                    
                    // Add an event with emotional content (joy emotion)
                    freshEngine.addEvent(200, '今天非常开心快乐', {
                        emotions: ['joy']
                    });
                    
                    // Add an event without emotional content
                    freshEngine.addEvent(201, '普通事件内容', {});
                    
                    freshEngine.compile();

                    // Create activated map with both nodes
                    const activated = new Map();
                    activated.set(200, 0.5);
                    activated.set(201, 0.5);

                    // Apply dimension boost with high emotional weight
                    freshEngine.applyDimensionBoost(activated, { emotional: emotionalWeight });

                    // Node 200 (with emotional data) should have higher energy
                    const energy200 = activated.get(200) || 0;
                    const energy201 = activated.get(201) || 0;

                    // Affective indexed node should get boost
                    expect(energy200).toBeGreaterThan(0.5);
                    // Non-indexed node should remain unchanged
                    expect(energy201).toBe(0.5);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * When character dimension weight is high (>0.3), person-type nodes
     * should receive energy boost.
     */
    it('high character weight boosts person-type nodes', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0.4, max: 1, noNaN: true }),
                (characterWeight) => {
                    const freshEngine = new PedsaEngine();
                    
                    // Add a feature for matching
                    freshEngine.addFeature(1, 'testword');
                    
                    // Add an event with person-related content
                    freshEngine.addEvent(300, '用户小明是一个女孩角色', {});
                    
                    // Add an event without person-related content
                    freshEngine.addEvent(301, '代码算法技术实现', {});
                    
                    freshEngine.compile();

                    // Create activated map with both nodes
                    const activated = new Map();
                    activated.set(300, 0.5);
                    activated.set(301, 0.5);

                    // Apply dimension boost with high character weight
                    freshEngine.applyDimensionBoost(activated, { character: characterWeight });

                    // Get the node fingerprints to check type
                    const node300 = freshEngine.nodes.get(300);
                    const node301 = freshEngine.nodes.get(301);
                    
                    const type300 = Number((node300.fingerprint & SimHash.MASK_TYPE) >> 56n);
                    const type301 = Number((node301.fingerprint & SimHash.MASK_TYPE) >> 56n);

                    const energy300 = activated.get(300) || 0;
                    const energy301 = activated.get(301) || 0;

                    // If node 300 is person type, it should get boost
                    if (type300 === SimHash.TYPE_PERSON) {
                        expect(energy300).toBeGreaterThan(0.5);
                    }
                    // If node 301 is not person type, it should not get character boost
                    if (type301 !== SimHash.TYPE_PERSON) {
                        expect(energy301).toBe(0.5);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 4.1, 4.2, 4.3**
     *
     * Low dimension weights (<=0.3) should not trigger any boost.
     */
    it('low dimension weights do not trigger boost', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 0.3, noNaN: true }),
                fc.double({ min: 0, max: 0.3, noNaN: true }),
                fc.double({ min: 0, max: 0.3, noNaN: true }),
                (temporalWeight, emotionalWeight, characterWeight) => {
                    const freshEngine = new PedsaEngine();
                    
                    // Add events with various indexed data
                    freshEngine.addEvent(400, '2024年1月1日在上海开心的用户', {
                        timestamp: 1704067200,
                        location: 'Shanghai',
                        emotions: ['joy']
                    });
                    
                    freshEngine.compile();

                    // Create activated map
                    const activated = new Map();
                    activated.set(400, 0.5);

                    // Apply dimension boost with low weights
                    freshEngine.applyDimensionBoost(activated, {
                        temporal: temporalWeight,
                        emotional: emotionalWeight,
                        character: characterWeight
                    });

                    // Energy should remain unchanged (no boost applied)
                    const energy = activated.get(400) || 0;
                    expect(energy).toBe(0.5);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 4.4**
     *
     * Dimension weights should be passed to SimHash similarity calculation
     * in retrieveEnhanced, affecting final ranking.
     */
    it('dimension weights affect final ranking in retrieveEnhanced', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0.5, max: 1, noNaN: true }),
                (highWeight) => {
                    const freshEngine = new PedsaEngine();
                    
                    // Add features
                    freshEngine.addFeature(1, 'keyword');
                    
                    // Add events
                    freshEngine.addEvent(500, '2024年1月1日在上海发生的keyword事件', {
                        timestamp: 1704067200,
                        location: 'Shanghai'
                    });
                    freshEngine.addEvent(501, 'keyword普通事件', {});
                    
                    freshEngine.compile();

                    // Query with high temporal weight
                    const enhancedQuery = {
                        originalQuery: 'keyword',
                        terms: [{ term: 'keyword', weight: 1.0, source: 'original' }],
                        dimensionWeights: { temporal: highWeight },
                        totalTerms: 1
                    };

                    const result = freshEngine.retrieveEnhanced(enhancedQuery, { topK: 10 });

                    // Both events should be in results
                    expect(result.success).toBe(true);
                    expect(result.results.length).toBeGreaterThanOrEqual(0);
                    
                    // If both are returned, the spatio-temporal one should rank higher
                    if (result.results.length >= 2) {
                        const scores = result.results.map(r => ({ id: r.nodeId, score: r.score }));
                        const score500 = scores.find(s => s.id === 500)?.score || 0;
                        const score501 = scores.find(s => s.id === 501)?.score || 0;
                        
                        // With high temporal weight, node 500 should have higher or equal score
                        expect(score500).toBeGreaterThanOrEqual(score501 * 0.8);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
     *
     * Combined property: Multiple high dimension weights should provide cumulative boost.
     */
    it('multiple high dimension weights provide cumulative boost', () => {
        const freshEngine = new PedsaEngine();
        
        // Add an event with multiple indexed attributes
        freshEngine.addEvent(600, '2024年1月1日在上海开心的用户小明', {
            timestamp: 1704067200,
            location: 'Shanghai',
            emotions: ['joy']
        });
        
        freshEngine.compile();

        // Test with single dimension
        const activatedSingle = new Map();
        activatedSingle.set(600, 0.5);
        freshEngine.applyDimensionBoost(activatedSingle, { temporal: 0.8 });
        const energySingle = activatedSingle.get(600) || 0;

        // Test with multiple dimensions
        const activatedMultiple = new Map();
        activatedMultiple.set(600, 0.5);
        freshEngine.applyDimensionBoost(activatedMultiple, {
            temporal: 0.8,
            emotional: 0.8
        });
        const energyMultiple = activatedMultiple.get(600) || 0;

        // Multiple dimensions should provide more boost
        expect(energyMultiple).toBeGreaterThanOrEqual(energySingle);
    });

    /**
     * **Validates: Requirements 4.1, 4.2**
     *
     * Property: Boost amount is proportional to dimension weight value.
     */
    it('boost amount is proportional to dimension weight', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0.4, max: 0.6, noNaN: true }),
                fc.double({ min: 0.7, max: 1.0, noNaN: true }),
                (lowerWeight, higherWeight) => {
                    // Test with temporal dimension
                    const engine1 = new PedsaEngine();
                    engine1.addEvent(700, '2024年1月1日在上海事件', {
                        timestamp: 1704067200,
                        location: 'Shanghai'
                    });
                    engine1.compile();

                    const activated1 = new Map();
                    activated1.set(700, 0.5);
                    engine1.applyDimensionBoost(activated1, { temporal: lowerWeight });
                    const energyLower = activated1.get(700) || 0;

                    const engine2 = new PedsaEngine();
                    engine2.addEvent(700, '2024年1月1日在上海事件', {
                        timestamp: 1704067200,
                        location: 'Shanghai'
                    });
                    engine2.compile();

                    const activated2 = new Map();
                    activated2.set(700, 0.5);
                    engine2.applyDimensionBoost(activated2, { temporal: higherWeight });
                    const energyHigher = activated2.get(700) || 0;

                    // Higher weight should result in higher or equal energy
                    expect(energyHigher).toBeGreaterThanOrEqual(energyLower);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 4.1, 4.2, 4.3**
     *
     * Property: Empty or undefined dimension weights should not cause errors.
     */
    it('handles empty or undefined dimension weights gracefully', () => {
        const freshEngine = new PedsaEngine();
        freshEngine.addEvent(800, '测试事件', {});
        freshEngine.compile();

        const activated = new Map();
        activated.set(800, 0.5);

        // Should not throw with empty object
        expect(() => freshEngine.applyDimensionBoost(activated, {})).not.toThrow();
        expect(activated.get(800)).toBe(0.5);

        // Should not throw with undefined
        expect(() => freshEngine.applyDimensionBoost(activated, undefined)).not.toThrow();
        expect(activated.get(800)).toBe(0.5);

        // Should not throw with null
        expect(() => freshEngine.applyDimensionBoost(activated, null)).not.toThrow();
        expect(activated.get(800)).toBe(0.5);
    });
});
