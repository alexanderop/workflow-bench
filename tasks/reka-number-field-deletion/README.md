# reka-number-field-deletion

Source: https://github.com/unovue/reka-ui/pull/2851

Baseline: `719d59af17978eb1e1fe547256501ac960e1a1a4`. Accepted fix: `35fd06884296e8fb12607c8eb6f4aecda60295bc`. The shared baseline precedes all four Reka cases. The component production source is unchanged up to this fix parent. Tests and reference changes are retained under the upstream MIT license. These are historical issue replays, with possible training contamination. Tests use the upstream Vitest/jsdom component environment, not a real-browser guarantee.

The hidden test patch adds the accepted upstream regression. The full focused component suite also checks neighboring behavior. Qualification must observe its specific assertion fail on the base and all checks pass with the reference. Live comparisons use unchanged Sol/medium/900-second experiment definitions, three repetitions, and independently graded solver patches.
