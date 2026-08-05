// Self-contained HTML for the public counter page, served by src/worker.ts.
// No external assets: inline CSS/JS, matches the Worker's own
// bundle-everything constraint.
export function renderCounterPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cindermail</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(ellipse at 50% 20%, #2a1508 0%, #120a06 55%, #0a0605 100%);
    color: #ffe8d6;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    text-align: center;
  }
  main { padding: 2rem; }
  .flame { font-size: 3rem; filter: drop-shadow(0 0 18px rgba(255,120,40,0.6)); }
  h1 {
    margin: 0.25rem 0 2rem;
    font-size: 1.75rem;
    letter-spacing: 0.02em;
    color: #ff9d52;
  }
  .stats { display: flex; gap: 2.5rem; justify-content: center; flex-wrap: wrap; }
  .stat { min-width: 10rem; }
  .stat .n {
    font-size: 3rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #ffb877;
    text-shadow: 0 0 24px rgba(255,120,40,0.35);
  }
  .stat .label {
    margin-top: 0.4rem;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #c99b7a;
  }
  .github {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 2.5rem;
    padding: 0.5rem 1rem;
    border-radius: 999px;
    border: 1px solid #4a2c18;
    color: #ffcaa1;
    text-decoration: none;
    font-size: 0.85rem;
    transition: border-color 0.15s, color 0.15s;
  }
  .github:hover { border-color: #ff9d52; color: #ffe8d6; }
  .github svg { width: 1rem; height: 1rem; fill: currentColor; }
</style>
</head>
<body>
<main>
  <div class="flame">🔥</div>
  <h1>Cindermail</h1>
  <div class="stats">
    <div class="stat"><div class="n" id="created">-</div><div class="label">addresses created</div></div>
    <div class="stat"><div class="n" id="torched">-</div><div class="label">torched</div></div>
  </div>
  <a class="github" href="https://github.com/Psalm2517/Cindermail" target="_blank" rel="noopener">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
    Source code
  </a>
</main>
<script>
  async function refresh() {
    try {
      const res = await fetch('/counters');
      if (!res.ok) return;
      const data = await res.json();
      document.getElementById('created').textContent = data.created.toLocaleString();
      document.getElementById('torched').textContent = data.torched.toLocaleString();
    } catch {
      // Next tick retries. Not worth surfacing a transient fetch failure here.
    }
  }
  refresh();
  setInterval(refresh, 5000);
</script>
</body>
</html>`;
}
