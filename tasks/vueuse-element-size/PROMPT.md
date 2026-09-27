# Element-size callbacks miss measurements

The `v-element-size` directive does not reliably call its handler when the caller requests `box: 'border-box'`. Its callback should report the requested box dimensions when an element mounts, without producing duplicate callbacks. The composable should also expose an initial measurement consistent with the selected box model.

Fix the behavior while preserving the default content-box behavior and the existing public API.

Run the existing focused useElementSize tests when you are done. Hidden acceptance tests are not present in the solver workspace.
