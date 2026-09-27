<script setup lang="ts">
import { withBase } from '../lib/links'
import { computed, ref } from 'vue'
import {
  ArrowUpRight,
  FlaskConical,
  Check,
  X,
  BookOpen,
  ArrowRight,
  CircleHelp,
} from '@lucide/vue'
import type { Dashboard } from '../lib/dashboard'
const props = defineProps<{ data: Dashboard }>()
const selected = ref(props.data.studies[0]?.plan.id ?? '')
const study = computed(() =>
  props.data.studies.find((s) => s.plan.id === selected.value),
)
const filter = ref('all'),
  query = ref(''),
  detail = ref<string | null>(null)
const attempts = computed(() =>
  (study.value?.attempts ?? []).filter(
    (r) =>
      (filter.value === 'all' || r.outcome === filter.value) &&
      `${r.taskId} ${r.experiment.id}`
        .toLowerCase()
        .includes(query.value.toLowerCase()),
  ),
)
const current = computed(() =>
  study.value?.attempts.find((a) => a.cellId === detail.value),
)
const tasks = computed(() => [
  ...new Set(study.value?.plan.cells.map((c) => c.taskId) ?? []),
])
const percent = (n: number | null) =>
  n === null ? '—' : `${Math.round(n * 100)}%`
const seconds = (n: number | null) =>
  n === null ? '—' : `${(n / 1000).toFixed(1)}s`
function cellStatus(task: string, experiment: string) {
  const cells =
    study.value?.plan.cells.filter(
      (c) => c.taskId === task && c.experiment.id === experiment,
    ) ?? []
  const rows =
    study.value?.attempts.filter(
      (a) => a.taskId === task && a.experiment.id === experiment,
    ) ?? []
  return `${rows.filter((r) => r.outcome === 'resolved').length} passed · ${rows.length}/${cells.length} recorded`
}
</script>

