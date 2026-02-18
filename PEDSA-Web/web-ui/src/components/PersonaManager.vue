<template>
  <div class="flex flex-col h-full w-full bg-base-100 p-6 overflow-y-auto">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-bold">人设/提示词管理 (Personas)</h2>
      <button class="btn btn-primary btn-sm" @click="openEditor()">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        新建人设
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="persona in personas" :key="persona.id" class="card bg-base-200 shadow-md hover:shadow-lg transition-shadow">
        <div class="card-body p-4">
          <div class="flex justify-between items-start">
            <h3 class="card-title text-lg">{{ persona.name }}</h3>
            <div class="badge badge-sm" :class="persona.is_default ? 'badge-primary' : 'badge-ghost'">
              {{ persona.is_default ? '默认' : '自定义' }}
            </div>
          </div>
          <p class="text-sm opacity-70 line-clamp-3 mt-2 mb-4 bg-base-300 p-2 rounded font-mono text-xs h-20">
            {{ persona.prompt }}
          </p>
          <div class="card-actions justify-end">
            <button class="btn btn-ghost btn-xs" @click="openEditor(persona)">编辑</button>
            <button class="btn btn-ghost btn-xs text-error" @click="handleDelete(persona.id!)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="personas.length === 0" class="flex flex-col items-center justify-center py-20 opacity-50">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
      <p>暂无人设配置，请点击右上角新建</p>
    </div>

    <!-- Editor Modal -->
    <dialog class="modal" :class="{ 'modal-open': showEditor }">
      <div class="modal-box">
        <h3 class="font-bold text-lg mb-4">{{ editingPersona.id ? '编辑人设' : '新建人设' }}</h3>
        
        <div class="form-control w-full mb-3">
          <label class="label">
            <span class="label-text">人设名称</span>
          </label>
          <input type="text" v-model="editingPersona.name" placeholder="例如：翻译助手" class="input input-bordered w-full" />
        </div>

        <div class="form-control w-full mb-3">
          <label class="label">
            <span class="label-text">系统提示词 (System Prompt)</span>
          </label>
          <textarea 
            v-model="editingPersona.prompt" 
            class="textarea textarea-bordered h-32 font-mono text-sm" 
            placeholder="你是一个专业的翻译助手，请将所有输入翻译成中文...">
          </textarea>
        </div>

        <div class="form-control w-fit mb-6">
          <label class="label cursor-pointer gap-2">
            <span class="label-text">设为默认</span> 
            <input type="checkbox" v-model="editingPersona.is_default" class="checkbox checkbox-primary" />
          </label>
        </div>

        <div class="modal-action">
          <button class="btn btn-ghost" @click="showEditor = false">取消</button>
          <button class="btn btn-primary" @click="handleSave">保存</button>
        </div>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, inject } from 'vue'
import { getPersonas, savePersona, deletePersona, type Persona } from '../services/sqlite'

const personas = ref<Persona[]>([])
const showEditor = ref(false)
const confirm = inject<(title: string, msg: string, cb: () => void) => void>('confirm')

const editingPersona = reactive<any>({
  id: undefined,
  name: '',
  prompt: '',
  is_default: false
})

const loadPersonas = async () => {
  personas.value = await getPersonas()
}

const openEditor = (persona?: Persona) => {
  if (persona) {
    editingPersona.id = persona.id
    editingPersona.name = persona.name
    editingPersona.prompt = persona.prompt
    editingPersona.is_default = !!persona.is_default
  } else {
    editingPersona.id = undefined
    editingPersona.name = ''
    editingPersona.prompt = ''
    editingPersona.is_default = false
  }
  showEditor.value = true
}

const handleSave = async () => {
  if (!editingPersona.name || !editingPersona.prompt) {
    alert('请填写完整信息')
    return
  }
  
  await savePersona({
    id: editingPersona.id,
    name: editingPersona.name,
    prompt: editingPersona.prompt,
    is_default: editingPersona.is_default ? 1 : 0
  })
  
  showEditor.value = false
  await loadPersonas()
}

const handleDelete = (id: number) => {
  if (confirm) {
    confirm('删除人设', '确定要删除这个人设吗？', async () => {
      await deletePersona(id)
      await loadPersonas()
    })
  } else if (window.confirm('确定删除吗？')) {
      deletePersona(id).then(loadPersonas)
  }
}

onMounted(() => {
  loadPersonas()
})
</script>