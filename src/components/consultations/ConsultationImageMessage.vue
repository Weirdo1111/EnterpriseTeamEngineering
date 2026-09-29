<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Download } from '@lucide/vue'
import { consultationImageStore } from '@/services/consultation-images'
import type { ConsultationImage } from '@/types/clinical'
import HighlightedText from './HighlightedText.vue'

const props = defineProps<{ image: ConsultationImage; keyword?: string }>()
const emit = defineEmits<{ loaded: [] }>()
const imageUrl = shallowRef('')
const imageBlob = shallowRef<Blob | null>(null)
const loading = ref(false)
const ready = ref(false)
const imageError = ref('')
const downloadError = ref('')
const previewVisible = ref(false)
const downloadUrls = new Map<string, number>()
let requestVersion = 0
let disposed = false

const sizeLabel = computed(() => props.image.size >= 1024 * 1024
  ? `${(props.image.size / (1024 * 1024)).toFixed(1)} MB`
  : props.image.size >= 1024
    ? `${Math.ceil(props.image.size / 1024)} KB`
    : `${props.image.size} bytes`)
const thumbnailStyle = computed(() => ({
  width: `${Math.min(props.image.width, 240 * props.image.width / props.image.height)}px`,
  aspectRatio: `${props.image.width} / ${props.image.height}`,
}))

function releaseImage() {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
  imageBlob.value = null
  ready.value = false
}

async function loadImage() {
  const version = ++requestVersion
  const { id: imageId, mimeType, size } = props.image
  previewVisible.value = false
  releaseImage()
  imageError.value = ''
  downloadError.value = ''
  loading.value = true
  try {
    const blob = await consultationImageStore.get(imageId)
    if (disposed || version !== requestVersion) return
    if (!(blob instanceof Blob) || blob.size === 0 || blob.size !== size || blob.type !== mimeType) {
      throw new Error('The saved image is missing, damaged, or does not match its file details. Please retry loading it.')
    }
    imageBlob.value = blob
    imageUrl.value = URL.createObjectURL(blob)
  } catch (error) {
    if (disposed || version !== requestVersion) return
    releaseImage()
    loading.value = false
    imageError.value = error instanceof Error && error.message.trim() ? error.message : 'Unable to load this image. Please retry.'
  }
}

function imageLoaded(event: Event) {
  if (disposed || (event.currentTarget as HTMLImageElement).src !== imageUrl.value) return
  loading.value = false
  ready.value = true
  emit('loaded')
}

function imageFailed(event: Event) {
  if (disposed || (event.currentTarget as HTMLImageElement).src !== imageUrl.value) return
  releaseImage()
  loading.value = false
  imageError.value = 'This saved image could not be displayed. It may be missing or damaged. Try loading it again.'
}

function downloadOriginal() {
  if (!ready.value || !imageBlob.value) return
  downloadError.value = ''
  let url = ''
  let link: HTMLAnchorElement | undefined
  try {
    url = URL.createObjectURL(imageBlob.value)
    link = document.createElement('a')
    link.href = url
    link.download = props.image.name
    link.hidden = true
    document.body.appendChild(link)
    link.click()
    // Allow the browser to start the download before releasing its separate URL.
    const timer = window.setTimeout(() => {
      URL.revokeObjectURL(url)
      downloadUrls.delete(url)
    }, 60_000)
    downloadUrls.set(url, timer)
  } catch {
    if (url) URL.revokeObjectURL(url)
    downloadError.value = 'The image could not be downloaded. Please try Download Original again.'
  } finally {
    link?.remove()
  }
}

watch(() => [props.image.id, props.image.mimeType, props.image.size] as const, () => { void loadImage() }, { immediate: true })

onBeforeUnmount(() => {
  disposed = true
  requestVersion++
  releaseImage()
  downloadUrls.forEach((timer, url) => {
    window.clearTimeout(timer)
    URL.revokeObjectURL(url)
  })
  downloadUrls.clear()
})
</script>

