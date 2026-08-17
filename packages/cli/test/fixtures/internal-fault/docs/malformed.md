---
type: Story
id: ST-0001
title: "Missing closing delimiter — malformed OKF"

This file never closes its frontmatter block, which makes
`parseOkfDocument` throw `OkfParseError` — used to exercise the CLI's
fallback to exit code 4 (internal fault) for genuinely unexpected failures.
