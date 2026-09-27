# reka-tooltip-coordination

Close an already-open tooltip when another tooltip opens. Focusing a trigger should still open its tooltip, and the existing provider settings and Escape behavior must remain intact. The open broadcast is already emitted by the library; make the receiving behavior consistent. Keep the public API unchanged.

Run the existing focused Tooltip tests. Hidden acceptance tests will be applied after submission. Only production files in the declared scope may remain changed.
