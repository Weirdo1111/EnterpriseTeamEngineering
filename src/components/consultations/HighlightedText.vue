<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string; keyword: string }>()
const parts = computed(() => {
  const keyword = props.keyword.trim()
  if (!keyword) return [{ text: props.text, matched: false }]
  const haystack = props.text.toLowerCase()
  const needle = keyword.toLowerCase()
  const segments: Array<{ text: string; matched: boolean }> = []
  let cursor = 0
  let index = haystack.indexOf(needle, cursor)
  while (index !== -1) {
    if (index > cursor) segments.push({ text: props.text.slice(cursor, index), matched: false })
    segments.push({ text: props.text.slice(index, index + keyword.length), matched: true })
    cursor = index + keyword.length
    index = haystack.indexOf(needle, cursor)
  }
  if (cursor < props.text.length) segments.push({ text: props.text.slice(cursor), matched: false })
  return segments
})
</script>

<template>
  <span class="highlighted-text"><template v-for="(part, index) in parts" :key="index"><mark v-if="part.matched">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
</template>

<style scoped>
.highlighted-text { white-space: inherit; overflow-wrap: inherit; }
mark { padding: 0 1px; border-radius: 2px; color: #183d47; background: #f7e6a3; }
</style>