<template>
  <div class="shell">
    <header class="top">
      <a class="brand" :href="withBase('/')"
        ><FlaskConical :size="22" aria-hidden="true" />workflow<span>bench</span
        ><small>LOCAL LAB</small></a
      >
      <nav aria-label="Main">
        <a :href="withBase('/start/quickstart/')"
          ><BookOpen :size="16" aria-hidden="true" /> Field guide</a
        ><a class="active" :href="withBase('/results/')"
          >Results <ArrowUpRight :size="15" aria-hidden="true"
        /></a>
      </nav>
    </header>
    <main id="main">
      <section class="intro">
        <div>
          <p class="eyebrow">THE WORKFLOW EXPERIMENT</p>
          <h1>Does the process<br />improve the outcome?</h1>
          <p class="lede">
            Same task. Same model. Different workflows.<br />Independent tests
            decide what actually worked.
          </p>
        </div>
        <aside class="principle">
          <span class="marker">01 / MEASURE THE OUTCOME</span>
          <p>
            A completed plan is a process signal.<br /><strong
              >A passing patch is evidence.</strong
            >
          </p>
          <a :href="withBase('/concepts/interpretation/')"
            >How to read this report <ArrowRight :size="17" aria-hidden="true"
          /></a>
        </aside>
      </section>
      <div class="section-head">
        <h2><span class="dot" /> Experiment notebook</h2>
        <span class="snapshot"
          >LOCAL SNAPSHOT ·
          {{
            new Date(data.generatedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          }}</span
        >
      </div>
      <template v-if="data.studies.length">
        <div class="controls">
          <label
            >Experiment plan
            <select v-model="selected" @change="detail = null">
              <option
                v-for="s in data.studies"
                :key="s.plan.id"
                :value="s.plan.id"
              >
                {{ s.environmentLabel }} · {{ s.plan.id }} ·
                {{ s.plan.cells.length }} attempts
              </option>
            </select></label
          ><a :href="withBase('/concepts/fair-comparisons/')"
            >Fair-comparison checklist
            <CircleHelp :size="16" aria-hidden="true"
          /></a>
        </div>
        <p v-if="study" class="muted">
          Execution environment: {{ study.environmentLabel }}
        </p>
        <p v-if="study?.plan.retryOf" class="muted">
          Retry of {{ study.plan.retryOf.planId }}. Original attempts remain in
          that plan; these results are reported separately.
        </p>
        <div class="metrics">
          <article v-for="row in study?.summary" :key="row.id">
            <p class="eyebrow">{{ row.id }}</p>
            <strong>{{ percent(row.rate) }}</strong
            ><span>resolved among evaluated attempts</span>
            <div>
              {{ row.resolved }} / {{ row.evaluated }} evaluated ·
              {{ row.errors }} errors
            </div>
            <footer>
              <span>{{ row.completed }} / {{ row.planned }} recorded</span
              ><span>{{ seconds(row.medianMs) }} median</span>
            </footer>
            <p v-if="row.missing" class="warning">
              {{ row.missing }} planned attempts missing
            </p>
          </article>
        </div>
        <section v-if="study?.comparisons.length" class="comparisons">
          <h3>Paired differences</h3>
          <p class="muted">
            Positive values favor the workflow. Only matching model, budget,
            task, and environment pairs are compared.
          </p>
          <div v-for="c in study.comparisons" :key="c.treatment" class="pair">
            <strong>{{ c.treatment }} vs {{ c.baseline }}</strong
            ><span>{{
              c.delta === null
                ? 'No comparable pairs'
                : `${c.delta >= 0 ? '+' : ''}${(c.delta * 100).toFixed(1)} percentage points`
            }}</span
            ><small
              >{{ c.paired }} pairs · {{ c.tasks }} tasks ·
              {{ c.excluded }} excluded</small
            ><small v-if="c.interval"
              >Task-bootstrap 95% interval:
              {{ (c.interval[0] * 100).toFixed(1) }} to
              {{ (c.interval[1] * 100).toFixed(1) }} pp. Small corpora remain
              exploratory.</small
            ><small v-else
              >Too few independent tasks for an interval. No winner
              established.</small
            >
          </div>
        </section>
        <section class="matrix">
          <h3>Task coverage</h3>
          <div class="table-wrap">
            <table>
              <caption class="sr-only">
                Resolved and recorded attempts by task and experiment
              </caption>
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th v-for="row in study?.summary" :key="row.id" scope="col">
                    {{ row.id }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="task in tasks" :key="task">
                  <th scope="row">{{ task }}</th>
                  <td v-for="row in study?.summary" :key="row.id">
                    {{ cellStatus(task, row.id) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section class="attempts">
          <div class="section-head">
            <h3>Inspect the evidence</h3>
            <span>{{ attempts.length }} attempts</span>
          </div>
          <div class="filters">
            <label
              >Search
              <input
                v-model="query"
                type="search"
                placeholder="Task or workflow" /></label
            ><label
              >Outcome
              <select v-model="filter">
                <option value="all">All outcomes</option>
                <option
                  v-for="o in [
                    'resolved',
                    'unresolved',
                    'timeout',
                    'infrastructure_error',
                    'auth_error',
                    'rate_limited',
                    'unsupported',
                    'cancelled',
                  ]"
                  :key="o"
                >
                  {{ o }}
                </option>
              </select></label
            >
          </div>
          <p v-if="!attempts.length" class="muted">
            No recorded attempts match these filters.
          </p>
          <button
            v-for="a in attempts"
            :key="a.cellId"
            class="attempt"
            @click="detail = detail === a.cellId ? null : a.cellId"
            :aria-expanded="detail === a.cellId"
          >
            <span :class="['badge', a.outcome]">{{ a.outcome }}</span
            ><strong>{{ a.taskId }}</strong
            ><span>{{ a.experiment.id }} · repeat {{ a.repetition }}</span
            ><span>{{ seconds(a.durationMs) }}</span
            ><ArrowUpRight :size="16" aria-hidden="true" />
          </button>
          <article v-if="current" class="detail" aria-live="polite">
            <h4>{{ current.cellId }}</h4>
            <p>{{ current.message }}</p>
            <dl>
              <div>
                <dt>Workflow activation</dt>
                <dd>{{ current.activation }}</dd>
              </div>
              <div>
                <dt>Completed children</dt>
                <dd>{{ current.completedChildren }}</dd>
              </div>
              <div>
                <dt>Root tokens</dt>
                <dd>{{ current.rootTokens ?? 'Unknown' }}</dd>
              </div>
              <div>
                <dt>Child tokens</dt>
                <dd>{{ current.childTokens ?? 'Unknown' }}</dd>
              </div>
            </dl>
            <p class="muted">
              Activation is diagnostic, separate from the acceptance outcome.
              Raw model transcripts remain private.
            </p>
            <details v-for="check in current.checks" :key="check.name">
              <summary>
                {{
                  check.assessment === 'not_assessed'
                    ? 'NOT ASSESSED'
                    : check.exitCode === 0
                      ? 'PASS'
                      : 'FAIL'
                }}
                · {{ check.name }}
              </summary>
              <pre>{{ check.output }}</pre>
            </details>
            <details v-if="current.patch">
              <summary>Candidate patch</summary>
              <pre>{{ current.patch }}</pre>
            </details>
          </article>
        </section>
      </template>
      <section v-else class="empty">
        <div class="empty-icon">
          <FlaskConical :size="30" aria-hidden="true" />
        </div>
        <div>
          <p class="eyebrow">READY FOR YOUR FIRST COMPARISON</p>
          <h3>No workflow results yet.</h3>
          <p>
            Start with the local demonstration, then run a small paired
            experiment.<br />This report never fills empty cells with example
            scores.
          </p>
          <a class="button" :href="withBase('/start/quickstart/')"
            >Run your first experiment
            <ArrowRight :size="16" aria-hidden="true"
          /></a>
        </div>
        <div class="terminal">
          <span>NO MODEL CALLS</span
          ><code>pnpm bench demo<br />pnpm bench ui</code>
        </div>
      </section>
      <section class="qualification">
        <div>
          <p class="eyebrow">FIRST, CHECK THE MEASURING INSTRUMENT</p>
          <h2>Can the tests tell broken from fixed?</h2>
          <p>
            Qualification tests the benchmark itself. It does not tell us which
            workflow is better.
          </p>
          <a :href="withBase('/concepts/qualification/')"
            >Understand qualification <ArrowRight :size="16" aria-hidden="true"
          /></a>
        </div>
        <div class="qualification-cards">
          <article>
            <span>Broken baseline</span
            ><strong v-if="data.demo"
              ><X :size="20" aria-hidden="true" />
              {{
                data.demo.base.some((c) => c.exitCode !== 0)
                  ? 'Fails as expected'
                  : 'Unexpected pass'
              }}</strong
            ><strong v-else>Not run yet</strong
            ><small>The intended regression must fail.</small>
          </article>
          <article>
            <span>Reference fix</span
            ><strong v-if="data.demo"
              ><Check :size="20" aria-hidden="true" />
              {{
                data.demo.reference.every((c) => c.exitCode === 0)
                  ? 'Passes acceptance'
                  : 'Checks failed'
              }}</strong
            ><strong v-else>Not run yet</strong
            ><small>The trusted solution must pass.</small>
          </article>
        </div>
      </section>
      <footer class="bottom">
        <span>Workflow Bench / A local lab for agentic software work</span
        ><a :href="withBase('/reference/limitations/')"
          >Know the limits <ArrowUpRight :size="14" aria-hidden="true"
        /></a>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.shell {
  max-width: 1280px;
  margin: auto;
  padding: 0 48px;
}
.top {
  height: 94px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--wb-border);
}
.brand {
  display: flex;
  gap: 8px;
  align-items: center;
  text-decoration: none;
  font-size: 21px;
  font-weight: 750;
  letter-spacing: -1px;
}
.brand svg {
  color: var(--sl-color-accent);
}
.brand span {
  font-weight: 400;
  margin-left: -8px;
}
.brand small {
  font-size: 9px;
  letter-spacing: 1.5px;
  border: 1px solid var(--wb-border);
  color: var(--sl-color-gray-3);
  padding: 5px 7px;
  margin-left: 14px;
}
nav {
  display: flex;
  gap: 26px;
}
nav a,
.principle a,
.qualification a,
.controls > a,
.bottom a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  font-size: 13px;
}
nav .active {
  font-weight: 700;
}
nav a {
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--sl-color-gray-2);
  padding: 9px 11px;
}
nav a:hover,
nav .active {
  border-color: var(--wb-border);
  color: var(--sl-color-white);
}
.intro {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 70px;
  align-items: end;
  padding: 68px 0 56px;
}
.eyebrow,
.marker {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.7px;
}
.eyebrow {
  color: var(--sl-color-accent);
  margin: 0 0 17px;
}
h1 {
  font-size: clamp(38px, 4.5vw, 62px);
  line-height: 1.06;
  letter-spacing: -3px;
  font-weight: 550;
  margin: 0 0 22px;
}
.lede {
  font-size: 16px;
  line-height: 1.7;
  color: var(--sl-color-gray-3);
  margin: 0;
}
.principle {
  border-left: 2px solid var(--sl-color-accent);
  padding: 8px 0 8px 28px;
  margin-bottom: 6px;
}
.marker {
  color: var(--sl-color-accent);
}
.principle p {
  line-height: 1.9;
  font-size: 15px;
  margin: 20px 0;
}
.principle strong {
  font-weight: 600;
}
.principle a {
  color: var(--sl-color-accent);
}
.controls > a {
  color: var(--sl-color-accent);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--wb-border);
  padding-bottom: 16px;
  gap: 12px;
}
.section-head h2,
.section-head h3 {
  font-size: 16px;
  font-weight: 650;
  margin: 0;
}
.dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sl-color-accent);
  margin-right: 10px;
}
.snapshot,
.section-head > span {
  font-size: 10px;
  color: var(--sl-color-gray-3);
  letter-spacing: 1px;
}
.empty {
  display: flex;
  align-items: center;
  gap: 28px;
  background: var(--wb-raised);
  border: 1px solid var(--wb-border);
  border-radius: 8px;
  padding: 38px;
  margin-top: 24px;
}
.empty-icon {
  width: 68px;
  height: 68px;
  display: grid;
  place-items: center;
  background: var(--wb-panel);
  border: 1px solid var(--wb-border);
  border-radius: 50%;
  flex-shrink: 0;
}
.empty h3 {
  font-size: 24px;
  letter-spacing: -0.7px;
  margin: 0 0 12px;
}
.empty p:not(.eyebrow) {
  font-size: 13px;
  line-height: 1.8;
  color: var(--sl-color-gray-3);
}
.button {
  display: inline-flex;
  align-items: center;
  gap: 18px;
  background: var(--wb-orange);
  color: #111;
  font-weight: 650;
  padding: 12px 16px;
  border-radius: 5px;
  text-decoration: none;
  font-size: 12px;
  margin-top: 10px;
}
.terminal {
  margin-left: auto;
  min-width: 235px;
  padding: 23px;
  background: var(--wb-panel);
  border: 1px solid var(--wb-border);
  border-radius: 6px;
}
.terminal > span {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--sl-color-accent);
  display: block;
  margin-bottom: 16px;
}
.terminal code {
  font-size: 12px;
  line-height: 2.2;
}
.qualification {
  padding: 50px 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 60px;
}
.qualification h2 {
  font-size: 23px;
  letter-spacing: -0.6px;
  line-height: 1.3;
  margin: 0 0 12px;
}
.qualification p:not(.eyebrow) {
  font-size: 13px;
  line-height: 1.8;
  color: var(--sl-color-gray-3);
  max-width: 380px;
}
.qualification a {
  margin-top: 9px;
  color: var(--sl-color-accent);
}
.qualification-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.qualification-cards article {
  border: 1px solid var(--wb-border);
  border-radius: 8px;
  padding: 23px;
  background: var(--wb-raised);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 15px;
}
.qualification-cards span {
  font-size: 12px;
  color: var(--sl-color-gray-3);
}
.qualification-cards strong {
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.qualification-cards small {
  font-size: 11px;
  color: var(--sl-color-gray-3);
  line-height: 1.7;
}
.bottom {
  padding: 23px 0 35px;
  border-top: 1px solid var(--wb-border);
  display: flex;
  justify-content: space-between;
  color: var(--sl-color-gray-3);
  font-size: 11px;
}
.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 24px 0;
}
.controls label,
.filters label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
}
select,
input {
  padding: 10px 12px;
  border: 1px solid var(--wb-border);
  border-radius: 5px;
  background: var(--wb-raised);
  color: var(--sl-color-white);
  max-width: 100%;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}
