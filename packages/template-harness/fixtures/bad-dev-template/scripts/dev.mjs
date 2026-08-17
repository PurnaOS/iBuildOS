// Deliberately broken: simulates a dev server that hangs during startup
// (e.g. stuck compiling, waiting on a database that never answers) and never
// actually binds the preview port. The process itself starts fine and stays
// alive — this is NOT a crash — so it exercises the harness's
// preview-timeout failure path specifically, distinct from a dev process
// that exits early.
console.log("dev: starting (and then never finishing)...");
setInterval(() => {}, 1000);
