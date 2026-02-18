/**
 * Property 3: 存储位置正确性
 *
 * Feature: table-display-module, Property 3: 存储位置正确性
 *
 * **Validates: Requirements 4.1, 4.2**
 *
 * For any template and table data operations:
 * - Templates SHALL be stored in globalPools.tableDisplay.templates
 * - Table content SHALL be stored in globalPools.tableDisplay.tables (global shared)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

// Setup WBAP global before loading module
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;

// Mock mainConfig with globalPools for global storage
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

/** Arbitrary for table template */
const templateArb = fc.record({
    uid: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    columns: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 }),
    description: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
    config: fc.record({
        note: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
        insertNode: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
        updateNode: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
        deleteNode: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
    }),
    createdAt: fc.integer({ min: 0, max: Date.now() }),
});

/** Arbitrary for table row */
const tableRowArb = fc.record({
    uid: fc.uuid(),
    cells: fc.array(fc.string({ minLength: 0, maxLength: 100 }), { minLength: 1, maxLength: 10 }),
    createdAt: fc.integer({ min: 0, max: Date.now() }),
});

/** Arbitrary for table data */
const tableDataArb = fc.record({
    uid: fc.uuid(),
    templateUid: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    rows: fc.array(tableRowArb, { minLength: 0, maxLength: 20 }),
    enabled: fc.boolean(),
    updatedAt: fc.integer({ min: 0, max: Date.now() }),
});

