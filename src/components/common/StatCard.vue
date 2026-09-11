<script setup lang="ts">
import type { Component } from 'vue'

interface Props {
  title: string
  value: string | number
  trend: string
  tone?: 'blue' | 'teal' | 'amber' | 'red'
  icon: Component
}

withDefaults(defineProps<Props>(), {
  tone: 'blue',
})
</script>

<template>
  <article class="stat-card" :class="`stat-card-${tone}`">
    <div class="stat-icon">
      <component :is="icon" :size="20" />
    </div>
    <div class="stat-copy">
      <p class="stat-title">{{ title }}</p>
      <strong class="stat-value">{{ value }}</strong>
      <span class="stat-trend">{{ trend }}</span>
    </div>
  </article>
</template>

<style scoped>
.stat-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 14px;
  min-height: 118px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  box-shadow: var(--shadow);
}

.stat-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 8px;
}

.stat-copy {
  min-width: 0;
}

.stat-title {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 13px;
}

.stat-value {
  display: block;
  font-size: 28px;
  line-height: 1.1;
  color: var(--text);
}

.stat-trend {
  display: block;
  margin-top: 10px;
  color: var(--muted);
  font-size: 12px;
}

.stat-card-blue .stat-icon {
  color: var(--primary);
  background: #e8f2ff;
}

.stat-card-teal .stat-icon {
  color: var(--teal);
  background: #e5f8f5;
}

.stat-card-amber .stat-icon {
  color: var(--amber);
  background: #fff4dc;
}

.stat-card-red .stat-icon {
  color: var(--red);
  background: #ffeded;
}
</style>
