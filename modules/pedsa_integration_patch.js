/**
 * PEDSA 集成补丁 - 在 super_memory.js 的 retrieve 方法开头插入
 *
 * 使用方法：
 * 1. 在 super_memory.js 的 retrieve 方法中，第 47 行之后插入此代码
 * 2. 确保 pedsa_client.js 已加载
 */

// ============ PEDSA 集成开始 ============

// 0. 初始化 PEDSA 客户端（如果尚未初始化）
if (WBAP.PedsaClient && !WBAP.PedsaClient._initialized) {
    await WBAP.PedsaClient.init();
    WBAP.PedsaClient._initialized = true;
}

// 1. 尝试使用 PEDSA 快速预检索
let pedsaResults = null;
let usePedsa = config.usePedsaRetrieval !== false && WBAP.PedsaClient?.isAvailable;

if (usePedsa) {
    Logger.log('[SuperMemory] 🚀 使用 PEDSA 快速预检索');

    // 1.1 首次同步数据（如果需要）
    if (!WBAP.PedsaClient._synced) {
        Logger.log('[SuperMemory] 首次同步世界书数据到 PEDSA...');

        // 转换世界书格式
        const worldbooks = [];
        for (const bookName of selectedBooks) {
            const book = await WBAP.loadWorldBookEntriesByName?.(bookName);
            if (book && book.entries) {
                const entries = Object.values(book.entries)
                    .filter(e => e && e.disable !== true);

                const convertedEntries = WBAP.PedsaClient.convertEntriesToPedsaFormat(entries, bookName);
                worldbooks.push({
                    name: bookName,
                    entries: convertedEntries
                });
            }
        }

        // 构建本体边（示例）
        const ontology = [
            { source: '佩罗', target: '女孩', weight: 1.0, is_equality: false },
            { source: 'Pero', target: '佩罗', weight: 1.0, is_equality: true },
            { source: 'TS', target: 'TypeScript', weight: 1.0, is_equality: true },
            { source: 'Rust', target: '编程语言', weight: 0.9, is_equality: false },
            // 可以从配置中加载更多本体边
        ];

        const syncResult = await WBAP.PedsaClient.sync(worldbooks, ontology);
        if (syncResult.success) {
            WBAP.PedsaClient._synced = true;
            Logger.log('[SuperMemory] ✅ PEDSA 同步完成');
        } else {
            Logger.warn('[SuperMemory] ⚠️ PEDSA 同步失败，降级到纯 JS 模式');
            usePedsa = false;
        }
    }

    // 1.2 执行 PEDSA 检索
    if (usePedsa) {
        const startTime = performance.now();
        pedsaResults = await WBAP.PedsaClient.retrieve(userInput, {
            top_k: 20,
            enable_temporal: true,
            enable_affective: true,
            enable_spatial: true
        });
        const pedsaTime = performance.now() - startTime;

        if (pedsaResults.success) {
            Logger.log(`[SuperMemory] ⚡ PEDSA 检索完成: ${pedsaResults.results.length} 个结果, 耗时 ${pedsaTime.toFixed(2)}ms`);

            // 1.3 根据 PEDSA 结果筛选世界书内容
            if (pedsaResults.results.length > 0) {
                const originalCount = worldbookContent.length;
                worldbookContent = WBAP.PedsaClient.filterEntriesByPedsaResults(
                    worldbookContent,
                    pedsaResults.results
                );
                Logger.log(`[SuperMemory] 📊 PEDSA 筛选: ${originalCount} → ${worldbookContent.length} 条目`);

                // 如果筛选后条目太少，补充一些高重要度条目
                if (worldbookContent.length < 5 && originalCount > worldbookContent.length) {
                    const existingUids = new Set(worldbookContent.map(e => e.uid));
                    const additional = worldbookContent
                        .filter(e => !existingUids.has(e.uid))
                        .slice(0, 5 - worldbookContent.length);
                    worldbookContent.push(...additional);
                    Logger.log(`[SuperMemory] 补充 ${additional.length} 个条目`);
                }
            }
        } else {
            Logger.warn('[SuperMemory] PEDSA 检索失败，使用全量数据');
        }
    }
}

// ============ PEDSA 集成结束 ============

// 继续原有的图谱检索流程...
// （原 super_memory.js 第 49 行开始的代码）
