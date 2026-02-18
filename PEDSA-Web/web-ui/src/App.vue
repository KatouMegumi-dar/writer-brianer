<script setup lang="ts">
import { ref, onMounted, nextTick, watch, reactive } from 'vue'
import init, { PedsaEngine } from './wasm/pedsa_wasm_v3.js'
import { initSQLite, getConversations, createConversation, deleteConversation, getMessages, addMessage, deleteMessageTransaction, type Conversation, type Message, getPersonas, updateConversationTitle,
  updateMessageSourceNodes,
  updateMessageExtractionRaw,
  saveGraphNode, saveGraphEdge
} from './services/sqlite.js'
import { llmService, type ChatMessage, fetchOpenAIModels, type LLMConfig } from './services/llm.js'
import GraphView from './components/GraphView.vue'
import PersonaManager from './components/PersonaManager.vue'

// --- State ---
// Global Confirm Modal State
const confirmModal = reactive({
  show: false,
  title: '',
  message: '',
  onConfirm: () => {},
  onCancel: () => { confirmModal.show = false }
})

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  confirmModal.title = title
  confirmModal.message = message
  confirmModal.onConfirm = () => {
    onConfirm()
    confirmModal.show = false
  }
  confirmModal.show = true
}

// Global provide for child components if needed
import { provide } from 'vue'
provide('confirm', showConfirm)

const currentView = ref<'chat' | 'graph' | 'personas'>('chat')
// const messages = ref<ChatMessage[]>([]) // Replaced by loaded messages

// Conversation State
const conversations = ref<Conversation[]>([])
const currentConversationId = ref<string | null>(null)
const currentMessages = ref<Message[]>([]) // Local display state
const isSidebarOpen = ref(true)

// Rename State
const editingConversationId = ref<string | null>(null)
const editingTitle = ref('')
const renameInput = ref<HTMLInputElement | HTMLInputElement[] | null>(null)

const startRename = (conv: Conversation, e: Event) => {
   e.stopPropagation()
   editingConversationId.value = conv.id
   editingTitle.value = conv.title || ''
   nextTick(() => {
     if (Array.isArray(renameInput.value)) {
       renameInput.value[0]?.focus()
     } else {
       renameInput.value?.focus()
     }
   })
 }

const handleRename = async () => {
  if (!editingConversationId.value) return
  const newTitle = editingTitle.value.trim()
  if (newTitle) {
    await updateConversationTitle(editingConversationId.value, newTitle)
    const conv = conversations.value.find(c => c.id === editingConversationId.value)
    if (conv) conv.title = newTitle
  }
  editingConversationId.value = null
}

const cancelRename = () => {
  editingConversationId.value = null
}

const input = ref('')
const isLoading = ref(false)
const sqliteStatus = ref<'pending' | 'ready' | 'error'>('pending')
const wasmStatus = ref<'pending' | 'ready' | 'error'>('pending')
const engine = ref<PedsaEngine | null>(null)
const chatContainer = ref<HTMLElement | null>(null)

// Config State
const showConfigModal = ref(false)
const config = reactive<LLMConfig>({
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-3.5-turbo',
  extractorBaseUrl: '',
  extractorApiKey: '',
  extractorModel: '',
  useSeparateExtractor: false,
  contextWindow: 5,
  stream: false
})
const modelList = ref<string[]>([])
const isFetchingModels = ref(false)

// Debug Modal State
const debugModal = reactive({
  show: false,
  content: '',
  fullPrompt: ''
})

const showDebugInfo = (msg: Message) => {
  debugModal.content = msg.extraction_raw || '无图谱提取数据'
  debugModal.fullPrompt = msg.full_prompt || '无提示词数据'
  debugModal.show = true
}

// --- Initialization ---
onMounted(async () => {
  // Load Config
  const storedConfig = localStorage.getItem('pedsa_llm_config')
  if (storedConfig) {
    try {
      const parsed = JSON.parse(storedConfig)
      config.baseUrl = parsed.baseUrl || config.baseUrl
      config.apiKey = parsed.apiKey || ''
      config.model = parsed.model || config.model
      config.extractorBaseUrl = parsed.extractorBaseUrl || ''
      config.extractorApiKey = parsed.extractorApiKey || ''
      config.extractorModel = parsed.extractorModel || ''
      config.useSeparateExtractor = parsed.useSeparateExtractor || false
      config.contextWindow = parsed.contextWindow !== undefined ? parsed.contextWindow : 5
      config.stream = parsed.stream !== undefined ? parsed.stream : false
      
      // Update LLM service with loaded config
      if (llmService.updateConfig) {
        llmService.updateConfig({ ...config })
      }
    } catch (e) { console.error('Failed to load config', e) }
  }

  // 1. Initialize SQLite (Storage Layer)
  try {
    await initSQLite()
    sqliteStatus.value = 'ready'
    console.log('[App] SQLite initialized')
    
    // Load conversations
    await loadConversations()
  } catch (e) {
    console.error('[App] SQLite failed', e)
    sqliteStatus.value = 'error'
  }

  // 2. Initialize WASM (Compute Layer)
  try {
    await init()
    wasmStatus.value = 'ready'
    engine.value = new PedsaEngine()
    console.log('[App] WASM initialized')
  } catch (e) {
    console.error('[App] WASM failed', e)
    wasmStatus.value = 'error'
  }
})

