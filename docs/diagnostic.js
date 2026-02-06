// Writer插件改进诊断脚本
// 在浏览器控制台中运行此脚本以诊断问题

(function() {
    console.log('=== Writer插件改进诊断开始 ===\n');

    const results = {
        passed: [],
        failed: [],
        warnings: []
    };

    // 检查1：WBAP对象是否存在
    if (typeof window.WBAP !== 'undefined') {
        results.passed.push('✅ WBAP全局对象存在');
    } else {
        results.failed.push('❌ WBAP全局对象不存在');
        console.log('=== 诊断结束（严重错误）===');
        return;
    }

    // 检查2：主配置是否存在
    if (window.WBAP.mainConfig) {
        results.passed.push('✅ mainConfig存在');
        console.log('配置键:', Object.keys(window.WBAP.mainConfig));
    } else {
        results.failed.push('❌ mainConfig不存在');
    }

    // 检查3：角色配置是否存在
    if (window.WBAP.mainConfig?.characterConfigs) {
        const charKeys = Object.keys(window.WBAP.mainConfig.characterConfigs);
        results.passed.push(`✅ characterConfigs存在，包含${charKeys.length}个角色`);
        console.log('角色配置键:', charKeys);

        // 检查是否有'default'键
        if (charKeys.includes('default')) {
            results.passed.push('✅ 主页配置(default)存在');
        } else {
            results.warnings.push('⚠️ 主页配置(default)不存在（可能尚未创建）');
        }
    } else {
        results.failed.push('❌ characterConfigs不存在');
    }

    // 检查4：localStorage备份
    const backup = localStorage.getItem('worldbook_ai_processor_backup');
    if (backup) {
        try {
            const parsed = JSON.parse(backup);
            results.passed.push('✅ localStorage备份存在');
            console.log('备份版本:', parsed.version);
            console.log('备份时间:', new Date(parsed.timestamp).toLocaleString());

            if (parsed.config?.characterConfigs) {
                const backupKeys = Object.keys(parsed.config.characterConfigs);
                console.log('备份中的角色:', backupKeys);
            }
        } catch (e) {
            results.failed.push('❌ localStorage备份解析失败: ' + e.message);
        }
    } else {
        results.warnings.push('⚠️ localStorage备份不存在（可能是首次运行）');
    }

    // 检查5：CharacterManager
    if (window.WBAP.CharacterManager) {
        results.passed.push('✅ CharacterManager存在');

        const currentId = window.WBAP.CharacterManager.currentCharacterId;
        console.log('当前角色ID:', currentId || 'null (主页)');

        if (typeof window.WBAP.CharacterManager.getCurrentCharacterConfig === 'function') {
            results.passed.push('✅ getCurrentCharacterConfig函数存在');
        } else {
            results.failed.push('❌ getCurrentCharacterConfig函数不存在');
        }

        if (typeof window.WBAP.CharacterManager.switchCharacter === 'function') {
            results.passed.push('✅ switchCharacter函数存在');
        } else {
            results.failed.push('❌ switchCharacter函数不存在');
        }
    } else {
        results.failed.push('❌ CharacterManager不存在');
    }

    // 检查6：UI对象
    if (window.WBAP.UI) {
        results.passed.push('✅ UI对象存在');

        const uiFunctions = [
            'loadSettingsToUI',
            'refreshPromptList',
            'renderApiEndpoints'
        ];

        uiFunctions.forEach(fn => {
            if (typeof window.WBAP.UI[fn] === 'function') {
                results.passed.push(`✅ UI.${fn}函数存在`);
            } else {
                results.failed.push(`❌ UI.${fn}函数不存在`);
            }
        });
    } else {
        results.failed.push('❌ UI对象不存在');
    }

    // 检查7：配置同步
    const currentConfig = window.WBAP.config;
    if (currentConfig) {
        results.passed.push('✅ 当前配置(WBAP.config)存在');

        const currentKey = window.WBAP.CharacterManager?.currentCharacterId || 'default';
        const expectedConfig = window.WBAP.mainConfig?.characterConfigs?.[currentKey];

        if (currentConfig === expectedConfig) {
            results.passed.push('✅ 配置同步正常');
        } else {
            results.warnings.push('⚠️ 配置可能不同步（将在5秒内自动修复）');
        }
    } else {
        results.failed.push('❌ 当前配置(WBAP.config)不存在');
    }

    // 检查8：全局池
    if (window.WBAP.mainConfig?.globalPools) {
        results.passed.push('✅ globalPools存在');

        const pools = window.WBAP.mainConfig.globalPools;

        if (pools.selectiveMode?.apiEndpoints) {
            const epCount = pools.selectiveMode.apiEndpoints.length;
            results.passed.push(`✅ API端点池存在，包含${epCount}个端点`);
        } else {
            results.warnings.push('⚠️ API端点池为空');
        }

        if (pools.prompts?.main) {
            const promptCount = pools.prompts.main.length;
            results.passed.push(`✅ 主提示词池存在，包含${promptCount}个提示词`);
        } else {
            results.warnings.push('⚠️ 主提示词池为空');
        }
    } else {
        results.failed.push('❌ globalPools不存在');
    }

    // 检查9：核心函数
    const coreFunctions = [
        'loadConfig',
        'saveConfig',
        'callAI',
        'runSelectiveModeProcessing'
    ];

    coreFunctions.forEach(fn => {
        if (typeof window.WBAP[fn] === 'function') {
            results.passed.push(`✅ ${fn}函数存在`);
        } else {
            results.failed.push(`❌ ${fn}函数不存在`);
        }
    });

    // 输出结果
    console.log('\n=== 诊断结果 ===\n');

    if (results.passed.length > 0) {
        console.log('%c通过的检查:', 'color: green; font-weight: bold');
        results.passed.forEach(msg => console.log(msg));
    }

    if (results.warnings.length > 0) {
        console.log('\n%c警告:', 'color: orange; font-weight: bold');
        results.warnings.forEach(msg => console.log(msg));
    }

    if (results.failed.length > 0) {
        console.log('\n%c失败的检查:', 'color: red; font-weight: bold');
        results.failed.forEach(msg => console.log(msg));
    }

    // 总结
    console.log('\n=== 总结 ===');
    console.log(`通过: ${results.passed.length}`);
    console.log(`警告: ${results.warnings.length}`);
    console.log(`失败: ${results.failed.length}`);

    if (results.failed.length === 0) {
        console.log('\n%c✅ 所有关键检查通过！插件改进正常工作。', 'color: green; font-weight: bold; font-size: 14px');
    } else {
        console.log('\n%c❌ 发现问题，请查看上方失败的检查项。', 'color: red; font-weight: bold; font-size: 14px');
        console.log('建议：检查浏览器控制台是否有JavaScript错误');
    }

    console.log('\n=== 诊断结束 ===');

    // 返回结果供进一步分析
    return {
        passed: results.passed.length,
        warnings: results.warnings.length,
        failed: results.failed.length,
        details: results
    };
})();
