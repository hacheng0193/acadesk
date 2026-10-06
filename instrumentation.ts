export async function register() {
  // The import must sit inside this check so the edge bundle leaves it out.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Server process only, not `next build`.
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    const { startCoolAutoSync } = await import("./lib/cool-auto");
    startCoolAutoSync();
  }
}
