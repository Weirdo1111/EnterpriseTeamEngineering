<script setup lang="ts">
interface Props {
  title: string
  description: string
}

defineProps<Props>()
</script>

<template>
  <header class="page-header">
    <div class="page-copy">
      <h1 class="page-title">{{ title }}</h1>
      <p class="page-description">{{ description }}</p>
    </div>
    <div class="page-actions">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  min-height: 58px;
}

.page-copy {
  min-width: 0;
}

.page-title {
  margin: 0;
  color: var(--text-strong);
  font-size: 25px;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.page-description {
  max-width: 800px;
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}

.page-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .page-actions {
    justify-content: flex-start;
  }
}
</style>
