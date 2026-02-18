/**
 * Property 14: 结果截断保留最优
 *
 * Feature: graph-driven-pedsa-retrieval, Property 14: 结果截断保留最优
 *
 * **Validates: Requirements 5.4**
 *
 * For any result set exceeding the configured limit, truncation SHALL:
 * - Preserve the entries with highest relevance scores
 * - Result count equals the configured maxResults value (when input exceeds limit)
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Setup WBAP global before loading module
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

await import('../modules/super_memory.js');

const SuperMemory = window.WBAP.SuperMemory;

/** Arbitrary for worldbook entry */
const worldbookEntryArb = fc.record({
    uid: fc.integer({ min: 1, max: 100000 }),
    key: fc.string({ minLength: 1, maxLength: 30 }),
    comment: fc.string({ minLength: 1, maxLength: 50 }),
    content: fc.string({ minLength: 1, maxLength: 200 }),
    book: fc.string({ minLength: 1, maxLength: 20 }),
});

/** Arbitrary for PEDSA result item */
const pedsaResultItemArb = (entry) => fc.record({
    originalEntry: fc.constant(entry),
    score: fc.double({ min: 0, max: 1, noNaN: true }),
});

/** Arbitrary for SeedNode in GraphInsight */
const seedNodeArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    label: fc.string({ minLength: 1, maxLength: 30 }),
    energy: fc.double({ min: 0, max: 1, noNaN: true }),
    keys: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
    type: fc.constantFrom('concept', 'entity', 'event', 'character'),
    entry: fc.option(fc.record({
        uid: fc.integer({ min: 1, max: 100000 }),
    }), { nil: undefined }),
});

/** Arbitrary for GraphInsight */
const graphInsightArb = fc.record({
    nodes: fc.array(seedNodeArb, { minLength: 0, maxLength: 10 }),
    dimensionWeights: fc.dictionary(
        fc.constantFrom('temporal', 'spatial', 'emotional', 'causal', 'character', 'thematic'),
        fc.double({ min: 0, max: 1, noNaN: true })
    ),
    paths: fc.array(fc.record({
        source: fc.string({ minLength: 1, maxLength: 30 }),
        target: fc.string({ minLength: 1, maxLength: 30 }),
        dimension: fc.constantFrom('temporal', 'spatial', 'emotional', 'causal', 'character', 'thematic'),
        strength: fc.double({ min: 0, max: 1, noNaN: true }),
    }), { minLength: 0, maxLength: 5 }),
    seedCount: fc.integer({ min: 0, max: 10 }),
});

