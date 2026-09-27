# Build a personal workout tracker

Create a new, usable workout-tracking application in the blank Nuxt starter provided. This is a product implementation task, not a bug fix. The intended user trains several times a week and wants a private, lightweight log without signing in. Work through the complete brief; a good-looking static dashboard or a form that loses its data is not a finished product.

## Environment and scope

Use the installed Nuxt 4, Vue 3, and TypeScript toolchain with Composition API and `<script setup lang="ts">`. Dependencies and configuration are deliberately fixed for a fair comparison. Dexie is available, but native IndexedDB is also acceptable. Implement production code inside `app/`; do not change manifests, lockfiles, Nuxt configuration, tests, or benchmark infrastructure. There is no existing product behavior to preserve. Organize components and persistence code sensibly. The production app must build with `pnpm build` and run with `node .output/server/index.mjs`. Keep browser-only storage access safe during server rendering.

## First use and navigation

At `/`, show a page heading “Workout tracker”, a meaningful empty history state, and a “New workout” button. Do not seed fake workouts. A workout has a title, a calendar date, optional notes, and one or more exercise entries. Dates represent the day selected, without timezone shifting. Provide a history region named “Workout history”. Render each saved workout as an article with its title as a heading, date, notes when present, exercise details, and a labelled total volume. Put “Edit workout” and “Delete workout” buttons in each article.

## Creating a workout

“New workout” opens a clearly labelled editor with fields named “Workout title”, “Workout date”, and “Notes”. Default the date to today. Start with one exercise row and provide “Add exercise”. Every row has fields named “Exercise name”, “Sets”, “Reps”, and “Weight (kg)”, plus “Remove exercise”. Keep these repeated controls in the same order as their rows. A row records a repeated set prescription, for example Squat, 3 sets, 5 reps, 80 kg. Weights may contain decimals; zero is valid for bodyweight work. Use kilograms throughout. “Save workout” persists the complete workout and returns to history. “Cancel” returns without saving.

## Validation and calculations

Require a non-whitespace title, a date, and at least one exercise. Every exercise needs a non-whitespace name, positive integer sets, positive integer reps, and a finite nonnegative weight. Blank numeric fields are invalid. Invalid saves must leave the editor and entered values visible, display an understandable validation message in a live alert, and never add a history entry. Trim title and exercise names when saving. Volume is the sum of sets × reps × weight for every exercise. Display the number with the unit “kg”; formatting may include locale separators and up to two decimal places. Do not multiply or count the same row twice.

## Editing, deleting, and history

History is newest calendar date first. “Edit workout” pre-fills all saved fields and rows. Saving replaces that workout without creating a duplicate; cancelling an edit must leave the stored original untouched. Removing a row must remove its contribution to the total. “Delete workout” must ask for confirmation before removing anything. Use a native confirmation dialog or an accessible dialog with a “Confirm delete” button and “Cancel”. Cancelling deletion preserves the record; confirming removes it durably. Support more than one saved workout without edits or deletes affecting the wrong record.

## Local persistence and failure behavior

Use IndexedDB as the authoritative store. Do not use localStorage, sessionStorage, cookies, a remote API, or a backend database for workout persistence. Every successful create, edit, and delete must survive page reload and a later browser visit. Clearing localStorage must not erase workouts. Keep existing records intact when opening a fresh editor. If the database cannot open or a write fails, display an actionable alert, do not claim success, and retain unsaved form data for retry. No login, telemetry, third-party fonts, or external network requests are needed. Offline here means local data operations while the app is loaded; service-worker installation and offline page loading are out of scope.

## Usability and delivery

Use semantic headings, associated visible labels, keyboard-operable native controls, visible focus indicators, and readable contrast. The page should fit a 390px mobile viewport without horizontal scrolling and remain comfortable on desktop. Present loading and empty states honestly. Give the form and history a coherent visual hierarchy; choose the visual style yourself. Avoid unnecessary abstractions or dependencies. Verify your implementation with the tools available and finish with a short account of what you built, what you checked, and any remaining limitations.
