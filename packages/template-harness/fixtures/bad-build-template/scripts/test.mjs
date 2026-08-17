// Stand-in for "run its (empty) test suite" (TP-003) — a real template's test
// command would invoke Vitest/Playwright/etc.; this fixture just needs a
// command that exits 0.
console.log("test: ok (0 tests)");
process.exit(0);