// --- Config Logic ---
const handleFetchModels = async () => {
  if (!config.baseUrl) return
  isFetchingModels.value = true
  modelList.value = []
  try {
    const models = await fetchOpenAIModels({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: '' // Not used for fetching models
    })
    modelList.value = models
    // Optional: Auto-select first model if current model is empty
    const firstModel = models[0]
    if (!config.model && firstModel) {
      config.model = firstModel
    }
  } catch (e) {
    alert(`获取模型列表失败: ${e}`)
  } finally {
    isFetchingModels.value = false
  }
}

const saveConfig = () => {
  if (llmService.updateConfig) {
    llmService.updateConfig({ ...config })
  }
  // Persist to localStorage
  localStorage.setItem('pedsa_llm_config', JSON.stringify({ ...config }))
  showConfigModal.value = false
}

// --- Conversation Logic ---

const loadConversations = async () => {
  conversations.value = await getConversations()
  if (conversations.value.length === 0) {
    // Create default conversation if none exist
    await handleNewChat()
  } else if (!currentConversationId.value && conversations.value[0]) {
    // Select first conversation
    await selectConversation(conversations.value[0].id)
  }
}

const handleNewChat = async () => {
  const id = await createConversation('新对话')
  await loadConversations()
  await selectConversation(id)
}

const selectConversation = async (id: string) => {
  currentConversationId.value = id
  currentMessages.value = await getMessages(id)
  scrollToBottom()
}

const handleDeleteConversation = async (id: string, e: Event) => {
  e.stopPropagation() // Prevent click selection
  showConfirm('删除对话', '确定要删除该对话吗？', async () => {
      await deleteConversation(id)
      if (currentConversationId.value === id) {
          currentConversationId.value = null
      }
      await loadConversations()
  })
}

const handleDeleteMessage = async (msgId: number | undefined) => {
    if (!msgId) return;
    showConfirm('删除消息', '确定要删除这条消息吗？关联的图谱数据也将一并删除 (Atomic Delete)。', async () => {
        try {
            await deleteMessageTransaction(msgId);
            // Refresh local state
            if (currentConversationId.value) {
                currentMessages.value = await getMessages(currentConversationId.value);
            }
        } catch (e) {
            alert(`删除失败: ${e}`);
        }
    });
}

