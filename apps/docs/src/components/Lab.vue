<script setup lang="ts">
import { computed, ref } from 'vue'
const tasks = ref(12),
  workflows = ref(4),
  repetitions = ref(3),
  minutes = ref(15)
const attempts = computed(
  () => tasks.value * workflows.value * repetitions.value,
)
const hours = computed(() => (attempts.value * minutes.value) / 60)
</script>
<template>
  <section class="lab" aria-label="Experiment size calculator">
    <p class="label">PLANNING TOOL · NO OBSERVED RESULTS</p>
    <div class="fields">
      <label
        >Independent tasks
        <input v-model.number="tasks" type="range" min="1" max="40" /><output>{{
          tasks
        }}</output></label
      ><label
        >Workflows
        <input
          v-model.number="workflows"
          type="range"
          min="2"
          max="6"
        /><output>{{ workflows }}</output></label
      ><label
        >Repetitions per cell
        <input
          v-model.number="repetitions"
          type="range"
          min="1"
          max="10"
        /><output>{{ repetitions }}</output></label
      ><label
        >Minutes allowed per attempt
        <input
          v-model.number="minutes"
          type="range"
          min="1"
          max="60"
        /><output>{{ minutes }}</output></label
      >
    </div>
    <div class="totals" aria-live="polite">
      <div>
        <strong>{{ attempts }}</strong
        ><span>planned attempts</span>
      </div>
      <div>
        <strong>{{ hours.toFixed(1) }} h</strong
        ><span>maximum serial solve time</span>
      </div>
      <div>
        <strong>{{ tasks }}</strong
        ><span>independent task clusters</span>
      </div>
    </div>
    <p>
      Preparation and grading add time. Runs may finish early. Increasing
      repetitions does not increase the number of independent tasks, and equal
      time does not guarantee equal token usage.
    </p>
  </section>
</template>
<style scoped>
.lab {
  border: 1px solid var(--sl-color-gray-4);
  border-radius: 10px;
  padding: 24px;
  margin: 24px 0;
}
.label {
  font:
    10px ui-monospace,
    monospace;
  letter-spacing: 1px;
  color: var(--sl-color-accent-high);
}
.fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
  margin: 25px 0;
}
.fields label {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  font-size: 14px;
}
.fields input {
  grid-column: 1;
  width: 100%;
  accent-color: var(--sl-color-accent);
}
output {
  grid-column: 2;
  grid-row: 2;
  font-weight: 600;
}
.totals {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  border-block: 1px solid var(--sl-color-gray-5);
  padding: 24px 0;
}
.totals strong {
  display: block;
  font-size: 32px;
  letter-spacing: -1px;
}
.totals span {
  font-size: 12px;
}
.lab > p:last-child {
  font-size: 13px;
}
@media (max-width: 550px) {
  .fields,
  .totals {
    grid-template-columns: 1fr;
  }
  .totals strong {
    font-size: 25px;
  }
}
</style>
