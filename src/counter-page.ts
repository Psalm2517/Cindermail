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
