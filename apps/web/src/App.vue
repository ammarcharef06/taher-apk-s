<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppHeader from "./components/layout/AppHeader.vue";
import AppSidebar from "./components/layout/AppSidebar.vue";

const route = useRoute();
const isAuthPage = computed(() => route.meta.guestOnly === true || route.meta.publicPortal === true);
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-800">
    <template v-if="isAuthPage">
      <RouterView />
    </template>

    <template v-else>
      <AppHeader />
      <div class="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:gap-6 lg:px-8 lg:py-6">
        <AppSidebar />
        <main class="min-w-0 flex-1">
          <RouterView />
        </main>
      </div>
    </template>
  </div>
</template>
