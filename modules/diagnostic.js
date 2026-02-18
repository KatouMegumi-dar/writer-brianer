// modules/diagnostic.js
// 诊断工具模块 - 帮助用户快速检查配置问题

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    /**
     * 运行完整的配置诊断
     */
    async function runDiagnostics() {
        console.log('\n========== Writer Brianer 配置诊断 ==========\n');

        const results = {
            passed: [],
            warnings: [],
            errors: [],
            info: []
        };

        // 1. 检查基础配置
        console.log('1. 检查基础配置...');
        if (!WBAP.mainConfig) {
            results.errors.push('❌ 主配置未加载');
            console.error('❌ 主配置未加载');
        } else {
            results.passed.push('✓ 主配置已加载');
            console.log('✓ 主配置已加载');

            const config = WBAP.config || WBAP.mainConfig.characterConfigs?.default;
            if (!config) {
                results.errors.push('❌ 当前角色配置未找到');
                console.error('❌ 当前角色配置未找到');
            } else {
                results.passed.push('✓ 当前角色配置已加载');
                console.log('✓ 当前角色配置已加载');

                // 【独立开关制度】检查各模块启用状态
                const memoryEnabled = config.memoryModule?.enabled === true;
                const tiangangEnabled = config.tiangang?.enabled === true;
                const superMemoryEnabled = config.superMemory?.enabled === true;
                const responseOptimizerEnabled = config.responseOptimizer?.enabled === true;
                
                const enabledModules = [];
                if (memoryEnabled) enabledModules.push('记忆注入');
                if (tiangangEnabled) enabledModules.push('天纲');
                if (superMemoryEnabled) enabledModules.push('超级记忆');
                if (responseOptimizerEnabled) enabledModules.push('正文优化');
                const selectiveModeEnabled = config.selectiveMode?.enabled === true;
                if (selectiveModeEnabled) enabledModules.push('自选模式');
                
                if (enabledModules.length > 0) {
                    results.passed.push(`✓ 已启用模块: ${enabledModules.join(', ')}`);
                    console.log(`✓ 已启用模块: ${enabledModules.join(', ')}`);
                } else {
                    results.warnings.push('⚠ 没有启用任何模块');
                    console.warn('⚠ 没有启用任何模块');
                }
            }
        }

        // 2. 检查API端点
        console.log('\n2. 检查API端点...');
        const endpoints = WBAP.mainConfig?.globalPools?.selectiveMode?.apiEndpoints || [];
        if (endpoints.length === 0) {
            results.errors.push('❌ 没有配置API端点');
            console.error('❌ 没有配置API端点');
            console.error('   请在扩展设置中添加至少一个API端点');
        } else {
            results.passed.push(`✓ 找到 ${endpoints.length} 个API端点`);
            console.log(`✓ 找到 ${endpoints.length} 个API端点`);

            const enabledEndpoints = endpoints.filter(ep => ep.enabled !== false);
            if (enabledEndpoints.length === 0) {
                results.errors.push('❌ 所有API端点都已禁用');
                console.error('❌ 所有API端点都已禁用');
            } else {
                results.passed.push(`✓ ${enabledEndpoints.length} 个端点已启用`);
                console.log(`✓ ${enabledEndpoints.length} 个端点已启用`);

                // 检查每个端点的配置
                enabledEndpoints.forEach((ep, index) => {
                    console.log(`\n   端点 ${index + 1}: ${ep.name || '未命名'}`);
                    results.info.push(`   端点: ${ep.name || '未命名'}`);

                    if (!ep.apiUrl) {
                        results.warnings.push(`   ⚠ 端点 "${ep.name}" 缺少API URL`);
                        console.warn(`   ⚠ 缺少API URL`);
                    } else {
                        console.log(`   ✓ API URL: ${ep.apiUrl}`);
                    }

                    if (!ep.model) {
                        results.warnings.push(`   ⚠ 端点 "${ep.name}" 缺少模型名称`);
                        console.warn(`   ⚠ 缺少模型名称`);
                    } else {
                        console.log(`   ✓ 模型: ${ep.model}`);
                    }

                    // 检查世界书绑定
                    const config = WBAP.config || WBAP.mainConfig.characterConfigs?.default;
                    const binding = config?.selectiveMode?.endpointBindings?.[ep.id];
                    if (!binding || !binding.worldBooks || binding.worldBooks.length === 0) {
                        results.warnings.push(`   ⚠ 端点 "${ep.name}" 未绑定世界书`);
                        console.warn(`   ⚠ 未绑定世界书`);
                    } else {
                        results.passed.push(`   ✓ 端点 "${ep.name}" 绑定了 ${binding.worldBooks.length} 个世界书`);
                        console.log(`   ✓ 绑定了 ${binding.worldBooks.length} 个世界书: ${binding.worldBooks.join(', ')}`);

                        // 检查条目绑定
                        const totalEntries = Object.values(binding.assignedEntriesMap || {})
                            .reduce((sum, entries) => sum + (entries?.length || 0), 0);
                        if (totalEntries === 0) {
                            results.warnings.push(`   ⚠ 端点 "${ep.name}" 未绑定任何条目`);
                            console.warn(`   ⚠ 未绑定任何条目`);
                        } else {
                            results.passed.push(`   ✓ 端点 "${ep.name}" 绑定了 ${totalEntries} 个条目`);
                            console.log(`   ✓ 绑定了 ${totalEntries} 个条目`);
                        }
                    }
                });
            }
        }

        // 3. 检查提示词
        console.log('\n3. 检查提示词...');
        if (!WBAP.PromptManager) {
            results.errors.push('❌ 提示词管理器未加载');
            console.error('❌ 提示词管理器未加载');
        } else {
            const prompts = WBAP.PromptManager.getCombinedPrompts();
            if (!prompts || prompts.length === 0) {
                results.errors.push('❌ 没有可用的提示词');
                console.error('❌ 没有可用的提示词');
                console.error('   请在扩展设置中创建或导入提示词');
            } else {
                results.passed.push(`✓ 找到 ${prompts.length} 个提示词`);
                console.log(`✓ 找到 ${prompts.length} 个提示词`);

                const config = WBAP.config || WBAP.mainConfig.characterConfigs?.default;
                const selectedIndex = config?.selectedPromptIndex || 0;
                const selectedPrompt = prompts[selectedIndex];

                if (selectedPrompt) {
                    results.passed.push(`✓ 当前选择: ${selectedPrompt.name || '未命名'}`);
                    console.log(`✓ 当前选择: ${selectedPrompt.name || '未命名'}`);
                } else {
                    results.warnings.push('⚠ 选择的提示词索引超出范围');
                    console.warn('⚠ 选择的提示词索引超出范围');
                }
            }
        }

        // 4. 检查世界书
        console.log('\n4. 检查世界书...');
        try {
            const worldInfo = SillyTavern.getContext()?.worldInfoData;
            if (!worldInfo) {
                results.warnings.push('⚠ 无法获取世界书信息');
                console.warn('⚠ 无法获取世界书信息');
            } else {
                const selectedBooks = worldInfo.charLore || [];
                if (selectedBooks.length === 0) {
                    results.warnings.push('⚠ 当前角色未选择世界书');
                    console.warn('⚠ 当前角色未选择世界书');
                    console.warn('   请在SillyTavern中为当前角色选择世界书');
                } else {
                    results.passed.push(`✓ 当前角色选择了 ${selectedBooks.length} 个世界书`);
                    console.log(`✓ 当前角色选择了 ${selectedBooks.length} 个世界书`);
                    selectedBooks.forEach(book => {
                        console.log(`   - ${book}`);
                    });
                }
            }
        } catch (e) {
            results.warnings.push('⚠ 检查世界书时出错');
            console.warn('⚠ 检查世界书时出错:', e);
        }

        // 5. 检查拦截器
        console.log('\n5. 检查拦截器...');
        if (!WBAP.Interceptor) {
            results.errors.push('❌ 拦截器未加载');
            console.error('❌ 拦截器未加载');
        } else {
            results.passed.push('✓ 拦截器已加载');
            console.log('✓ 拦截器已加载');
        }

        // 6. 检查处理模块
        console.log('\n6. 检查处理模块...');
        if (!WBAP.runSelectiveModeProcessing) {
            results.errors.push('❌ 处理模块未加载');
            console.error('❌ 处理模块未加载');
        } else {
            results.passed.push('✓ 处理模块已加载');
            console.log('✓ 处理模块已加载');
        }

        // 7. 检查持久化存储
        console.log('\n7. 检查持久化存储...');
        if (!WBAP.PersistentStorage) {
            results.warnings.push('⚠ 持久化存储模块未加载（将使用传统存储）');
            console.warn('⚠ 持久化存储模块未加载（将使用传统存储）');
        } else {
            results.passed.push('✓ 持久化存储模块已加载');
            console.log('✓ 持久化存储模块已加载');

            try {
                const stats = await WBAP.PersistentStorage.getStorageStats();
                console.log('   存储状态:');
                console.log(`   - 文件系统: ${stats.filesystem.available ? '可用' : '不可用'}`);
                console.log(`   - ST配置: ${stats.ST.available ? '可用' : '不可用'}`);
                console.log(`   - localStorage: ${stats.localStorage.available ? '可用' : '不可用'}`);
                console.log(`   - 备份数量: ${stats.backups.count}`);
            } catch (e) {
                console.warn('   无法获取存储状态:', e);
            }
        }

        // 8. 生成诊断报告
        console.log('\n========== 诊断报告 ==========\n');

        console.log(`✓ 通过: ${results.passed.length} 项`);
        console.log(`⚠ 警告: ${results.warnings.length} 项`);
        console.log(`❌ 错误: ${results.errors.length} 项`);

        if (results.errors.length > 0) {
            console.log('\n❌ 发现以下错误（必须修复）:');
            results.errors.forEach(err => console.log(`   ${err}`));
        }

        if (results.warnings.length > 0) {
            console.log('\n⚠ 发现以下警告（建议修复）:');
            results.warnings.forEach(warn => console.log(`   ${warn}`));
        }

        if (results.errors.length === 0 && results.warnings.length === 0) {
            console.log('\n🎉 所有检查都通过了！配置正常。');
        } else if (results.errors.length === 0) {
            console.log('\n✓ 基本配置正常，但有一些警告需要注意。');
        } else {
            console.log('\n❌ 发现配置错误，请修复后再使用。');
        }

        console.log('\n========================================\n');

        // 显示用户友好的提示
        if (window.toastr) {
            if (results.errors.length > 0) {
                toastr.error(`发现 ${results.errors.length} 个配置错误，请查看控制台`, '诊断完成', {
                    timeOut: 5000
                });
            } else if (results.warnings.length > 0) {
                toastr.warning(`发现 ${results.warnings.length} 个警告，请查看控制台`, '诊断完成', {
                    timeOut: 5000
                });
            } else {
                toastr.success('所有检查都通过了！', '诊断完成', {
                    timeOut: 3000
                });
            }
        }

        return results;
    }

    /**
     * 快速检查配置是否可用
     */
    function quickCheck() {
        const issues = [];

        // 检查API端点
        const endpoints = WBAP.mainConfig?.globalPools?.selectiveMode?.apiEndpoints || [];
        const enabledEndpoints = endpoints.filter(ep => ep.enabled !== false);
        if (enabledEndpoints.length === 0) {
            issues.push('没有启用的API端点');
        }

        // 检查提示词
        const prompts = WBAP.PromptManager?.getCombinedPrompts() || [];
        if (prompts.length === 0) {
            issues.push('没有可用的提示词');
        }

        // 检查世界书绑定
        const config = WBAP.config || WBAP.mainConfig?.characterConfigs?.default;
        let hasBinding = false;
        if (config && enabledEndpoints.length > 0) {
            for (const ep of enabledEndpoints) {
                const binding = config.selectiveMode?.endpointBindings?.[ep.id];
                if (binding && binding.worldBooks && binding.worldBooks.length > 0) {
                    hasBinding = true;
                    break;
                }
            }
        }
        if (!hasBinding) {
            issues.push('API端点未绑定世界书');
        }

        return {
            ok: issues.length === 0,
            issues: issues
        };
    }

    /**
     * 显示配置建议
     */
    function showConfigSuggestions() {
        const check = quickCheck();

        if (check.ok) {
            console.log('✓ 配置检查通过');
            return;
        }

        console.log('\n⚠ 配置问题:');
        check.issues.forEach(issue => {
            console.log(`   - ${issue}`);
        });

        console.log('\n💡 建议:');
        if (check.issues.includes('没有启用的API端点')) {
            console.log('   1. 打开扩展设置');
            console.log('   2. 在"自选模式"标签中添加API端点');
            console.log('   3. 配置API URL、密钥和模型');
        }
        if (check.issues.includes('没有可用的提示词')) {
            console.log('   1. 打开扩展设置');
            console.log('   2. 在"提示词管理"标签中创建或导入提示词');
        }
        if (check.issues.includes('API端点未绑定世界书')) {
            console.log('   1. 打开扩展设置');
            console.log('   2. 为每个API端点绑定世界书');
            console.log('   3. 选择要分析的世界书条目');
        }

        console.log('\n运行 WBAP.Diagnostic.run() 查看详细诊断报告\n');
    }

    // 导出API
    window.WBAP.Diagnostic = {
        run: runDiagnostics,
        quickCheck: quickCheck,
        showSuggestions: showConfigSuggestions
    };

    Logger.log('诊断工具模块已加载');

    // 自动运行快速检查（仅在开发模式）
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        setTimeout(() => {
            const check = quickCheck();
            if (!check.ok) {
                console.warn('[Writer Brianer] 发现配置问题，运行 WBAP.Diagnostic.run() 查看详情');
            }
        }, 2000);
    }

})();
