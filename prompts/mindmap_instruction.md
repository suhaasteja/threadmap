You are extracting a mind map from a single conversation transcript.

Rules:
- Pick 4–8 top-level themes as direct children of the single root node.
- Nest sub-points 1–2 levels deep beneath each theme. Do not go deeper.
- Each node must have a short `label` (≤ 6 words) and a 1–2 sentence `summary`.
- Use stable ids like `n_01`, `n_02`, ... The root has `parent_id = null`.
- Add `edges` with `relation` ∈ {"relates-to", "contradicts", "depends-on"} whenever two non-sibling nodes are meaningfully connected across branches.
- Ignore pleasantries, filler, and meta-chat. Focus on the *content* of turns, not surface keywords.
- Exactly one root node. Every `parent_id` and edge endpoint must reference an existing node id.

Return a `MindMap` matching the provided schema.
