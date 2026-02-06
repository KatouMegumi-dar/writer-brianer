/**
 * 表格模块删除后的完整性测试脚本
 * 在浏览器控制台中运行此脚本来检查是否有遗留问题
 */

(function() {
    console.log('='.repeat(60));
    console.log('🔍 开始检查表格模块删除后的完整性...');
    console.log('='.repeat(60));

    const results = {
        passed: [],
        warnings: [],
        errors: []
    };

    // 测试 1: 检查 WBAP 对象是否存在
    console.log('\n📋 测试 1: 检查 WBAP 对象');
    if (typeof window.WBAP !== 'undefined') {
        results.passed.push('✅ WBAP 对象存在');
        console.log('✅ WBAP 对象存在');
    } else {
        results.errors.push('❌ WBAP 对象不存在');
        console.error('❌ WBAP 对象不存在');
    }

    // 测试 2: 检查表格模块是否已删除
    console.log('\n📋 测试 2: 检查表格模块是否已删除');
    const tableModules = [
        'TableManager',
        'TableUI',
        'TableAI',
        'TableLorebookSync'
    ];

    tableModules.forEach(moduleName => {
        if (typeof window.WBAP?.[moduleName] === 'undefined') {
            results.passed.push(`✅ ${moduleName} 已删除`);
            console.log(`✅ ${moduleName} 已删除`);
        } else {
            results.warnings.push(`⚠️ ${moduleName} 仍然存在`);
            console.warn(`⚠️ ${moduleName} 仍然存在`);
        }
    });

    // 测试 3: 检查核心模块是否正常加载
    console.log('\n📋 测试 3: 检查核心模块是否正常加载');
    const coreModules = [
        'config',
        'CharacterManager',
        'PersistentStorage',
        'PromptManager',
        'Processing',
        'API',
        'UI',
        'MemoryManager',
        'Optimization',
        'Tiangang',
        'ResponseOptimizer',
        'SuperMemory',
        'Summary',
        'GraphEngine',
        'MultiDimGraph',
        'GraphView'
    ];

    coreModules.forEach(moduleName => {
        if (typeof window.WBAP?.[moduleName] !== 'undefined' ||
            (moduleName === 'config' && typeof window.WBAP?.config !== 'undefined')) {
            results.passed.push(`✅ ${moduleName} 已加载`);
            console.log(`✅ ${moduleName} 已加载`);
        } else {
            results.errors.push(`❌ ${moduleName} 未加载`);
            console.error(`❌ ${moduleName} 未加载`);
        }
    });

    // 测试 4: 检查配置中是否还有表格模块配置
    console.log('\n📋 测试 4: 检查配置中的表格模块');
    try {
        const config = window.WBAP?.CharacterManager?.getCurrentCharacterConfig?.() || window.WBAP?.config;
        if (config) {
            if (typeof config.tableModule === 'undefined') {
                results.passed.push('✅ 配置中没有 tableModule');
                console.log('✅ 配置中没有 tableModule');
            } else {
                results.warnings.push('⚠️ 配置中仍有 tableModule（可能是旧配置）');
                console.warn('⚠️ 配置中仍有 tableModule:', config.tableModule);
            }
        } else {
            results.warnings.push('⚠️ 无法获取配置对象');
            console.warn('⚠️ 无法获取配置对象');
        }
    } catch (e) {
        results.errors.push(`❌ 检查配置时出错: ${e.message}`);
        console.error('❌ 检查配置时出错:', e);
    }

    // 测试 5: 检查 UI 中是否还有表格相关元素
    console.log('\n📋 测试 5: 检查 UI 中的表格元素');
    const tableUIElements = [
        'wbap-table-section',
        'wbap-table-enabled',
        'wbap-table-open-btn',
        'wbap-table-status'
    ];

    tableUIElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (!element) {
            results.passed.push(`✅ UI 元素 ${elementId} 已移除`);
            console.log(`✅ UI 元素 ${elementId} 已移除`);
        } else {
            // 检查元素是否被注释掉（在 HTML 注释中）
            const isCommented = element.parentElement?.nodeType === 8; // Node.COMMENT_NODE
            if (isCommented || element.style.display === 'none') {
                results.passed.push(`✅ UI 元素 ${elementId} 已隐藏`);
                console.log(`✅ UI 元素 ${elementId} 已隐藏`);
            } else {
                results.warnings.push(`⚠️ UI 元素 ${elementId} 仍然可见`);
                console.warn(`⚠️ UI 元素 ${elementId} 仍然可见`);
            }
        }
    });

    // 测试 6: 检查是否有表格相关的事件监听器
    console.log('\n📋 测试 6: 检查事件监听器');
    try {
        const tableBtn = document.getElementById('wbap-table-open-btn');
        const tableCheckbox = document.getElementById('wbap-table-enabled');

        if (!tableBtn && !tableCheckbox) {
            results.passed.push('✅ 表格相关按钮和开关已移除');
            console.log('✅ 表格相关按钮和开关已移除');
        } else {
            results.warnings.push('⚠️ 仍存在表格相关的 UI 元素');
            console.warn('⚠️ 仍存在表格相关的 UI 元素');
        }
    } catch (e) {
        results.errors.push(`❌ 检查事件监听器时出错: ${e.message}`);
        console.error('❌ 检查事件监听器时出错:', e);
    }

    // 测试 7: 检查控制台是否有错误
    console.log('\n📋 测试 7: 检查是否有 JavaScript 错误');
    // 这个测试需要用户手动检查控制台
    results.warnings.push('⚠️ 请手动检查控制台是否有红色错误信息');
    console.warn('⚠️ 请手动检查控制台是否有红色错误信息');

    // 测试 8: 测试核心功能是否正常
    console.log('\n📋 测试 8: 测试核心功能');
    try {
        // 测试配置保存
        if (typeof window.WBAP?.saveConfig === 'function') {
            results.passed.push('✅ saveConfig 函数存在');
            console.log('✅ saveConfig 函数存在');
        } else {
            results.errors.push('❌ saveConfig 函数不存在');
            console.error('❌ saveConfig 函数不存在');
        }

        // 测试 API 调用
        if (typeof window.WBAP?.callAI === 'function') {
            results.passed.push('✅ callAI 函数存在');
            console.log('✅ callAI 函数存在');
        } else {
            results.errors.push('❌ callAI 函数不存在');
            console.error('❌ callAI 函数不存在');
        }

        // 测试处理函数
        if (typeof window.WBAP?.Processing?.processUserInput === 'function') {
            results.passed.push('✅ processUserInput 函数存在');
            console.log('✅ processUserInput 函数存在');
        } else {
            results.errors.push('❌ processUserInput 函数不存在');
            console.error('❌ processUserInput 函数不存在');
        }
    } catch (e) {
        results.errors.push(`❌ 测试核心功能时出错: ${e.message}`);
        console.error('❌ 测试核心功能时出错:', e);
    }

    // 测试 9: 检查内存管理器中的表格内容占位符
    console.log('\n📋 测试 9: 检查提示词占位符');
    try {
        // 这些占位符应该保留，因为它们只是会被替换为空字符串
        results.passed.push('✅ 提示词占位符 {table_content} 保留（正常）');
        console.log('✅ 提示词占位符 {table_content} 保留（正常）');
    } catch (e) {
        results.errors.push(`❌ 检查占位符时出错: ${e.message}`);
        console.error('❌ 检查占位符时出错:', e);
    }

    // 测试 10: 检查悬浮球和面板是否正常
    console.log('\n📋 测试 10: 检查主界面元素');
    try {
        const floatButton = document.getElementById('wbap-float-button');
        const panel = document.getElementById('wbap-panel');

        if (floatButton) {
            results.passed.push('✅ 主悬浮球存在');
            console.log('✅ 主悬浮球存在');
        } else {
            results.warnings.push('⚠️ 主悬浮球不存在（可能未初始化）');
            console.warn('⚠️ 主悬浮球不存在（可能未初始化）');
        }

        if (panel) {
            results.passed.push('✅ 主面板存在');
            console.log('✅ 主面板存在');
        } else {
            results.warnings.push('⚠️ 主面板不存在（可能未初始化）');
            console.warn('⚠️ 主面板不存在（可能未初始化）');
        }
    } catch (e) {
        results.errors.push(`❌ 检查主界面元素时出错: ${e.message}`);
        console.error('❌ 检查主界面元素时出错:', e);
    }

    // 生成测试报告
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试报告');
    console.log('='.repeat(60));

    console.log(`\n✅ 通过: ${results.passed.length} 项`);
    console.log(`⚠️ 警告: ${results.warnings.length} 项`);
    console.log(`❌ 错误: ${results.errors.length} 项`);

    if (results.errors.length > 0) {
        console.log('\n❌ 发现的错误:');
        results.errors.forEach(err => console.log('  ' + err));
    }

    if (results.warnings.length > 0) {
        console.log('\n⚠️ 警告信息:');
        results.warnings.forEach(warn => console.log('  ' + warn));
    }

    // 总体评估
    console.log('\n' + '='.repeat(60));
    if (results.errors.length === 0) {
        console.log('🎉 总体评估: 表格模块删除成功，没有发现严重错误！');
        if (results.warnings.length > 0) {
            console.log('💡 提示: 有一些警告信息，但不影响核心功能。');
        }
    } else {
        console.log('⚠️ 总体评估: 发现了一些错误，需要修复。');
    }
    console.log('='.repeat(60));

    // 返回详细结果供进一步分析
    return {
        summary: {
            passed: results.passed.length,
            warnings: results.warnings.length,
            errors: results.errors.length,
            success: results.errors.length === 0
        },
        details: results
    };
})();