.metrics article {
  background: var(--wb-raised);
  border: 1px solid var(--wb-border);
  border-radius: 8px;
  padding: 23px;
}
.metrics strong {
  display: block;
  font-size: 40px;
  letter-spacing: -2px;
}
.metrics article > span {
  font-size: 10px;
  color: var(--sl-color-gray-3);
}
.metrics article > div {
  font-size: 12px;
  margin: 18px 0;
}
.metrics footer {
  border-top: 1px solid var(--wb-border);
  padding-top: 14px;
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--sl-color-gray-3);
}
.warning {
  font-size: 11px;
  color: var(--sl-color-accent-high);
}
.comparisons,
.matrix,
.attempts {
  margin: 30px 0;
}
h3 {
  font-size: 17px;
}
.muted {
  font-size: 12px;
  line-height: 1.7;
  color: var(--sl-color-gray-3);
}
.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 18px 0;
  border-bottom: 1px solid var(--wb-border);
  font-size: 13px;
}
.pair small {
  color: var(--sl-color-gray-3);
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th,
td {
  text-align: left;
  padding: 16px 12px;
  border-bottom: 1px solid var(--wb-border);
  white-space: nowrap;
}
thead {
  background: var(--wb-panel);
}
th {
  font-weight: 600;
}
.filters {
  display: flex;
  gap: 14px;
  margin: 20px 0;
}
.attempt {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 15px 10px;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--wb-border);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: inherit;
}
.attempt:hover {
  background: var(--wb-panel);
}
.attempt > span:nth-last-child(2) {
  margin-left: auto;
}
.badge {
  font-size: 10px;
  padding: 5px 8px;
  border-radius: 4px;
  background: #252525;
  color: #bdbdbd;
}
.badge.resolved {
  background: #123522;
  color: #78d99d;
}
.badge.unresolved,
.badge.timeout {
  background: #3a2912;
  color: #f2b866;
}
.badge.auth_error,
.badge.infrastructure_error,
.badge.rate_limited,
.badge.unsupported {
  background: #3d1c1c;
  color: #f08b82;
}
.detail {
  background: var(--wb-raised);
  border: 1px solid var(--wb-border);
  border-radius: 8px;
  margin-top: 16px;
  padding: 25px;
}
.detail h4 {
  overflow-wrap: anywhere;
}
.detail dl {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  font-size: 12px;
}
.detail dt {
  color: var(--sl-color-gray-3);
}
.detail dd {
  margin: 8px 0;
  font-weight: 600;
}
details {
  padding: 14px 0;
  border-top: 1px solid var(--wb-border);
}
summary {
  cursor: pointer;
  font-size: 13px;
}
pre {
  max-height: 400px;
  overflow: auto;
  background: var(--wb-panel);
  padding: 15px;
  font-size: 11px;
  line-height: 1.6;
}
h1,
h2,
h3,
h4,
.metrics strong {
  letter-spacing: -0.045em;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
@media (max-width: 1000px) {
  .shell {
    padding: 0 25px;
  }
  .intro {
    gap: 30px;
  }
  .empty {
    flex-wrap: wrap;
  }
  .terminal {
    margin-left: 96px;
    width: calc(100% - 96px);
  }
  .qualification {
    gap: 25px;
  }
  .controls {
    align-items: flex-start;
    gap: 15px;
  }
  .controls > a {
    max-width: 180px;
  }
}
@media (max-width: 650px) {
  .shell {
    padding: 0 20px;
  }
  .top {
    height: 76px;
  }
  .brand {
    font-size: 18px;
  }
  .brand small {
    display: none;
  }
  nav {
    gap: 6px;
  }
  nav a {
    font-size: 11px;
    gap: 4px;
    padding: 7px 6px;
  }
  .intro {
    grid-template-columns: 1fr;
    padding: 38px 0;
    gap: 25px;
  }
  h1 {
    letter-spacing: -1.8px;
  }
  .principle {
    padding-left: 18px;
  }
  .snapshot {
    display: none;
  }
  .empty {
    padding: 25px;
    gap: 20px;
  }
  .empty-icon {
    display: none;
  }
  .terminal {
    margin-left: 0;
    width: 100%;
    min-width: 0;
  }
  .qualification {
    grid-template-columns: 1fr;
    padding: 35px 0;
  }
  .qualification-cards {
    gap: 10px;
  }
  .qualification-cards article {
    padding: 16px;
  }
  .bottom {
    gap: 15px;
    align-items: flex-start;
  }
  .bottom > span {
    max-width: 200px;
    line-height: 1.7;
  }
  .controls {
    flex-direction: column;
  }
  .controls label {
    max-width: 100%;
  }
  .metrics {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .metrics article {
    padding: 15px;
  }
  .metrics .eyebrow {
    letter-spacing: 0;
  }
  .metrics footer {
    flex-direction: column;
    gap: 8px;
  }
  .pair {
    grid-template-columns: 1fr;
  }
  .attempt {
    flex-wrap: wrap;
    gap: 9px;
  }
  .attempt strong {
    flex: 1;
  }
  .attempt > span:nth-last-child(2) {
    margin-left: 0;
  }
  .detail {
    padding: 15px;
  }
  .detail dl {
    grid-template-columns: 1fr 1fr;
  }
  .filters {
    flex-direction: column;
  }
}
</style>
