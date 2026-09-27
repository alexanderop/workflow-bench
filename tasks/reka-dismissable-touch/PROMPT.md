# reka-dismissable-touch

A DismissableLayer that remains mounted with present=false can immediately dismiss itself on the touch interaction that opens it. Outside touch pointerdown is followed by a deferred click: the hidden layer must not capture that opening interaction and replay it after becoming present. Later outside taps must still dismiss an open layer. Preserve prevented dismissal, nested layer behavior, and Escape handling. Keep the public API unchanged.

Run the existing focused DismissableLayer tests. Hidden acceptance tests will be applied after submission. Only production files in the declared scope may remain changed.
