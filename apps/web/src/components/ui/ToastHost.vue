<script setup lang="ts">
import { useToast } from "../../composables/toast";
const {messages,dismiss}=useToast();
</script>
<template>
<div class="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-3 px-4 sm:inset-x-auto sm:left-6 sm:items-start" aria-live="polite">
<TransitionGroup name="toast">
<article v-for="item in messages" :key="item.id" class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-white p-4 shadow-2xl" :class="item.kind==='success'?'border-emerald-200':item.kind==='error'?'border-red-200':'border-slate-200'">
<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg font-bold" :class="item.kind==='success'?'bg-emerald-50 text-emerald-600':item.kind==='error'?'bg-red-50 text-red-600':'bg-slate-100 text-slate-600'">{{item.kind==='success'?'✓':item.kind==='error'?'!':'i'}}</span>
<div class="min-w-0 flex-1"><p class="text-sm font-bold text-slate-900">{{item.title}}</p><p class="mt-1 break-words text-sm leading-6 text-slate-600">{{item.message}}</p></div>
<button type="button" class="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100" aria-label="إغلاق" @click="dismiss(item.id)">×</button>
</article>
</TransitionGroup>
</div>
</template>
<style scoped>
.toast-enter-active,.toast-leave-active,.toast-move{transition:all .28s ease}.toast-enter-from{opacity:0;transform:translateY(-12px) scale(.98)}.toast-leave-to{opacity:0;transform:translateX(-20px) scale(.98)}.toast-leave-active{position:absolute}
</style>