// --- Logic ---
const sendMessage = async () => {
  if (!input.value.trim() || isLoading.value || !currentConversationId.value) return
  
  const userContent = input.value.trim()
  input.value = ''
  
  // Optimistic update
  const userMsg: Message = {
      conversation_id: currentConversationId.value,
      role: 'user',
      content: userContent,
      created_at: Date.now() / 1000
  }
  currentMessages.value.push(userMsg)
  isLoading.value = true
  scrollToBottom()
  


  try {
    // Step 1: Context Retrieval (PEDSA)
    let contextInfo = ""
    
    if (engine.value && wasmStatus.value === 'ready') {
      try {
        const timestamp = BigInt(Math.floor(Date.now() / 1000))
        // Use retrieve to get relevant context for the prompt
        const jsonResult = engine.value.retrieve(userContent, timestamp, 0.5)
        const results = JSON.parse(jsonResult)
        
        if (results && results.length > 0) {
            // Filter and format top results as context
            const topResults = results.filter((r: any) => r.score > 0.3).slice(0, 10)
            if (topResults.length > 0) {
                contextInfo = "\n\n### 检索到的相关长记忆:\n" + 
                    topResults.map((r: any) => {
                        let timeStr = "未知时间";
                        if (r.timestamp && r.timestamp > 0) {
                             const ts = Number(r.timestamp);
                             // 判断是毫秒还是秒 (简单的启发式: > 30000000000 是毫秒)
                             const date = new Date(ts > 30000000000 ? ts : ts * 1000);
                             timeStr = date.toLocaleString('zh-CN', { hour12: false });
                        }
                        return `- [${timeStr}] ${r.content}`;
                    }).join('\n')
                console.log('[PEDSA] Context retrieved:', topResults.length, 'nodes')
            } else {
                contextInfo = "\n\n(未检索到高相关性的长记忆)"
            }
        }
      } catch (err) {
        console.warn("[PEDSA] Retrieval error:", err)
      }
    }

    // Step 2: LLM Generation
    // Fetch Personas to find active system prompt
    const allPersonas = await getPersonas()
    const activePersona = allPersonas.find(p => p.is_default) || allPersonas[0]
    let systemPrompt = activePersona ? activePersona.prompt : '你是一个知识图谱助手，能够从对话中提取实体和关系。'
    
    // Inject context into system prompt if available
    if (contextInfo) {
        systemPrompt += contextInfo
    }

    // Prepare conversation history with context window
    const history = currentMessages.value.map(m => ({
        role: m.role as 'user'|'assistant'|'system',
        content: m.content
    }))

    // Truncate history based on context window (rounds)
    // One round = 2 messages (user + assistant)
    const windowSize = (config.contextWindow || 5) * 2
    const truncatedHistory = history.slice(-windowSize)

    const conversation: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...truncatedHistory
    ]
    
    // 3. Extract and Persist (Atomic - Part 1: User Message)
    let sourceNodes: string[] = []
    if (engine.value && wasmStatus.value === 'ready') {
      try {
        const timestamp = BigInt(Math.floor(Date.now() / 1000))
        const jsonResult = engine.value.retrieve(userContent, timestamp, 0.5)
        const results = JSON.parse(jsonResult)
        // Use content as "source nodes" for persistence linkage
        if (results && results.length > 0) {
          sourceNodes = results.filter((r: any) => r.score > 0.5).map((r: any) => r.content)
        }
      } catch (err) {
        console.warn("[PEDSA] Extraction error during persistence:", err)
      }
    }

    // Persist User Message immediately
    userMsg.id = await addMessage(currentConversationId.value, 'user', userContent, sourceNodes)

    // Step 2: LLM Generation
    let finalResponse = ""
    const assistantMsg: Message = {
        conversation_id: currentConversationId.value,
        role: 'assistant',
        content: "",
        created_at: Date.now() / 1000
    }
    currentMessages.value.push(assistantMsg)

    try {
        if (config.stream) {
            await llmService.chatStream(conversation, (chunk) => {
                assistantMsg.content += chunk
                finalResponse = assistantMsg.content
                scrollToBottom()
            })
        } else {
            finalResponse = await llmService.chat(conversation)
            assistantMsg.content = finalResponse
            scrollToBottom()
        }
    } catch (err: any) {
        console.error("LLM Error:", err)
        finalResponse = `抱歉，发生了错误: ${err.message || err}`
        assistantMsg.content = finalResponse
    }

    // Persist Assistant Message
    const fullPromptStr = JSON.stringify(conversation, null, 2);
    assistantMsg.id = await addMessage(currentConversationId.value, 'assistant', finalResponse, [], userMsg.id, fullPromptStr)
    assistantMsg.full_prompt = fullPromptStr;
    
    // Auto-update Title if it's the first exchange (simple heuristic)
    const currentConv = conversations.value.find(c => c.id === currentConversationId.value)
    if (currentConv && currentConv.title === '新对话') {
        const newTitle = userContent.slice(0, 15)
        await updateConversationTitle(currentConversationId.value, newTitle)
        // Refresh list title locally
        currentConv.title = newTitle
    }

    // Stream 2: Background Knowledge Extraction (Silent)
    // We launch this asynchronously and don't block the UI
    (async () => {
      if (!engine.value) return;

      try {
        // Load maintenance prompt
        const now = new Date();
        const timeString = now.toLocaleString();
        
        const maintenancePrompt = `
# 图谱构建提示词

你是一个专业的知识图谱架构师。你的任务是在每次对话结束后，分析用户对 Pero 的发言，并输出增量的图谱维护指令。

**当前系统时间 (Reference Time)**: \`${timeString}\` (例如: 2026-05-20 14:30:00)
**对话上下文**:
- **用户**: "${userContent}"
- **AI**: "${finalResponse}"

## 1. 核心任务

请从最近的对话中提取并生成以下两部分内容：

### A. 事件节点 (Event Node)
将本次对话的核心内容总结为一个独立的事件：
- **Summary**: 简洁的总结，字数控制在 **50个字左右**。
    - **必须以日期开头**：格式为“YYYY年MM月DD日”。**注意：必须根据 Reference Time 所处的历法系统，将对话中的相对时间（如“昨天”、“上周五”）转换为该历法下的绝对日期。**
    - **内容要素**：包含时间、地点、涉及的人物/事物、起因、结果。
- **Features**: 提取代表本次对话中所涉及事物的“词语”。**注意：这些词语必须与下文中 Ontology 维护的词语保持一致。**
- **Type**: 必须从以下 6 种实体类型中选择 **最匹配的一个**：
    - \`PERSON\` (人物/身份 - 如 Pero, 用户)
    - \`TECH\` (技术/概念 - 如 Rust, PyO3)
    - \`EVENT\` (事件/动作 - 如 跑步, 吃饭)
    - \`LOCATION\` (地点 - 如 上海, 张江)
    - \`OBJECT\` (物件 - 如 蝴蝶结, 键盘)
    - \`VALUES\` (价值观 - 如 伦理, 精神)
- **Emotion**: 必须从以下 8 种情感中选择 **最主导的一个**，禁止输出列表以外的词汇（对应 Plutchik 情感轮）：
    - \`JOY\` (喜悦/快乐)
    - \`SHY\` (害羞/不好意思)
    - \`FEAR\` (恐惧/害怕)
    - \`SURPRISE\` (惊讶/意外)
    - \`SADNESS\` (悲伤/难过)
    - \`DISGUST\` (厌恶/反感)
    - \`ANGER\` (生气/愤怒)
    - \`ANTICIPATION\` (期待/愿景)
- **Time**: 使用带日期的 24 小时制格式，例如：\`2026-02-02 14:30:00\`。**注意：必须是遵循 Reference Time 历法的绝对时间。**

### B. Ontology 节点 (Ontology Node)
这是系统的“定义库”，仅用于描述词语的性质和身份。请遵循下述 **“提取原则”**：
- **拆解粒度**: 不要生成冗长的描述性短语，将其拆解为最小意义单元。**但注意：具有整体意义的专有名词（如：品牌、作品名、特定项目、专有术语）严禁原子化拆解**。
    - *正确示例*: “RUST语言” -> “RUST” + “语言” (拆除描述性后缀)；“高性能计算” -> “高性能” + “计算”。
    - *禁止拆解示例*: “东方Project”、“DeepSeek”、“GitHub” 等整体名词必须保持完整，不可拆解。
- **仅限实词**: 严禁提取“的”、“是”、“了”、“在”、“我”、“你”等虚词、代词或无实际语义的助词。
- **语义聚焦**: 仅提取对理解事件、技术、情感或人物关系有实质贡献的关键词。

连接类型与属性说明：

1.  **relation_type** (核心三种边):
    - \`representation\` (默认): **表征**。逻辑含义：
      - “看到 Source 可能会联想到 Target”。这是一种**单向**的、概率性的路径，不代表等价。
      - 严禁将临时状态定义为表征，如：“Pero 现在很高兴”**严禁**被拆解为“Pero -> 高兴”。
    - \`equality\`: **等价**。逻辑含义：“Source 就是 Target”。这是**双向**的强连接。通常用于同义词、缩写、别名。权重必定为1.0。
    - \`inhibition\`: **抑制**。逻辑含义：“Source 与 Target 互斥”。这是**双向**的负反馈连接，用于防止错误的联想扩散。

2.  **关键属性**:
    - \`strength\` (0.0 - 1.0): 联想强度。1.0 表示看到 A 几乎必定想到 B；0.1 表示只有微弱的可能性。

**禁止项：** 不要将动作或逻辑关联作为表征。例如，“Pero在吃饭”是事件行为，不应建立 \`Pero -> 吃饭\` 的表征。

## 2. 输出格式 (JSON Only)

请**只输出**有效的 JSON 字符串：

{
  "new_event": {
    "summary": "YYYY年MM月DD日，...",
    "features": ["词语1", "词语2", "..."],
    "type": "PERSON | TECH | EVENT | LOCATION | OBJECT | VALUES",
    "emotion": "JOY | SHY | FEAR | SURPRISE | SADNESS | DISGUST | ANGER | ANTICIPATION",
    "time": "YYYY-MM-DD HH:mm:ss"
  },
  "ontology_updates": [
    {
      "source": "词语1",
      "target": "词语2",
      "relation_type": "representation | equality | inhibition",
      "strength": number,
      "action": "upsert | replace", 
      "reason": "仅当 action 为 replace 时填写，说明逻辑冲突的原因"
    }
  ]
}

## 3. 字段说明 (Advanced)
- **action**:
    - \`upsert\` (默认): 常规更新。如果边存在则增强权重，不存在则创建。
    - \`replace\`: **逻辑覆盖**。当且仅当新信息与旧知识发生**根本性冲突**（如：发色改变、居住地迁移、关系破裂）时使用。这会触发系统的仲裁机制，检查并清理旧的冲突边。
- **reason**: 简要描述为何触发 replace（例如：“Pero 染发了，不再是蓝发”）。

## 4. 示例

**对话上下文**:
- **用户**: "佩罗，你这个贪吃的小女孩，刚才是不是又偷吃桌上的草莓了？那是给客人准备的呀，真是个调皮的小家伙。"
- **AI (Pero)**: "呜...我只是看它们红红的很漂亮，没忍住嘛。下次不会啦，别生气好不好？"

**输出**:
{
  "new_event": {
    "summary": "2026年2月2日，用户发现 Pero 偷吃了桌上的草莓并进行责备，Pero 撒娇承认了错误并承诺不再犯。",
    "features": ["Pero", "草莓", "女孩", "调皮", "撒娇"],
    "type": "EVENT",
    "emotion": "JOY",
    "time": "2026-02-02 15:45:00"
  },
  "ontology_updates": [
    { "source": "Pero", "target": "佩罗", "relation_type": "equality", "strength": 1.0, "action": "upsert" },
    { "source": "Pero", "target": "女孩", "relation_type": "representation", "strength": 1.0, "action": "upsert" },
    { "source": "Pero", "target": "调皮", "relation_type": "representation", "strength": 0.7, "action": "upsert" },
    { "source": "草莓", "target": "水果", "relation_type": "representation", "strength": 1.0, "action": "upsert" }
  ]
}

**示例 2 (逻辑冲突与覆盖)**:

**对话上下文**:
- **用户**: "佩罗，你的蓝头发太显眼了，我们要去参加晚宴，我帮你染成低调一点的红棕色吧。"
- **AI (Pero)**: "诶？红棕色吗...虽然有点舍不得原来的颜色，但如果是为了晚宴的话，我也想试试看新造型呢！"

**输出**:
{
  "new_event": {
    "summary": "2026年2月2日，用户提议为 Pero 染发以参加晚宴，Pero 同意将蓝发染成红棕色。",
    "features": ["Pero", "染发", "红棕色", "晚宴"],
    "type": "EVENT",
    "emotion": "ANTICIPATION",
    "time": "2026-02-02 18:00:00"
  },
  "ontology_updates": [
    { 
      "source": "Pero", 
      "target": "红棕色", 
      "relation_type": "representation", 
      "strength": 1.0, 
      "action": "replace", 
      "reason": "Pero 的发色从蓝色变更为红棕色，旧的发色属性已失效" 
    },
    {
      "source": "红棕色",
      "target": "蓝色",
      "relation_type": "inhibition",
      "strength": 0.9,
      "action": "upsert",
      "reason": "当前语境下，新发色与旧发色互斥"
    }
  ]
}

`;

        const extractionResponse = await llmService.extract([
           { role: 'user', content: maintenancePrompt } 
        ]);

        // Save Raw Extraction Response for Debugging
        if (assistantMsg.id) {
          await updateMessageExtractionRaw(assistantMsg.id, extractionResponse);
          // Update in-memory message to reflect change immediately in UI (Debug Button)
          assistantMsg.extraction_raw = extractionResponse;
        }

        // Parse JSON
        let jsonStr = extractionResponse.trim();
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        try {
           const data = JSON.parse(jsonStr);
           
           // 1. Add Event
           if (data.new_event) {
               const evt = data.new_event;
               const evtId = BigInt(Date.now()); 
               engine.value.add_event(evtId, evt.summary);
               
               // Persist Event Node (Type 1: Instance)
               await saveGraphNode(evtId.toString(), 1, 1.0, evt.summary);
               
               if (Array.isArray(evt.features)) {
                   let featIdx = 0;
                   for (const feature of evt.features) {
                       engine.value.add_feature(evtId, feature);
                       
                       // Persist Feature Node & Edge
                       // Generate a pseudo-unique hash for the feature node
                       const featHash = `feat_${evtId}_${featIdx++}`;
                       await saveGraphNode(featHash, 1, 0.8, feature);
                       await saveGraphEdge(evtId.toString(), featHash, 1.0, 1);
                   }
               }
           }

           // 2. Maintain Ontology
           if (Array.isArray(data.ontology_updates)) {
               for (const update of data.ontology_updates) {
                   engine.value.maintain_ontology(
                       update.source,
                       update.target,
                       update.relation_type || 'representation',
                       update.strength || 1.0
                   );
                   
                   // Persist Ontology Nodes (Type 0) & Edge
                   await saveGraphNode(update.source, 0, 1.0, update.source);
                   await saveGraphNode(update.target, 0, 1.0, update.target);
                   
                   // Determine edge type for SQL storage
                   let edgeType = 0; // Representation
                   if (update.relation_type === 'equality' || update.relation_type === 'equal') edgeType = 1;
                   if (update.relation_type === 'inhibition' || update.relation_type === 'conflict') edgeType = 255;
                   
                   await saveGraphEdge(update.source, update.target, update.strength || 1.0, edgeType);

                   // For bidirectional types (Equality, Inhibition), save the reverse edge too
                   if (edgeType === 1 || edgeType === 255) {
                        await saveGraphEdge(update.target, update.source, update.strength || 1.0, edgeType);
                   }
               }
           }

           // 3. Compile Graph
           engine.value.compile();

           // 4. Update Database linkage
            if (data.new_event && data.new_event.features) {
                await updateMessageSourceNodes(assistantMsg.id!, data.new_event.features);
                console.log('Features extracted:', data.new_event.features);
            }
           
           console.log("Graph extracted and injected successfully", data);

        } catch (e) {
            console.error("Failed to parse extraction JSON", e, jsonStr);
        }

      } catch (e) {
        console.error("Extraction stream failed", e);
      }
    })();

  } catch (e) {
    currentMessages.value.push({ 
        conversation_id: currentConversationId.value,
        role: 'assistant', 
        content: `错误: ${e}` 
    })
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

const scrollToBottom = () => {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

// Auto-scroll on new messages
watch(currentMessages.value, () => {
  scrollToBottom()
})
</script>

<template>
  <div class="flex flex-row h-screen bg-base-200 font-sans text-base-content overflow-hidden">
    
    <!-- Sidebar -->
    <div 
        class="bg-base-300 flex-none flex flex-col transition-all duration-300 ease-in-out border-r border-base-100 shadow-xl z-20"
        :class="isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full overflow-hidden opacity-0 sm:opacity-100 sm:w-0'"
    >
      <div class="p-4 border-b border-base-100 flex items-center justify-between">
         <h1 class="font-bold text-lg text-primary truncate">PEDSA 记忆引擎</h1>
         <button class="btn btn-ghost btn-xs btn-circle" @click="handleNewChat" title="新对话">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
         </button>
      </div>

      <div class="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          <div 
            v-for="conv in conversations" 
            :key="conv.id"
            class="group flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-base-100 transition-colors text-sm relative"
            :class="currentConversationId === conv.id ? 'bg-base-100 font-medium text-primary' : 'text-base-content/70'"
            @click="selectConversation(conv.id)"
          >
             <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 flex-none opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
             </svg>

             <!-- Title / Rename Input -->
             <div class="flex-1 truncate">
               <input 
                 v-if="editingConversationId === conv.id"
                 ref="renameInput"
                 v-model="editingTitle"
                 class="input input-xs input-bordered w-full h-6 focus:outline-none"
                 @blur="handleRename"
                 @keyup.enter="handleRename"
                 @keyup.esc="cancelRename"
                 @click.stop
               />
               <span v-else class="truncate block">{{ conv.title || '无标题对话' }}</span>
             </div>

             <!-- Actions -->
             <div class="flex-none flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
               <button 
                  v-if="editingConversationId !== conv.id"
                  class="btn btn-ghost btn-xs btn-square hover:text-primary"
                  @click="startRename(conv, $event)"
                  title="重命名"
               >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
               </button>
               <button 
                  class="btn btn-ghost btn-xs btn-square hover:text-error"
                  @click="handleDeleteConversation(conv.id, $event)"
                  title="删除"
               >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
               </button>
             </div>
          </div>
      </div>
      
      <!-- Bottom Menu -->
      <div class="p-2 border-t border-base-100">
         <button class="btn btn-ghost btn-sm w-full justify-start gap-2 text-base-content/70" @click="currentView = 'personas'">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            人设管理
         </button>
         <button class="btn btn-ghost btn-sm w-full justify-start gap-2 text-base-content/70" @click="showConfigModal = true">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            设置
         </button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col h-full min-w-0 relative">
      
      <!-- Navbar / Header -->
      <div class="navbar bg-base-100 shadow-md z-10 px-4 flex-none">
        <div class="flex-none">
          <button class="btn btn-square btn-ghost" @click="isSidebarOpen = !isSidebarOpen">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-5 h-5 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
        </div>
        <div class="flex-1">
          <div class="flex flex-col ml-2">
            <a class="btn btn-ghost text-xl normal-case gap-2 px-0 hover:bg-transparent">
              <span class="text-primary font-bold hidden sm:inline">PEDSA 记忆引擎</span>
              <span class="text-xs font-normal opacity-70">{{ currentView === 'chat' ? '对话' : (currentView === 'graph' ? '知识图谱' : '人设管理') }}</span>
            </a>
          </div>
        </div>
        <div class="flex-none gap-3">
           <!-- View Switcher -->
           <div class="join hidden sm:flex">
             <button 
               class="btn btn-sm join-item" 
               :class="currentView === 'chat' ? 'btn-active btn-primary' : ''"
               @click="currentView = 'chat'">
               对话
             </button>
             <button 
               class="btn btn-sm join-item" 
               :class="currentView === 'graph' ? 'btn-active btn-primary' : ''"
               @click="currentView = 'graph'">
               图谱
             </button>
             <!-- Removed Persona Button as per user request -->
           </div>
   
           <!-- Status Indicators -->
           <div class="flex flex-col items-end text-xs gap-1 sm:flex-row sm:gap-2 sm:items-center">
             <div class="badge gap-1" :class="sqliteStatus === 'ready' ? 'badge-success badge-outline' : 'badge-error badge-outline'">
               <div class="w-2 h-2 rounded-full" :class="sqliteStatus === 'ready' ? 'bg-success' : 'bg-error'"></div>
               <span class="hidden sm:inline">SQLite</span>
             </div>
             <div class="badge gap-1" :class="wasmStatus === 'ready' ? 'badge-success badge-outline' : 'badge-error badge-outline'">
                <div class="w-2 h-2 rounded-full" :class="wasmStatus === 'ready' ? 'bg-success' : 'bg-error'"></div>
                <span class="hidden sm:inline">WASM</span>
             </div>
           </div>
        </div>
      </div>
  
      <!-- Content Area -->
      <div class="flex-1 overflow-hidden relative flex flex-col">
        <!-- Chat View Wrapper -->
        <div v-show="currentView === 'chat'" class="flex flex-col flex-1 overflow-hidden min-h-0 w-full h-full">
          <!-- Main Chat Area -->
          <div class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scroll-smooth" ref="chatContainer">
            <div v-if="currentMessages.length === 0" class="h-full flex flex-col items-center justify-center opacity-50">
              <p>暂无消息</p>
            </div>
            
            <div v-for="(msg, idx) in currentMessages" :key="idx" class="chat group relative" :class="msg.role === 'user' ? 'chat-end' : 'chat-start'">
              <div class="chat-header opacity-50 text-xs mb-1">
                {{ msg.role === 'user' ? '你' : 'PEDSA' }}
              </div>
              <div class="chat-bubble shadow-sm relative pr-10 min-h-[2.5rem] flex items-center" 
                   :class="msg.role === 'user' ? 'chat-bubble-primary text-primary-content' : 'chat-bubble-base-100 bg-base-100 text-base-content border border-base-300'">
                <div class="whitespace-pre-wrap">{{ msg.content }}</div>
                
                <!-- Hover Actions -->
                <div v-if="msg.id" class="absolute -top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                  <!-- Debug Button (only for assistant) -->
                  <button 
                    v-if="msg.role === 'assistant'"
                    class="btn btn-xs btn-circle btn-ghost bg-base-100 shadow-sm border border-base-300 text-info hover:text-info-content hover:bg-info"
                    @click.stop="showDebugInfo(msg)"
                    title="查看提取调试信息"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </button>
                  
                  <!-- Delete Button -->
                  <button 
                    class="btn btn-xs btn-circle btn-ghost bg-base-100 shadow-sm border border-base-300 text-error hover:text-error-content hover:bg-error"
                    @click.stop="handleDeleteMessage(msg.id)"
                    title="删除消息及关联图谱"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
  
            <!-- Loading Indicator -->
            <div v-if="isLoading" class="chat chat-start">
               <div class="chat-header opacity-50 text-xs mb-1">PEDSA</div>
               <div class="chat-bubble chat-bubble-base-100 bg-base-100 border border-base-300 flex items-center gap-2">
                 <span class="loading loading-dots loading-sm"></span>
                 <span class="text-sm opacity-70">思考中...</span>
               </div>
            </div>
          </div>
  
          <!-- Input Area -->
          <div class="p-4 bg-base-100 border-t border-base-300 flex-none">
            <div class="max-w-4xl mx-auto w-full">
              <div class="join w-full shadow-sm">
                <input 
                  v-model="input" 
                  @keyup.enter="sendMessage"
                  type="text" 
                  class="input input-bordered join-item w-full focus:outline-none focus:border-primary" 
                  placeholder="在此输入消息..." 
                  :disabled="isLoading"
                  autofocus
                />
                <button 
                  class="btn btn-primary join-item px-6" 
                  @click="sendMessage" 
                  :disabled="isLoading || !input.trim()"
                >
                  发送
                </button>
              </div>
              <div class="text-center mt-2">
                 <span class="text-xs text-base-content/30">PEDSA V3 混合检索增强系统</span>
              </div>
            </div>
          </div>
        </div>
   
        <GraphView v-if="currentView === 'graph'" class="flex-1 overflow-hidden h-full w-full" />
        <PersonaManager v-if="currentView === 'personas'" class="flex-1 overflow-hidden h-full w-full" />
      </div>
    </div>

    <!-- Confirm Modal -->
    <dialog class="modal" :class="{ 'modal-open': confirmModal.show }">
      <div class="modal-box border border-base-300 shadow-xl">
        <h3 class="font-bold text-lg flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {{ confirmModal.title }}
        </h3>
        <p class="py-4">{{ confirmModal.message }}</p>
        <div class="modal-action">
          <button class="btn btn-ghost" @click="confirmModal.onCancel">取消</button>
          <button class="btn btn-warning" @click="confirmModal.onConfirm">确定</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button @click="confirmModal.onCancel">close</button>
      </form>
    </dialog>

    <!-- Debug Modal -->
    <dialog class="modal" :class="{ 'modal-open': debugModal.show }">
      <div class="modal-box max-w-4xl w-11/12">
        <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          调试信息
        </h3>
        
        <div class="flex flex-col gap-2">
            <!-- Full Prompt -->
            <div class="collapse collapse-arrow bg-base-200 border border-base-300">
              <input type="checkbox" /> 
              <div class="collapse-title font-medium text-sm">
                对话提示词 (Full Prompt)
              </div>
              <div class="collapse-content"> 
                <div class="bg-base-300 p-4 rounded-lg font-mono text-xs overflow-auto max-h-[40vh] whitespace-pre-wrap select-text">{{ debugModal.fullPrompt || '暂无数据' }}</div>
              </div>
            </div>

            <!-- Extraction Raw -->
            <div class="collapse collapse-arrow bg-base-200 border border-base-300">
              <input type="checkbox" checked /> 
              <div class="collapse-title font-medium text-sm">
                图谱提取结果 (Extraction Raw)
              </div>
              <div class="collapse-content"> 
                <div class="bg-base-300 p-4 rounded-lg font-mono text-xs overflow-auto max-h-[40vh] whitespace-pre-wrap select-text">{{ debugModal.content }}</div>
              </div>
            </div>
        </div>

        <div class="modal-action">
          <button class="btn" @click="debugModal.show = false">关闭</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button @click="debugModal.show = false">close</button>
      </form>
    </dialog>

    <!-- Settings Modal -->
    <dialog class="modal" :class="{ 'modal-open': showConfigModal }">
      <div class="modal-box">
        <h3 class="font-bold text-lg mb-4">LLM 配置</h3>
        
        <div class="form-control w-full mb-3">
          <label class="label">
            <span class="label-text">API Base URL</span>
          </label>
          <input type="text" v-model="config.baseUrl" placeholder="https://api.openai.com/v1" class="input input-bordered w-full" />
          <label class="label">
            <span class="label-text-alt text-warning">支持 OpenAI 兼容接口 (如 vLLM, Ollama, DeepSeek)</span>
          </label>
        </div>

        <div class="form-control w-full mb-3">
          <label class="label">
            <span class="label-text">API Key</span>
          </label>
          <input type="password" v-model="config.apiKey" placeholder="sk-..." class="input input-bordered w-full" />
        </div>

        <div class="form-control w-full mb-6">
          <label class="label">
            <span class="label-text">Model Name</span>
          </label>
          <div class="join w-full">
            <select 
              v-if="modelList.length > 0"
              v-model="config.model"
              class="select select-bordered join-item flex-1 focus:outline-none"
            >
              <option disabled value="">请选择模型</option>
              <option v-for="m in modelList" :key="m" :value="m">{{ m }}</option>
            </select>
            <input 
              v-else
              type="text" 
              v-model="config.model" 
              placeholder="例如: gpt-3.5-turbo" 
              class="input input-bordered join-item flex-1 focus:outline-none" 
            />
            <button 
              class="btn join-item" 
              :class="{ 'loading': isFetchingModels }"
              @click="handleFetchModels"
              title="获取模型列表"
            >
              <svg v-if="!isFetchingModels" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          <label class="label">
             <span v-if="modelList.length > 0" class="label-text-alt text-success">已加载 {{ modelList.length }} 个模型</span>
             <span v-else class="label-text-alt text-base-content/50">点击右侧按钮获取在线模型列表</span>
          </label>
        </div>

        <!-- Advanced Settings -->
        <div class="divider">对话设置</div>
        
        <div class="flex gap-4 mb-3">
          <div class="form-control flex-1">
            <label class="label">
              <span class="label-text">上下文窗口 (轮次)</span>
              <span class="label-text-alt text-primary font-bold">{{ config.contextWindow }} 轮</span>
            </label>
            <input type="range" min="1" max="50" v-model.number="config.contextWindow" class="range range-primary range-xs" />
            <div class="w-full flex justify-between text-xs px-2 mt-1">
              <span>1</span>
              <span>25</span>
              <span>50</span>
            </div>
          </div>
        </div>

        <div class="form-control w-full mb-3">
          <label class="label cursor-pointer justify-start gap-4">
            <input type="checkbox" class="toggle toggle-secondary" v-model="config.stream" />
            <span class="label-text">启用流式输出 (Stream)</span>
          </label>
          <label class="label">
            <span class="label-text-alt text-base-content/50">注：当前版本流式输出正在适配中</span>
          </label>
        </div>

        <!-- Extractor Config -->
        <div class="divider">图谱提取模型 (可选)</div>
        
        <div class="form-control w-full mb-3">
          <label class="label cursor-pointer justify-start gap-4">
            <input type="checkbox" class="toggle toggle-primary" v-model="config.useSeparateExtractor" />
            <span class="label-text">使用独立的提取模型</span>
          </label>
        </div>

        <div v-if="config.useSeparateExtractor" class="pl-4 border-l-2 border-base-200">
           <div class="form-control w-full mb-3">
            <label class="label">
              <span class="label-text">Extractor API URL</span>
            </label>
            <input type="text" v-model="config.extractorBaseUrl" placeholder="https://api.openai.com/v1" class="input input-bordered w-full input-sm" />
          </div>

          <div class="form-control w-full mb-3">
            <label class="label">
              <span class="label-text">Extractor API Key</span>
            </label>
            <input type="password" v-model="config.extractorApiKey" placeholder="sk-..." class="input input-bordered w-full input-sm" />
          </div>

          <div class="form-control w-full mb-6">
            <label class="label">
              <span class="label-text">Extractor Model Name</span>
            </label>
             <input 
                type="text" 
                v-model="config.extractorModel" 
                placeholder="例如: gpt-3.5-turbo" 
                class="input input-bordered w-full input-sm" 
              />
          </div>
        </div>

        <div class="modal-action">
          <button class="btn btn-ghost" @click="showConfigModal = false">取消</button>
          <button class="btn btn-primary" @click="saveConfig">保存配置</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button @click="showConfigModal = false">close</button>
      </form>
    </dialog>

  </div>
</template>

<style scoped>
/* Custom scrollbar for webkit */
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: transparent; 
}
::-webkit-scrollbar-thumb {
  background: #888; 
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #555; 
}
</style>
