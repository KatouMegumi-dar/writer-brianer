/**
 * Property 8: 检索词列表规范性
 *
 * Feature: graph-driven-pedsa-retrieval, Property 8: 检索词列表规范性
 *
 * **Validates: Requirements 2.4, 2.5**
 *
 * For any QueryBuilder output, the terms list SHALL satisfy:
 * - No duplicate terms (by term field, case-insensitive)
 * - Sorted by weight in descending order
 * - Length does not exceed maxEnhancedTerms configuration
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Setup WBAP global before loading module
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

await import('../modules/super_memory.js');

const QueryBuilder = window.WBAP.QueryBuilder;

/** Arbitrary for SeedNode */
const seedNodeArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    label: fc.string({ minLength: 1, maxLength: 30 }),
    energy: fc.double({ min: 0, max: 1, noNaN: true }),
    keys: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
    type: fc.constantFrom('concept', 'entity', 'event', 'character'),
});

/** Arbitrary for RelationPath */
const relationPathArb = fc.record({
    source: fc.string({ minLength: 1, maxLength: 30 }),
    target: fc.string({ minLength: 1, maxLength: 30 }),
    dimension: fc.constantFrom('temporal', 'spatial', 'emotional', 'causal', 'character', 'thematic'),
    strength: fc.double({ min: 0, max: 1, noNaN: true }),
});

/** Arbitrary for dimensionWeights */
const dimensionWeightsArb = fc.dictionary(
    fc.constantFrom('temporal', 'spatial', 'emotional', 'causal', 'character', 'thematic'),
    fc.double({ min: 0, max: 1, noNaN: true })
);

/** Arbitrary for GraphInsight */
const graphInsightArb = fc.record({
    nodes: fc.array(seedNodeArb, { minLength: 0, maxLength: 10 }),
    dimensionWeights: dimensionWeightsArb,
    paths: fc.array(relationPathArb, { minLength: 0, maxLength: 10 }),
    seedCount: fc.integer({ min: 0, max: 10 }),
});

describe('Feature: graph-driven-pedsa-retrieval, Property 8: 检索词列表规范性', () => {
    /**
     * **Validates: Requirements 2.4**
     *
     * For any GraphInsight input, the output terms list SHALL have no duplicate terms
     * (case-insensitive comparison on the term field).
     */
    it('output terms list has no duplicates (case-insensitive)', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 0, maxLength: 50 }),
                graphInsightArb,
                fc.integer({ min: 1, max: 30 }),
                (originalQuery, graphInsight, maxTerms) => {
                    const config = { maxEnhancedTerms: maxTerms };
                    const result = QueryBuilder.buildEnhancedQuery(originalQuery, graphInsight, config);

                    // Check for duplicates (case-insensitive)
                    const termsLower = result.terms.map(t => t.term.toLowerCase());
                    const uniqueTerms = [...new Set(termsLower)];

                    expect(termsLower.length).toBe(uniqueTerms.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 2.4**
     *
     * For any GraphInsight input, the output terms list SHALL be sorted
     * by weight in descending order.
     */
    it('output terms list is sorted by weight in descending order', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 0, maxLength: 50 }),
                graphInsightArb,
                fc.integer({ min: 1, max: 30 }),
                (originalQuery, graphInsight, maxTerms) => {
                    const config = { maxEnhancedTerms: maxTerms };
                    const result = QueryBuilder.buildEnhancedQuery(originalQuery, graphInsight, config);

                    // Check descending order by weight
                    for (let i = 1; i < result.terms.length; i++) {
                        expect(result.terms[i].weight).toBeLessThanOrEqual(result.terms[i - 1].weight);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 2.5**
     *
     * For any GraphInsight input and maxEnhancedTerms configuration,
     * the output terms list length SHALL NOT exceed maxEnhancedTerms.
     */
    it('output terms list length does not exceed maxEnhancedTerms', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 0, maxLength: 50 }),
                graphInsightArb,
                fc.integer({ min: 1, max: 30 }),
                (originalQuery, graphInsight, maxTerms) => {
                    const config = { maxEnhancedTerms: maxTerms };
                    const result = QueryBuilder.buildEnhancedQuery(originalQuery, graphInsight, config);

                    expect(result.terms.length).toBeLessThanOrEqual(maxTerms);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Combined property test: all three properties together
     *
     * **Validates: Requirements 2.4, 2.5**
     */
    it('output terms list satisfies all normalization properties', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 0, maxLength: 50 }),
                graphInsightArb,
                fc.integer({ min: 1, max: 30 }),
                (originalQuery, graphInsight, maxTerms) => {
                    const config = { maxEnhancedTerms: maxTerms };
                    const result = QueryBuilder.buildEnhancedQuery(originalQuery, graphInsight, config);

                    // Property 1: No duplicates (case-insensitive)
                    const termsLower = result.terms.map(t => t.term.toLowerCase());
                    const uniqueTerms = [...new Set(termsLower)];
                    if (termsLower.length !== uniqueTerms.length) {
                        return false;
                    }

                    // Property 2: Sorted by weight descending
                    for (let i = 1; i < result.terms.length; i++) {
                        if (result.terms[i].weight > result.terms[i - 1].weight) {
                            return false;
                        }
                    }

                    // Property 3: Length <= maxEnhancedTerms
                    if (result.terms.length > maxTerms) {
                        return false;
                    }

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Additional property: totalTerms field matches actual terms length
     */
    it('totalTerms field matches actual terms array length', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 0, maxLength: 50 }),
                graphInsightArb,
                fc.integer({ min: 1, max: 30 }),
                (originalQuery, graphInsight, maxTerms) => {
                    const config = { maxEnhancedTerms: maxTerms };
                    const result = QueryBuilder.buildEnhancedQuery(originalQuery, graphInsight, config);

                    expect(result.totalTerms).toBe(result.terms.length);
                }
            ),
            { numRuns: 100 }
        );
    });
});
