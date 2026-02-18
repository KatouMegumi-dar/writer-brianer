/**
 * Property 1: 模板导入往返一致性
 * Property 2: 无效模板拒绝
 *
 * Feature: table-display-module
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

// Setup WBAP global before loading module
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;

// Mock storage
let mockGlobalPools = {};
let mockCharacterConfig = {};

// Setup mock functions
WBAP.getGlobalPools = () => mockGlobalPools;
WBAP.mainConfig = { globalPools: mockGlobalPools };
WBAP.CharacterManager = {
    getCurrentCharacterConfig: () => mockCharacterConfig
};
WBAP.config = mockCharacterConfig;
WBAP.saveConfig = async () => {};

await import('../modules/table_display.js');

const TableDisplay = window.WBAP.TableDisplay;

/**
 * Arbitrary for valid st-memory-enhancement template format
 * This generates templates that conform to the expected import format
 */
const validTemplateJsonArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    columns: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
    description: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
    config: fc.option(
        fc.record({
            note: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
            insertNode: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
            updateNode: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
            deleteNode: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
        }),
        { nil: undefined }
    ),
});

/**
 * Arbitrary for invalid template data - missing required fields
 */
const invalidTemplateArb = fc.oneof(
    // Missing name
    fc.record({
        columns: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
    }),
    // Empty name
    fc.record({
        name: fc.constant(''),
        columns: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
    }),
    // Whitespace-only name
    fc.record({
        name: fc.constant('   '),
        columns: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
    }),
    // Missing columns
    fc.record({
        name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    }),
    // Empty columns array
    fc.record({
        name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        columns: fc.constant([]),
    }),
    // Columns not an array
    fc.record({
        name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        columns: fc.string({ minLength: 1 }),
    }),
    // Columns with non-string elements
    fc.record({
        name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        columns: fc.array(fc.integer(), { minLength: 1, maxLength: 5 }),
    }),
    // Null value
    fc.constant(null),
    // Not an object (primitive)
    fc.oneof(fc.string(), fc.integer(), fc.boolean()),
);

