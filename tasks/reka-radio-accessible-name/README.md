# reka-radio-accessible-name

Source: https://github.com/unovue/reka-ui/pull/2861

Baseline: `719d59af17978eb1e1fe547256501ac960e1a1a4`. Accepted fix: `3efdb080a9dae9ba13a03f625096b393f20e3359`. The shared baseline precedes all four Reka cases. The component production source is unchanged up to this fix parent. Tests and reference changes are retained under the upstream MIT license. These are historical issue replays, with possible training contamination. Tests use the upstream Vitest/jsdom component environment, not a real-browser guarantee.

The hidden test patch adds the accepted upstream regression. The full focused component suite also checks neighboring behavior. Qualification must observe its specific assertion fail on the base and all checks pass with the reference. Live comparisons use unchanged Sol/medium/900-second experiment definitions, three repetitions, and independently graded solver patches.