<template>
  <figure class="consultation-image">
    <div v-if="imageError" class="image-error" role="alert">
      <p>{{ imageError }}</p>
      <el-button size="small" @click="loadImage">Retry image</el-button>
    </div>
    <button
      v-if="loading || imageUrl"
      class="image-thumbnail"
      :style="thumbnailStyle"
      type="button"
      :title="`View image: ${image.name}`"
      :aria-label="`View image: ${image.name}`"
      :disabled="!ready"
      @click="previewVisible = true"
    >
      <span v-if="loading" class="image-status" role="status">Loading image…</span>
      <img v-if="imageUrl" :key="imageUrl" :src="imageUrl" :width="image.width" :height="image.height" :alt="`Image attachment: ${image.name}`" @load="imageLoaded" @error="imageFailed" />
    </button>
    <figcaption class="image-caption">
      <strong><HighlightedText :text="image.name" :keyword="keyword ?? ''" /></strong>
      <span>{{ image.width }} × {{ image.height }} px · {{ sizeLabel }}</span>
      <span class="preview-hint" :style="{ visibility: ready ? 'visible' : 'hidden' }">Select the image to enlarge</span>
    </figcaption>

    <el-dialog
      v-model="previewVisible"
      :title="image.name"
      width="min(840px, calc(100vw - 32px))"
      top="8vh"
      class="consultation-image-dialog"
      append-to-body
      destroy-on-close
    >
      <div class="image-preview">
        <img v-if="imageUrl && ready" :key="imageUrl" :src="imageUrl" :alt="`Full-size image attachment: ${image.name}`" @error="imageFailed" />
        <div v-if="imageError" class="image-error" role="alert"><p>{{ imageError }}</p><el-button size="small" @click="loadImage">Retry image</el-button></div>
      </div>
      <p class="preview-details">{{ image.width }} × {{ image.height }} px · {{ sizeLabel }} · Original file</p>
      <p v-if="downloadError" class="download-error" role="alert">{{ downloadError }}</p>
      <template #footer>
        <div class="preview-actions">
          <el-button @click="previewVisible = false">Close</el-button>
          <el-button type="primary" :icon="Download" :disabled="!ready || !imageBlob" @click="downloadOriginal">Download Original</el-button>
        </div>
      </template>
    </el-dialog>
  </figure>
</template>

<style scoped>
.consultation-image { display: grid; gap: 8px; min-width: 0; max-width: 100%; margin: 10px 0 0; }
.image-thumbnail { position: relative; display: block; box-sizing: border-box; justify-self: start; max-width: 100%; max-height: 240px; padding: 0; overflow: hidden; border: 1px solid #b9d1db; border-radius: 4px; background: #f3f7f8; cursor: zoom-in; }
.image-thumbnail:focus-visible { outline: 3px solid var(--primary); outline-offset: 3px; }
.image-thumbnail:disabled { cursor: wait; }
.image-thumbnail img { display: block; width: 100%; height: 100%; max-width: 100%; max-height: 240px; object-fit: contain; }
.image-caption { display: grid; gap: 3px; min-width: 0; color: var(--muted); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.image-caption strong { color: var(--text-strong); font-size: 12px; font-weight: 600; }
.preview-hint { color: var(--primary); }
.image-status { position: absolute; inset: 0; display: grid; place-items: center; padding: 6px; color: var(--muted); background: #f3f7f8; font-size: 12px; }
.image-error { display: grid; justify-items: start; gap: 8px; padding: 10px; border: 1px solid var(--border-strong); border-radius: 4px; background: var(--panel-soft); }
.image-error p { margin: 0; color: var(--text-strong); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.image-preview { display: grid; place-items: center; min-width: 0; width: 100%; }
.image-preview img { display: block; max-width: 100%; max-height: 65vh; width: auto; height: auto; object-fit: contain; }
.preview-details { margin: 12px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.download-error { margin: 10px 0 0; color: var(--red); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.preview-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.preview-actions :deep(.el-button + .el-button) { margin-left: 0; }
:global(.consultation-image-dialog .el-dialog__title) { display: block; padding-right: 20px; overflow-wrap: anywhere; }
@media (max-width: 600px) { .image-thumbnail img { margin: 0 auto; } .preview-actions :deep(.el-button) { max-width: 100%; } }
</style>
