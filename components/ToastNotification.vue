<script setup lang="ts">
import { useToast } from "~/composables/useToast";

const { toast, clearToast } = useToast();
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="transform translate-y-3 opacity-0"
    enter-to-class="transform translate-y-0 opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="transform translate-y-0 opacity-100"
    leave-to-class="transform translate-y-3 opacity-0"
  >
    <div
      v-if="toast"
      class="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface border border-line-strong text-white shadow-2xl text-xs font-medium"
    >
      <div 
        class="w-2 h-2 rounded-full shrink-0"
        :class="toast.type === 'success' ? 'bg-white shadow-[0_0_6px_#ffffff]' : 'bg-[#aaaaaa]'"
      />
      <span>{{ toast.message }}</span>
      <button 
        @click="clearToast"
        class="text-muted hover:text-white p-0.5 rounded ml-1"
      >
        <svg class="w-3.5 h-3.5 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  </Transition>
</template>
