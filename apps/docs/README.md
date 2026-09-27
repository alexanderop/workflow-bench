# Authoring the guide

The guide uses short explanations, concrete examples, and small diagrams to introduce Workflow Bench. The visual and editorial reference is the [LiveStore introduction](https://docs.livestore.dev/overview/introduction/). Write original explanations of this repository's behavior.

## Start with the reader's question

Open a concept page with its core idea in one or two sentences. Follow it with a diagram when relationships or boundaries are easier to see than describe. Walk through the receipt fixture before introducing detailed controls or limitations.

Keep tutorials, how-to guides, explanations, and reference pages focused on their purpose. Place expected observations beside commands. Link to the deeper explanation instead of interrupting a procedure with it. End with a relevant next step.

Retain section anchors when reorganizing a page. Keep command names, artifact paths, and metric definitions consistent with the implementation.

## Keep examples separate from evidence

Label receipt examples and hypothetical outcomes as teaching material. Never turn an illustration into a measured score. Preserve every caveat in a measured report. Keep activation evidence, deterministic acceptance, and optional quality preferences separate. Missing usage remains unknown.

## Add a diagram

Store source images in `src/assets/diagrams`. Use MDX for pages that render the `Diagram.astro` component. Pass an imported image, meaningful alternative text, and a caption.

Each diagram explains one relationship. Use short labels, directional arrows, and the existing cream, brown, and orange sketch style. Avoid decorative metrics or invented outcomes. Keep the complete explanation in nearby text so the image is not the only way to understand it.

`Diagram.astro` renders a compressed WebP through Astro's image pipeline and links to the original PNG. Sharp provides image processing at build time. The frame stays dark in both themes so the labels retain their contrast.

The [generation prompts](src/assets/diagrams/PROMPTS.md) record the source of the initial images. Inspect spelling, arrow direction, and factual meaning before adding generated artwork.

## Check the result

Run `pnpm verify` from the repository root. Inspect the built page in light and dark themes and at a narrow viewport. Open the full-size image through its link, check that captions and text alternatives describe the diagram, and confirm that existing navigation still works.