describe('Feature: graph-driven-pedsa-retrieval, Property 14: 结果截断保留最优', () => {
    /**
     * **Validates: Requirements 5.4**
     *
     * When result count exceeds maxResults, truncation SHALL preserve
     * entries with highest relevance scores.
     */
    it('truncation preserves highest scoring entries', () => {
        fc.assert(
            fc.property(
                // Generate worldbook entries with unique UIDs
                fc.array(worldbookEntryArb, { minLength: 5, maxLength: 30 })
                    .map(entries => {
                        // Ensure unique UIDs
                        const seen = new Set();
                        return entries.filter(e => {
                            if (seen.has(e.uid)) return false;
                            seen.add(e.uid);
                            return true;
                        });
                    }),
                // Generate maxResults config (smaller than potential entries)
                fc.integer({ min: 3, max: 15 }),
                (worldbookContent, maxResults) => {
                    // Skip if not enough entries
                    if (worldbookContent.length < maxResults + 1) return true;

                    // Create PEDSA results with random scores
                    const pedsaResults = {
                        results: worldbookContent.map(entry => ({
                            originalEntry: entry,
                            score: Math.random(), // Random score for each entry
                        })),
                    };

                    // Empty graph insight (only PEDSA results)
                    const graphInsight = { nodes: [], paths: [], dimensionWeights: {} };

                    const config = { maxResults };
                    const result = SuperMemory.mergeGraphAndPedsaResults(
                        graphInsight,
                        pedsaResults,
                        worldbookContent,
                        config
                    );

                    // Get the scores that should have been preserved (top maxResults)
                    const allScores = pedsaResults.results.map(r => r.score).sort((a, b) => b - a);
                    const minPreservedScore = allScores[maxResults - 1];

                    // Verify all preserved entries have scores >= minimum threshold
                    for (const entry of result.entries) {
                        expect(entry.relevanceScore).toBeGreaterThanOrEqual(minPreservedScore - 0.0001);
                    }

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * When input exceeds limit, result count SHALL equal maxResults.
     */
    it('result count equals maxResults when input exceeds limit', () => {
        fc.assert(
            fc.property(
                // Generate worldbook entries with unique UIDs
                fc.array(worldbookEntryArb, { minLength: 10, maxLength: 40 })
                    .map(entries => {
                        const seen = new Set();
                        return entries.filter(e => {
                            if (seen.has(e.uid)) return false;
                            seen.add(e.uid);
                            return true;
                        });
                    }),
                fc.integer({ min: 3, max: 10 }),
                (worldbookContent, maxResults) => {
                    // Skip if not enough entries to exceed limit
                    if (worldbookContent.length <= maxResults) return true;

                    const pedsaResults = {
                        results: worldbookContent.map(entry => ({
                            originalEntry: entry,
                            score: Math.random(),
                        })),
                    };

                    const graphInsight = { nodes: [], paths: [], dimensionWeights: {} };
                    const config = { maxResults };

                    const result = SuperMemory.mergeGraphAndPedsaResults(
                        graphInsight,
                        pedsaResults,
                        worldbookContent,
                        config
                    );

                    expect(result.entries.length).toBe(maxResults);
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * Truncated results SHALL be sorted by relevance score in descending order.
     */
    it('truncated results are sorted by relevance score descending', () => {
        fc.assert(
            fc.property(
                fc.array(worldbookEntryArb, { minLength: 5, maxLength: 30 })
                    .map(entries => {
                        const seen = new Set();
                        return entries.filter(e => {
                            if (seen.has(e.uid)) return false;
                            seen.add(e.uid);
                            return true;
                        });
                    }),
                fc.integer({ min: 3, max: 15 }),
                (worldbookContent, maxResults) => {
                    if (worldbookContent.length < 2) return true;

                    const pedsaResults = {
                        results: worldbookContent.map(entry => ({
                            originalEntry: entry,
                            score: Math.random(),
                        })),
                    };

                    const graphInsight = { nodes: [], paths: [], dimensionWeights: {} };
                    const config = { maxResults };

                    const result = SuperMemory.mergeGraphAndPedsaResults(
                        graphInsight,
                        pedsaResults,
                        worldbookContent,
                        config
                    );

                    // Verify descending order
                    for (let i = 1; i < result.entries.length; i++) {
                        expect(result.entries[i].relevanceScore)
                            .toBeLessThanOrEqual(result.entries[i - 1].relevanceScore);
                    }

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 5.4**
     *
     * totalBeforeTruncation SHALL reflect the original count before truncation.
     */
    it('totalBeforeTruncation reflects original count', () => {
        fc.assert(
            fc.property(
                fc.array(worldbookEntryArb, { minLength: 5, maxLength: 30 })
                    .map(entries => {
                        const seen = new Set();
                        return entries.filter(e => {
                            if (seen.has(e.uid)) return false;
                            seen.add(e.uid);
                            return true;
                        });
                    }),
                fc.integer({ min: 3, max: 10 }),
                (worldbookContent, maxResults) => {
                    if (worldbookContent.length < 1) return true;

                    const pedsaResults = {
                        results: worldbookContent.map(entry => ({
                            originalEntry: entry,
                            score: Math.random(),
                        })),
                    };

                    const graphInsight = { nodes: [], paths: [], dimensionWeights: {} };
                    const config = { maxResults };

                    const result = SuperMemory.mergeGraphAndPedsaResults(
                        graphInsight,
                        pedsaResults,
                        worldbookContent,
                        config
                    );

                    // totalBeforeTruncation should equal the number of unique entries from PEDSA
                    expect(result.totalBeforeTruncation).toBe(worldbookContent.length);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Combined property: truncation preserves optimal entries with correct count
     *
     * **Validates: Requirements 5.4**
     */
    it('truncation satisfies all optimality properties', () => {
        fc.assert(
            fc.property(
                fc.array(worldbookEntryArb, { minLength: 10, maxLength: 40 })
                    .map(entries => {
                        const seen = new Set();
                        return entries.filter(e => {
                            if (seen.has(e.uid)) return false;
                            seen.add(e.uid);
                            return true;
                        });
                    }),
                fc.integer({ min: 3, max: 10 }),
                (worldbookContent, maxResults) => {
                    // Need enough entries to test truncation
                    if (worldbookContent.length <= maxResults) return true;

                    const pedsaResults = {
                        results: worldbookContent.map(entry => ({
                            originalEntry: entry,
                            score: Math.random(),
                        })),
                    };

                    const graphInsight = { nodes: [], paths: [], dimensionWeights: {} };
                    const config = { maxResults };

                    const result = SuperMemory.mergeGraphAndPedsaResults(
                        graphInsight,
                        pedsaResults,
                        worldbookContent,
                        config
                    );

                    // Property 1: Count equals maxResults
                    if (result.entries.length !== maxResults) {
                        return false;
                    }

                    // Property 2: Sorted descending
                    for (let i = 1; i < result.entries.length; i++) {
                        if (result.entries[i].relevanceScore > result.entries[i - 1].relevanceScore) {
                            return false;
                        }
                    }

                    // Property 3: Preserved entries are the top scorers
                    const allScores = pedsaResults.results.map(r => r.score).sort((a, b) => b - a);
                    const minPreservedScore = allScores[maxResults - 1];
                    for (const entry of result.entries) {
                        if (entry.relevanceScore < minPreservedScore - 0.0001) {
                            return false;
                        }
                    }

                    // Property 4: totalBeforeTruncation is correct
                    if (result.totalBeforeTruncation !== worldbookContent.length) {
                        return false;
                    }

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});
