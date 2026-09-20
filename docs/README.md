# docs

External, non-code repository documentation.

`reviews/` holds review and task-tracking material: `Final.Review.md` is the current
review source of truth, and `LLM.Agent.Implementation.Brief.md` is its executable
companion for implementation agents. Task, review, and finding identifiers (`R-07`,
`S-15`, ticket tags) belong here and nowhere else — never in source, test names, or
comments.

Consumer and API documentation lives in the README of the package it describes.
Repository rules live in [`AGENTS.md`](../AGENTS.md) and
[`.agents/skills/nestjs-pipeline-architecture/SKILL.md`](../.agents/skills/nestjs-pipeline-architecture/SKILL.md).
Agent orientation lives in [`CLAUDE.md`](../CLAUDE.md) and
[`.claude/codebase-map.md`](../.claude/codebase-map.md).
