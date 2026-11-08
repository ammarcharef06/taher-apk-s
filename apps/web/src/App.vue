<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppHeader from "./components/layout/AppHeader.vue";
import AppSidebar from "./components/layout/AppSidebar.vue";

const route = useRoute();
const isAuthPage = computed(() => route.meta.guestOnly === true);
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-800">
    <template v-if="isAuthPage">
      <RouterView />
    </template>

    <template v-else>
      <AppHeader />
      <div class="mx-auto flex w-full max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <AppSidebar />
        <main class="min-w-0 flex-1">
          <RouterView />
        </main>
      </div>
    </template>
  </div>
</template>