describe('Feature: table-display-module, Property 3: 存储位置正确性', () => {
    beforeEach(() => {
        // Reset mock storage before each test
        mockGlobalPools = {};
        mockCharacterConfig = {};
        WBAP.mainConfig = { globalPools: mockGlobalPools };
        WBAP.config = mockCharacterConfig;
    });

    /**
     * **Validates: Requirements 4.1**
     *
     * Templates SHALL be stored in globalPools.tableDisplay.templates
     */
    it('templates are stored in globalPools.tableDisplay.templates', () => {
        fc.assert(
            fc.property(
                fc.array(templateArb, { minLength: 1, maxLength: 10 }),
                (templates) => {
                    // Reset storage
                    mockGlobalPools = {};
                    WBAP.mainConfig = { globalPools: mockGlobalPools };

                    // Ensure config structure exists
                    TableDisplay.ensureTableDisplayConfig();

                    // Manually add templates to global config
                    const globalConfig = TableDisplay.getGlobalTableDisplayConfig();
                    globalConfig.templates = templates;

                    // Verify templates are stored in correct location
                    expect(mockGlobalPools.tableDisplay).toBeDefined();
                    expect(mockGlobalPools.tableDisplay.templates).toBeDefined();
                    expect(Array.isArray(mockGlobalPools.tableDisplay.templates)).toBe(true);
                    expect(mockGlobalPools.tableDisplay.templates).toEqual(templates);

                    // Verify getTemplates returns from correct location
                    const retrievedTemplates = TableDisplay.getTemplates();
                    expect(retrievedTemplates).toEqual(templates);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 4.2**
     *
     * Table content SHALL be stored in globalPools.tableDisplay.tables (global shared)
     */
    it('table content is stored in globalPools.tableDisplay.tables', () => {
        fc.assert(
            fc.property(
                fc.array(tableDataArb, { minLength: 1, maxLength: 10 }),
                (tables) => {
                    // Reset storage
                    mockGlobalPools = {};
                    WBAP.mainConfig = { globalPools: mockGlobalPools };

                    // Ensure config structure exists
                    TableDisplay.ensureTableDisplayConfig();

                    // Manually add tables to global config
                    const globalConfig = TableDisplay.getGlobalTableDisplayConfig();
                    globalConfig.tables = tables;

                    // Verify tables are stored in global config
                    expect(mockGlobalPools.tableDisplay).toBeDefined();
                    expect(mockGlobalPools.tableDisplay.tables).toBeDefined();
                    expect(Array.isArray(mockGlobalPools.tableDisplay.tables)).toBe(true);
                    expect(mockGlobalPools.tableDisplay.tables).toEqual(tables);

                    // Verify getTables returns from correct location
                    const retrievedTables = TableDisplay.getTables();
                    expect(retrievedTables).toEqual(tables);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 4.1, 4.2**
     *
     * Templates and tables SHALL both be stored in globalPools.tableDisplay
     * Character config only stores per-character settings (enabled, extractTag, renderInMessage)
     */
    it('templates and tables are both stored in globalPools', () => {
        fc.assert(
            fc.property(
                fc.array(templateArb, { minLength: 1, maxLength: 5 }),
                fc.array(tableDataArb, { minLength: 1, maxLength: 5 }),
                (templates, tables) => {
                    // Reset storage
                    mockGlobalPools = {};
                    mockCharacterConfig = {};
                    WBAP.mainConfig = { globalPools: mockGlobalPools };
                    WBAP.config = mockCharacterConfig;

                    // Ensure config structure exists
                    TableDisplay.ensureTableDisplayConfig();

                    // Add templates and tables to global config
                    const globalConfig = TableDisplay.getGlobalTableDisplayConfig();
                    globalConfig.templates = templates;
                    globalConfig.tables = tables;

                    // Verify both are in global config
                    expect(mockGlobalPools.tableDisplay.templates).toEqual(templates);
                    expect(mockGlobalPools.tableDisplay.tables).toEqual(tables);

                    // Verify character config does NOT have templates or tables
                    expect(mockCharacterConfig.tableDisplay.templates).toBeUndefined();
                    expect(mockCharacterConfig.tableDisplay.tables).toBeUndefined();

                    // Verify character config only has per-character settings
                    expect(typeof mockCharacterConfig.tableDisplay.enabled).toBe('boolean');
                    expect(typeof mockCharacterConfig.tableDisplay.extractTag).toBe('string');
                    expect(typeof mockCharacterConfig.tableDisplay.renderInMessage).toBe('boolean');

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 4.1, 4.2**
     *
     * getConfig() SHALL return templates and tables from global config
     */
    it('getConfig returns templates and tables from global config', () => {
        fc.assert(
            fc.property(
                fc.array(templateArb, { minLength: 0, maxLength: 5 }),
                fc.array(tableDataArb, { minLength: 0, maxLength: 5 }),
                (templates, tables) => {
                    // Reset storage
                    mockGlobalPools = {};
                    mockCharacterConfig = {};
                    WBAP.mainConfig = { globalPools: mockGlobalPools };
                    WBAP.config = mockCharacterConfig;

                    // Ensure config structure exists
                    TableDisplay.ensureTableDisplayConfig();

                    // Add templates and tables to global config
                    const globalConfig = TableDisplay.getGlobalTableDisplayConfig();
                    globalConfig.templates = templates;
                    globalConfig.tables = tables;

                    // Get merged config
                    const config = TableDisplay.getConfig();

                    // Verify templates come from global config
                    expect(config.templates).toEqual(templates);
                    expect(config.global.templates).toEqual(templates);

                    // Verify tables come from global config
                    expect(config.tables).toEqual(tables);
                    expect(config.global.tables).toEqual(tables);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 4.1, 4.2**
     *
     * ensureTableDisplayConfig SHALL create correct default structures
     * in both global and character config locations
     */
    it('ensureTableDisplayConfig creates correct default structures', () => {
        fc.assert(
            fc.property(
                fc.boolean(), // Whether global config pre-exists
                fc.boolean(), // Whether character config pre-exists
                (hasGlobal, hasCharacter) => {
                    // Reset storage
                    mockGlobalPools = hasGlobal ? { tableDisplay: { templates: [], tables: [] } } : {};
                    mockCharacterConfig = hasCharacter ? { tableDisplay: { enabled: false } } : {};
                    WBAP.mainConfig = { globalPools: mockGlobalPools };
                    WBAP.config = mockCharacterConfig;

                    // Ensure config structure
                    const result = TableDisplay.ensureTableDisplayConfig();

                    // Verify global config structure (templates + tables + apiConfig)
                    expect(result.global).toBeDefined();
                    expect(Array.isArray(result.global.templates)).toBe(true);
                    expect(Array.isArray(result.global.tables)).toBe(true);
                    expect(result.global.apiConfig).toBeDefined();

                    // Verify character config structure (no tables - only settings)
                    expect(result.character).toBeDefined();
                    expect(typeof result.character.enabled).toBe('boolean');
                    expect(typeof result.character.extractTag).toBe('string');
                    expect(typeof result.character.renderInMessage).toBe('boolean');

                    // Verify storage locations
                    expect(mockGlobalPools.tableDisplay).toBe(result.global);
                    expect(mockCharacterConfig.tableDisplay).toBe(result.character);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});
