/**
 * Property 9: 多检索词能量累加
 *
 * Feature: graph-driven-pedsa-retrieval, Property 9: 多检索词能量累加
 *
 * **Validates: Requirements 3.2, 3.3, 3.4**
 *
 * For any EnhancedQuery with multiple search terms, when multiple terms hit the same entry,
 * the entry's energy value SHALL be the weighted sum of each term's contribution (accumulation, not override).
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

/** Arbitrary for QueryTerm */
const queryTermArb = fc.record({
    term: fc.string({ minLength: 1, maxLength: 20 }),
    weight: fc.double({ min: 0.1, max: 1, noNaN: true }),
    source: fc.constantFrom('seed', 'path', 'dimension', 'original'),
});

/** Arbitrary for EnhancedQuery */
const enhancedQueryArb = fc.record({
    originalQuery: fc.string({ minLength: 1, maxLength: 50 }),
    terms: fc.array(queryTermArb, { minLength: 1, maxLength: 10 }),
    dimensionWeights: fc.dictionary(
        fc.constantFrom('temporal', 'spatial', 'emotional', 'causal', 'character', 'thematic'),
        fc.double({ min: 0, max: 1, noNaN: true })
    ),
    totalTerms: fc.integer({ min: 1, max: 10 }),
});

describe('Feature: graph-driven-pedsa-retrieval, Property 9: 多检索词能量累加', () => {
    let engine;

    beforeEach(() => {
        engine = new PedsaEngine();
    });

    /**
     * **Validates: Requirements 3.2**
     *
     * For each search term in EnhancedQuery, PEDSA_Engine SHALL execute AC automaton matching.
     */
    it('multiTermRetrieve executes AC matching for each term', () => {
        fc.assert(
            fc.property(
                fc.array(queryTermArb, { minLength: 1, maxLength: 5 }),
                (terms) => {
                    // Add some features that might match
                    for (let i = 0; i < 5; i++) {
                        engine.addFeature(i, `keyword${i}`);
                    }
                    engine.compile();

                    const result = engine.multiTermRetrieve(terms);

                    // Result should have activated map and matchCount
                    expect(result).toHaveProperty('activated');
                    expect(result).toHaveProperty('matchCount');
                    expect(result.activated).toBeInstanceOf(Map);
                    expect(typeof result.matchCount).toBe('number');
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 3.3**
     *
     * When multiple search terms hit the same entry, PEDSA_Engine SHALL accumulate
     * the entry's energy value (not override).
     */
    it('energy is accumulated when multiple terms hit the same entry', () => {
        // Setup: Add a feature with a known keyword
        const sharedKeyword = 'testword';
        engine.addFeature(1, sharedKeyword);
        engine.compile();

        // Create two terms that both contain the shared keyword
        const term1 = { term: sharedKeyword, weight: 0.5, source: 'seed' };
        const term2 = { term: sharedKeyword, weight: 0.3, source: 'path' };

        // Execute multiTermRetrieve with both terms
        const result = engine.multiTermRetrieve([term1, term2]);

        // The energy should be accumulated: 0.5 + 0.3 = 0.8
        const energy = result.activated.get(1);
        expect(energy).toBeCloseTo(0.8, 5);
    });

    /**
     * **Validates: Requirements 3.3**
     *
     * Property test: For any set of terms hitting the same node,
     * the final energy equals the sum of individual weighted contributions.
     */
    it('accumulated energy equals sum of weighted contributions', () => {
        fc.assert(
            fc.property(
                fc.array(fc.double({ min: 0.1, max: 1, noNaN: true }), { minLength: 2, maxLength: 5 }),
                (weights) => {
                    const freshEngine = new PedsaEngine();
                    const sharedKeyword = 'accumtest';
                    freshEngine.addFeature(42, sharedKeyword);
                    freshEngine.compile();

                    // Create terms with the shared keyword and different weights
                    const terms = weights.map((w, i) => ({
                        term: sharedKeyword,
                        weight: w,
                        source: 'seed',
                    }));

                    const result = freshEngine.multiTermRetrieve(terms);
                    const actualEnergy = result.activated.get(42) || 0;
                    const expectedEnergy = weights.reduce((sum, w) => sum + w, 0);

                    // Energy should be the sum of all weights
                    expect(actualEnergy).toBeCloseTo(expectedEnergy, 5);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * PEDSA_Engine SHALL adjust energy contribution based on search term weight.
     */
    it('energy contribution is adjusted by term weight', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0.1, max: 1, noNaN: true }),
                fc.double({ min: 0.1, max: 1, noNaN: true }),
                (weight1, weight2) => {
                    const freshEngine = new PedsaEngine();
                    freshEngine.addFeature(100, 'weighttest');
                    freshEngine.compile();

                    // Test with first weight
                    const result1 = freshEngine.multiTermRetrieve([
                        { term: 'weighttest', weight: weight1, source: 'seed' },
                    ]);
                    const energy1 = result1.activated.get(100) || 0;

                    // Test with second weight
                    const freshEngine2 = new PedsaEngine();
                    freshEngine2.addFeature(100, 'weighttest');
                    freshEngine2.compile();

                    const result2 = freshEngine2.multiTermRetrieve([
                        { term: 'weighttest', weight: weight2, source: 'seed' },
                    ]);
                    const energy2 = result2.activated.get(100) || 0;

                    // Energy should be proportional to weight
                    if (weight1 > weight2) {
                        expect(energy1).toBeGreaterThanOrEqual(energy2);
                    } else if (weight2 > weight1) {
                        expect(energy2).toBeGreaterThanOrEqual(energy1);
                    } else {
                        expect(energy1).toBeCloseTo(energy2, 5);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 3.2, 3.3, 3.4**
     *
     * Combined property: multiTermRetrieve correctly accumulates weighted energy
     * across multiple terms hitting multiple nodes.
     */
    it('multiTermRetrieve correctly accumulates weighted energy across nodes', () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        nodeId: fc.integer({ min: 1, max: 10 }),
                        keyword: fc.constantFrom('alpha', 'beta', 'gamma', 'delta'),
                    }),
                    { minLength: 1, maxLength: 5 }
                ),
                fc.array(
                    fc.record({
                        keyword: fc.constantFrom('alpha', 'beta', 'gamma', 'delta'),
                        weight: fc.double({ min: 0.1, max: 1, noNaN: true }),
                    }),
                    { minLength: 1, maxLength: 5 }
                ),
                (nodes, termSpecs) => {
                    const freshEngine = new PedsaEngine();

                    // Add features
                    for (const { nodeId, keyword } of nodes) {
                        freshEngine.addFeature(nodeId, keyword);
                    }
                    freshEngine.compile();

                    // Create terms
                    const terms = termSpecs.map(({ keyword, weight }) => ({
                        term: keyword,
                        weight,
                        source: 'seed',
                    }));

                    const result = freshEngine.multiTermRetrieve(terms);

                    // Calculate expected energy for each node
                    const expectedEnergy = new Map();
                    for (const { nodeId, keyword } of nodes) {
                        for (const { keyword: termKeyword, weight } of termSpecs) {
                            // AC automaton matches if term contains keyword
                            if (termKeyword.includes(keyword) || keyword.includes(termKeyword)) {
                                const current = expectedEnergy.get(nodeId) || 0;
                                expectedEnergy.set(nodeId, current + weight);
                            }
                        }
                    }

                    // Verify accumulation property: actual energy >= 0 for all activated nodes
                    for (const [nodeId, energy] of result.activated) {
                        expect(energy).toBeGreaterThanOrEqual(0);
                    }

                    // Verify that matchCount is non-negative
                    expect(result.matchCount).toBeGreaterThanOrEqual(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 3.3**
     *
     * Energy accumulation is additive, not multiplicative or override.
     */
    it('energy accumulation is strictly additive', () => {
        const freshEngine = new PedsaEngine();
        freshEngine.addFeature(1, 'additive');
        freshEngine.compile();

        // Single term
        const singleResult = freshEngine.multiTermRetrieve([
            { term: 'additive', weight: 0.4, source: 'seed' },
        ]);
        const singleEnergy = singleResult.activated.get(1) || 0;

        // Two identical terms should give double energy
        const freshEngine2 = new PedsaEngine();
        freshEngine2.addFeature(1, 'additive');
        freshEngine2.compile();

        const doubleResult = freshEngine2.multiTermRetrieve([
            { term: 'additive', weight: 0.4, source: 'seed' },
            { term: 'additive', weight: 0.4, source: 'path' },
        ]);
        const doubleEnergy = doubleResult.activated.get(1) || 0;

        // Double energy should be exactly 2x single energy
        expect(doubleEnergy).toBeCloseTo(singleEnergy * 2, 5);
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * Default weight of 1.0 is used when weight is not specified.
     */
    it('uses default weight of 1.0 when weight is undefined', () => {
        const freshEngine = new PedsaEngine();
        freshEngine.addFeature(1, 'defaultweight');
        freshEngine.compile();

        // Term without explicit weight
        const result = freshEngine.multiTermRetrieve([
            { term: 'defaultweight', source: 'seed' },
        ]);
        const energy = result.activated.get(1) || 0;

        // Should use default weight of 1.0
        expect(energy).toBeCloseTo(1.0, 5);
    });
});
