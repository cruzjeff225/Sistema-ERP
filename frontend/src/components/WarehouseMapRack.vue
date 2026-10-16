<script setup lang="ts">
// One rack of the aerial scene: soft contact shadow, side and front faces with beams and braces, the deck (top face) and its selectable
// slots. Geometry comes from `buildWarehouseScene`; this component only paints it, so every rack shares the same structure.
import type { MapSlot, SceneRack, SlotState } from '../utils/warehouse-scene';

defineProps<{
  rack: SceneRack; aisleName: string;
  ids: { top: string; side: string; front: string; blur: string };
  selectedId: number; tabbableId: number; labels: Record<SlotState, string>;
  isMuted: (slot: MapSlot) => boolean; isProduct: (slot: MapSlot) => boolean;
}>();
const emit = defineEmits<{ select: [slot: MapSlot]; key: [event: KeyboardEvent, slot: MapSlot] }>();
</script>

<template>
  <g role="group" :aria-label="`Pasillo ${aisleName}, estante ${rack.name}`">
    <polygon :points="rack.shadow" class="rack-shadow" :filter="`url(#${ids.blur})`" />
    <polygon :points="rack.sideFace" :fill="`url(#${ids.side})`" class="rack-edge" />
    <polygon v-for="(post, index) in rack.sidePosts" :key="`sp-${index}`" :points="post" class="rack-sidepost" />
    <polyline v-for="(beam, index) in rack.sideBeams" :key="`beam-${index}`" :points="beam" class="rack-beam" />
    <polygon :points="rack.frontFace" :fill="`url(#${ids.front})`" class="rack-edge" />
    <polyline v-for="(brace, index) in rack.frontBraces" :key="`brace-${index}`" :points="brace" class="rack-brace" />
    <polygon v-for="(post, index) in rack.posts" :key="`post-${index}`" :points="post" class="rack-post" />
    <polygon :points="rack.deck" :fill="`url(#${ids.top})`" class="rack-deck" />
    <polygon :points="rack.recess" class="rack-recess" />
    <g v-for="cell in rack.cells" :key="cell.slot.id" :data-location-id="cell.slot.id" role="button" :tabindex="tabbableId === cell.slot.id ? 0 : -1" :aria-pressed="selectedId === cell.slot.id"
      :aria-label="`${cell.slot.code}, ${labels[cell.slot.state]}, pasillo ${cell.slot.aisle}, estante ${cell.slot.rack}, nivel ${cell.slot.level}, posición ${cell.slot.position}${cell.ratio !== null ? `, ocupación ${Math.round(cell.ratio * 100)}%` : ''}${isProduct(cell.slot) ? ', ubicación del producto' : ''}`"
      class="cell" :class="[`cell-${cell.slot.state}`, { 'cell-selected': selectedId === cell.slot.id, 'cell-product': isProduct(cell.slot), 'cell-muted': isMuted(cell.slot) }]"
      @click="emit('select', cell.slot)" @keydown="emit('key', $event, cell.slot)">
      <title>{{ cell.slot.code }} · {{ labels[cell.slot.state] }}</title>
      <polygon :points="cell.poly" class="cell-bg" /><polygon v-if="cell.fill" :points="cell.fill" class="cell-fill" /><polygon :points="cell.poly" class="cell-edge" /><polygon :points="cell.ring" class="cell-ring" />
    </g>
    <text v-for="level in rack.levelLabels" :key="level.text" :x="level.x" :y="level.y" text-anchor="middle" class="level-label">{{ level.text }}</text>
    <g class="rack-tag"><rect :x="rack.tag.x - rack.tag.w / 2" :y="rack.tag.y - 16" :width="rack.tag.w" height="32" rx="6" /><text :x="rack.tag.x" :y="rack.tag.y + 6" text-anchor="middle">{{ rack.tag.text }}</text></g>
  </g>
</template>

<style scoped>
.rack-shadow { fill: #000; opacity: .26; pointer-events: none; }
.rack-edge { stroke: hsl(var(--fg) / .22); stroke-width: 1; vector-effect: non-scaling-stroke; stroke-linejoin: round; pointer-events: none; }
.rack-sidepost { fill: hsl(var(--fg) / .72); pointer-events: none; }
.rack-beam { fill: none; stroke: hsl(var(--surface) / .5); stroke-width: 2; vector-effect: non-scaling-stroke; pointer-events: none; }
.rack-brace { fill: none; stroke: hsl(var(--fg) / .35); stroke-width: 1.6; vector-effect: non-scaling-stroke; pointer-events: none; }
.rack-post { fill: hsl(var(--fg) / .8); stroke: hsl(var(--fg) / .3); stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: none; }
.rack-deck { stroke: hsl(var(--surface) / .55); stroke-width: 1.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; pointer-events: none; }
.rack-recess { fill: hsl(var(--surface)); stroke: hsl(var(--fg) / .18); stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: none; }
.level-label { fill: hsl(var(--muted-fg)); font-size: 14px; font-weight: 600; pointer-events: none; }
.rack-tag { pointer-events: none; filter: drop-shadow(0 2px 3px rgb(0 0 0 / .18)); }
.rack-tag rect { fill: hsl(var(--surface)); stroke: hsl(var(--border)); stroke-width: 1; vector-effect: non-scaling-stroke; }
.rack-tag text { fill: hsl(var(--fg)); font-size: 20px; font-weight: 600; }
.cell { cursor: pointer; outline: none; transition: opacity .15s; }
.cell-bg { fill: hsl(var(--surface-secondary)); }
.cell-edge { fill: none; stroke: hsl(var(--fg) / .16); stroke-width: 1; vector-effect: non-scaling-stroke; }
.cell-ring { fill: none; stroke: transparent; stroke-width: 0; vector-effect: non-scaling-stroke; stroke-linejoin: round; pointer-events: none; }
.cell-fill { fill: #1f7af2; }
.cell-AVAILABLE .cell-bg { fill: hsl(var(--success) / .1); }
.cell-AVAILABLE .cell-edge { stroke: hsl(var(--success)); stroke-width: 1.6; }
.cell-OCCUPIED .cell-bg { fill: #1f7af2; }
.cell-OCCUPIED:has(.cell-fill) .cell-bg { fill: #1f7af2; fill-opacity: .22; }
.cell-OCCUPIED .cell-edge { stroke: #1560c8; }
.cell-FULL .cell-bg { fill: #e29a2f; }
.cell-FULL .cell-edge { stroke: #b87a1d; }
.cell-INACTIVE .cell-bg { fill: hsl(var(--muted-fg) / .3); }
.cell-INACTIVE .cell-edge { stroke: hsl(var(--muted-fg)); stroke-dasharray: 4 3; }
.cell:hover .cell-ring { stroke: hsl(var(--fg) / .55); stroke-width: 2; }
.cell-product .cell-ring { stroke: hsl(var(--accent)); stroke-width: 2.5; }
.cell:focus-visible .cell-ring { stroke: hsl(var(--accent)); stroke-width: 3.5; }
.cell-selected .cell-ring { stroke: hsl(var(--fg)); stroke-width: 3; }
.cell-muted { opacity: .25; }
</style>