describe('Feature: table-display-module, Property 1: 模板导入往返一致性', () => {
    beforeEach(() => {
        // Reset mock storage before each test
        mockGlobalPools = {};
        mockCharacterConfig = {};
        WBAP.mainConfig = { globalPools: mockGlobalPools };
        WBAP.config = mockCharacterConfig;
        TableDisplay.ensureTableDisplayConfig();
    });

    /**
     * **Validates: Requirements 3.1, 3.2, 3.5**
     *
     * For any valid st-memory-enhancement format template JSON,
     * importing then exporting should produce equivalent template data (excluding uid).
     */
    it('template import-export roundtrip preserves data (excluding uid)', () => {
        fc.assert(
            fc.property(validTemplateJsonArb, (templateData) => {
                // Reset storage for each iteration
                mockGlobalPools = {};
                WBAP.mainConfig = { globalPools: mockGlobalPools };
                TableDisplay.ensureTableDisplayConfig();

                const jsonString = JSON.stringify(templateData);

                // Import the template
                const imported = TableDisplay.importTemplate(jsonString);

                // Import should succeed
                expect(imported).not.toBeNull();
                expect(imported.uid).toBeDefined();
                expect(typeof imported.uid).toBe('string');

                // Export the template
                const exported = TableDisplay.exportTemplate(imported.uid);
                expect(exported).not.toBeNull();

                // Parse exported JSON
                const exportedData = JSON.parse(exported);

                // Verify core fields match
                expect(exportedData.name).toBe(templateData.name.trim());
                expect(exportedData.columns).toEqual(templateData.columns);

                // Verify optional fields
                if (templateData.description !== undefined) {
                    expect(exportedData.description).toBe(templateData.description);
                }

                // Verify config fields (with defaults)
                expect(exportedData.config).toBeDefined();
                expect(exportedData.config.note).toBe(templateData.config?.note || '');
                expect(exportedData.config.insertNode).toBe(templateData.config?.insertNode || '');
                expect(exportedData.config.updateNode).toBe(templateData.config?.updateNode || '');
                expect(exportedData.config.deleteNode).toBe(templateData.config?.deleteNode || '');

                return true;
            }),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 3.5**
     *
     * Imported templates SHALL be stored in globalPools.tableDisplay.templates
     */
    it('imported templates are stored in globalPools.tableDisplay.templates', () => {
        fc.assert(
            fc.property(validTemplateJsonArb, (templateData) => {
                // Reset storage for each iteration
                mockGlobalPools = {};
                WBAP.mainConfig = { globalPools: mockGlobalPools };
                TableDisplay.ensureTableDisplayConfig();

                const jsonString = JSON.stringify(templateData);
                const initialCount = TableDisplay.getTemplates().length;

                // Import the template
                const imported = TableDisplay.importTemplate(jsonString);
                expect(imported).not.toBeNull();

                // Verify template is in storage
                const templates = TableDisplay.getTemplates();
                expect(templates.length).toBe(initialCount + 1);

                // Verify template can be retrieved by uid
                const retrieved = TableDisplay.getTemplateByUid(imported.uid);
                expect(retrieved).not.toBeNull();
                expect(retrieved.uid).toBe(imported.uid);
                expect(retrieved.name).toBe(imported.name);

                return true;
            }),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 3.1, 3.2**
     *
     * Multiple imports should each create unique templates with unique UIDs
     */
    it('multiple imports create unique templates with unique UIDs', () => {
        fc.assert(
            fc.property(
                fc.array(validTemplateJsonArb, { minLength: 2, maxLength: 5 }),
                (templateDataArray) => {
                    // Reset storage for each iteration
                    mockGlobalPools = {};
                    WBAP.mainConfig = { globalPools: mockGlobalPools };
                    TableDisplay.ensureTableDisplayConfig();

                    const importedUids = [];

                    for (const templateData of templateDataArray) {
                        const jsonString = JSON.stringify(templateData);
                        const imported = TableDisplay.importTemplate(jsonString);
                        expect(imported).not.toBeNull();
                        importedUids.push(imported.uid);
                    }

                    // Verify all UIDs are unique
                    const uniqueUids = new Set(importedUids);
                    expect(uniqueUids.size).toBe(importedUids.length);

                    // Verify all templates are stored
                    expect(TableDisplay.getTemplates().length).toBe(templateDataArray.length);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});

describe('Feature: table-display-module, Property 2: 无效模板拒绝', () => {
    beforeEach(() => {
        // Reset mock storage before each test
        mockGlobalPools = {};
        mockCharacterConfig = {};
        WBAP.mainConfig = { globalPools: mockGlobalPools };
        WBAP.config = mockCharacterConfig;
        TableDisplay.ensureTableDisplayConfig();
    });

    /**
     * **Validates: Requirements 3.3, 3.4**
     *
     * For any JSON string that does not conform to st-memory-enhancement template spec,
     * import operation should return null and not modify existing template list.
     */
    it('invalid template JSON is rejected and does not modify template list', () => {
        fc.assert(
            fc.property(invalidTemplateArb, (invalidData) => {
                // Reset storage for each iteration
                mockGlobalPools = {};
                WBAP.mainConfig = { globalPools: mockGlobalPools };
                TableDisplay.ensureTableDisplayConfig();

                const initialTemplates = [...TableDisplay.getTemplates()];
                const jsonString = JSON.stringify(invalidData);

                // Attempt to import invalid template
                const result = TableDisplay.importTemplate(jsonString);

                // Import should fail
                expect(result).toBeNull();

                // Template list should be unchanged
                expect(TableDisplay.getTemplates()).toEqual(initialTemplates);

                return true;
            }),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 3.3, 3.4**
     *
     * Invalid JSON strings should be rejected
     */
    it('malformed JSON strings are rejected', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
                    try {
                        JSON.parse(s);
                        return false; // Valid JSON, skip
                    } catch {
                        return true; // Invalid JSON, keep
                    }
                }),
                (malformedJson) => {
                    // Reset storage for each iteration
                    mockGlobalPools = {};
                    WBAP.mainConfig = { globalPools: mockGlobalPools };
                    TableDisplay.ensureTableDisplayConfig();

                    const initialTemplates = [...TableDisplay.getTemplates()];

                    // Attempt to import malformed JSON
                    const result = TableDisplay.importTemplate(malformedJson);

                    // Import should fail
                    expect(result).toBeNull();

                    // Template list should be unchanged
                    expect(TableDisplay.getTemplates()).toEqual(initialTemplates);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 3.3, 3.4**
     *
     * validateTemplate should correctly identify invalid templates
     */
    it('validateTemplate correctly identifies invalid templates', () => {
        fc.assert(
            fc.property(invalidTemplateArb, (invalidData) => {
                const validation = TableDisplay.validateTemplate(invalidData);

                // Validation should fail
                expect(validation.valid).toBe(false);
                expect(validation.error).toBeDefined();
                expect(typeof validation.error).toBe('string');

                return true;
            }),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 3.3**
     *
     * validateTemplate should correctly identify valid templates
     */
    it('validateTemplate correctly identifies valid templates', () => {
        fc.assert(
            fc.property(validTemplateJsonArb, (validData) => {
                const validation = TableDisplay.validateTemplate(validData);

                // Validation should succeed
                expect(validation.valid).toBe(true);
                expect(validation.error).toBeUndefined();

                return true;
            }),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * Invalid imports should not affect subsequent valid imports
     */
    it('invalid imports do not affect subsequent valid imports', () => {
        fc.assert(
            fc.property(
                invalidTemplateArb,
                validTemplateJsonArb,
                (invalidData, validData) => {
                    // Reset storage for each iteration
                    mockGlobalPools = {};
                    WBAP.mainConfig = { globalPools: mockGlobalPools };
                    TableDisplay.ensureTableDisplayConfig();

                    // Attempt invalid import first
                    const invalidResult = TableDisplay.importTemplate(JSON.stringify(invalidData));
                    expect(invalidResult).toBeNull();

                    // Valid import should still work
                    const validResult = TableDisplay.importTemplate(JSON.stringify(validData));
                    expect(validResult).not.toBeNull();
                    expect(validResult.name).toBe(validData.name.trim());

                    // Only valid template should be stored
                    expect(TableDisplay.getTemplates().length).toBe(1);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});
