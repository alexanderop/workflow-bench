# Diagram generation

Generated with the built-in image_gen tool on 2026-09-27. These are original explanatory illustrations for Workflow Bench, not measured experiment results. Visual reference inspected at https://docs.livestore.dev/overview/introduction/.

The source PNGs are retained here as the original generated illustrations. The guide now displays exact, accessible SVG versions from `apps/docs/public/diagrams/`, with page theme colors and sharp labels. Full-size links open those SVGs. The original prompts below preserve the illustration provenance.

## solver-grader.png

Use case: infographic-diagram. Create an original technical documentation diagram for Workflow Bench, 1536x1024 landscape. Style: elegant hand-drawn architecture sketch, slightly imperfect thin cream strokes, dark warm brown boxes with subtle sparse diagonal pencil hatching, restrained burnt-orange arrows, casual handwritten but extremely readable labels. Uniform near-black #090909 background, no texture outside boxes, generous empty margins. Similar to carefully drawn Excalidraw engineering documentation, not a UI screenshot. No logo, no main title, no decoration.
Exact structure: One small box top center labeled "Qualified image". Two thin arrows branch downward from this box to TWO large boxes on the middle row. Left box labeled "Solver" with smaller inner text "Baseline + workflow" and a tiny terminal icon. Right box labeled "Grader" with inner text "Baseline + patch" and a tiny check-list icon. A clearly rightward horizontal arrow from Solver to Grader is labeled "Candidate patch". A separate small box directly above-right of Grader labeled "Trusted tests" has an arrow entering Grader only. A small box centered beneath Grader labeled "Result" receives one downward arrow from Grader. Add bottom-left small handwritten note on two lines "Tests stay outside" / "the solver". All lines clear and noncrossing, wide gap between Solver and Grader, diagram fills most of canvas. Only these exact labels. The image expresses that solver and grader start from the same frozen image but only the grader receives trusted tests. Do not draw a tests-to-solver connection. Large enough text to read at 700 CSS pixels wide.

Final refinement prompt:

Edit this technical diagram. Preserve every box, arrow, label, spelling and position exactly. Replace ALL background outside boxes with one solid perfectly uniform flat color #090909. Remove ALL gradients, halos, bloom, glow, shadows, blur, smudges and illumination. This is a flat 2D ink drawing on a uniform black canvas, not a lit scene. Make arrow lines thin flat orange, never glowing. Keep cream handwritten lettering and subtle brown diagonal box hatching. Exact geometry and diagram content unchanged.

## qualification.png

Use case: infographic-diagram. Original technical docs image for Workflow Bench, landscape 1536x1024. Flat 2D hand-drawn engineering diagram, like a careful Excalidraw sketch. Perfectly uniform solid #090909 background. NO gradients, NO glow, NO shadows, NO blur, NO lighting, NO decorative texture. Thin slightly irregular cream outlines, dark warm brown box fill with sparse diagonal pencil hatching. Thin flat orange arrows. Large legible handwritten labels. Three independent rows, left-to-right. Equal spacing, same-sized cards, generous outer margins. Column 1 left has input boxes. Column 2 center is the same trusted grader in each row. Column 3 right has outcome labels.
Row 1: left box "Broken base", arrow to center box "Trusted checks", arrow to right label "Expected failure" with small orange X.
Row 2: left box "Reference fix", arrow to center box "Trusted checks", arrow to right label "All pass" with small cream checkmark.
Row 3: left box "Incomplete fix", arrow to center box "Trusted checks", arrow to right label "Rejected" with small orange X.
Only these nine labels. No title, subtitle, numbers, extra prose or footnotes. No arrows between rows. Preserve exact spelling. This is a conceptual qualification diagram, not a dashboard and not measured results. Large text readable at 700 CSS pixels width.

## controlled-comparison.png

Use case: infographic-diagram. Original technical documentation image, 1536x1024 landscape. Flat 2D hand-drawn engineering sketch with perfectly uniform #090909 background. Thin slightly irregular cream outlines, dark warm brown box fill, sparse diagonal pencil hatching, thin solid orange arrows. NO glow, NO gradients, NO shadows, NO blur, NO lighting. Large readable handwritten text.
A controlled workflow comparison shown as a symmetric branching diagram. TOP CENTER wide box with exact two-line text "Same task + model" and "Same tools + limits". Two arrows fan down into TWO separate boxes at middle left and middle right. Left middle box text "Plain Codex". Right middle box text "Codex + workflow". Each of these boxes has ONE downward arrow to its OWN grading box directly below. Both grading boxes have the same exact label "Independent checks". At bottom center, two arrows from these grading boxes converge into one wide box labeled "Compare paired outcomes". Below this final box, small but readable handwritten note "Repeat across tasks". Exactly 6 boxes. Arrows only downward; no arrow between arms. Do not combine the two independent checks boxes. Do not add pass rates, timing numbers, winners, score bars, legends, badges or any measured results. Preserve exact labels. Wide margins and orderly aligned layout, fills canvas without crowding.

Final refinement prompt:

Edit this diagram. Keep every label, every box and the complete exact arrow routing unchanged. Remove ALL glow, bloom, shadows, halo, blur, smudges and gradients. Replace the entire background outside the boxes with solid perfectly uniform near-black #090909. Make the box interiors uniformly dark brown #201307 with thin pencil hatching. Arrows must be thin flat orange strokes with no illumination. This must look like flat ink on paper, a crisp Excalidraw-style sketch, never a lit scene. Preserve all spelling and text positions.
