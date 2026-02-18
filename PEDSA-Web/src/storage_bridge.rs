use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    // 导入 JS 侧的 SQLite 执行函数
    // 假设 JS 会提供一个全局对象或函数 `pedsa_sqlite_exec`
    // 参数: sql (String)
    // 返回: JsValue (JSON Array of Objects or null)
    #[wasm_bindgen(js_name = pedsa_sqlite_exec, catch)]
    pub async fn js_sqlite_exec(sql: &str) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(js_name = pedsa_sqlite_init, catch)]
    pub async fn js_sqlite_init() -> Result<JsValue, JsValue>;
}

/// Rust 侧的 SQLite 接口封装
/// 这个结构体将作为 Rust 逻辑访问数据库的桥梁
#[allow(dead_code)]
pub struct StorageBridge;

impl StorageBridge {
    #[allow(dead_code)]
    pub async fn execute(sql: &str) -> Result<JsValue, String> {
        // 在实际生产代码中，这里应该包含错误处理逻辑
        // 目前我们简单地调用 JS 函数
        match js_sqlite_exec(sql).await {
            Ok(v) => Ok(v),
            Err(e) => Err(format!("SQLite Exec Error: {:?}", e)),
        }
    }

    #[allow(dead_code)]
    pub async fn init() -> Result<JsValue, String> {
        match js_sqlite_init().await {
            Ok(v) => Ok(v),
            Err(e) => Err(format!("SQLite Init Error: {:?}", e)),
        }
    }
}
