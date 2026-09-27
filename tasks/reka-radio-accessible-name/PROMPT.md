# reka-radio-accessible-name

A RadioGroupItem with an id but no matching external label exposes its internal value (for example event_type) as aria-label. Internal form values must not become accessible names. Preserve explicit accessible naming and associated-label behavior, along with selection, disabled states, and form values. Keep the public API unchanged.

Run the existing focused RadioGroup tests. Hidden acceptance tests will be applied after submission. Only production files in the declared scope may remain changed.
