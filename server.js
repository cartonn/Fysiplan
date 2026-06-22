import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

function readBuildInfo() {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "dist", "build-info.json"), "utf8"));
  } catch {
    return {
      builtAt: "local-dev",
      commit: process.env.RAILWAY_GIT_COMMIT_SHA || "unknown"
    };
  }
}

function page() {
  const build = readBuildInfo();

  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Fysiplan</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #172026;
        --muted: #5d6b73;
        --line: #d8e3e7;
        --blue: #1769aa;
        --green: #11835a;
        --paper: #f7faf8;
        --white: #ffffff;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          linear-gradient(120deg, rgba(17, 131, 90, 0.10), transparent 36%),
          linear-gradient(250deg, rgba(23, 105, 170, 0.12), transparent 42%),
          var(--paper);
      }

      main {
        width: min(1120px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 56px 0;
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
        gap: 32px;
        align-items: start;
      }

      .eyebrow {
        margin: 0 0 12px;
        color: var(--green);
        font-size: 0.82rem;
        font-weight: 800;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        max-width: 820px;
        font-size: clamp(2.4rem, 6vw, 5.6rem);
        line-height: 0.94;
        letter-spacing: 0;
      }

      .lead {
        max-width: 720px;
        margin: 24px 0 0;
        color: var(--muted);
        font-size: clamp(1.05rem, 2vw, 1.28rem);
        line-height: 1.6;
      }

      .panel {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.82);
        box-shadow: 0 16px 50px rgba(23, 32, 38, 0.08);
      }

      .status {
        padding: 22px;
      }

      .status h2,
      .roadmap h2 {
        margin: 0;
        font-size: 1rem;
        letter-spacing: 0;
      }

      .status dl {
        display: grid;
        gap: 14px;
        margin: 20px 0 0;
      }

      .status div {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        border-top: 1px solid var(--line);
        padding-top: 14px;
      }

      dt {
        color: var(--muted);
      }

      dd {
        margin: 0;
        font-weight: 700;
        text-align: right;
        overflow-wrap: anywhere;
      }

      .roadmap {
        margin-top: 40px;
        padding: 24px;
      }

      .steps {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
        margin-top: 20px;
      }

      .step {
        min-height: 150px;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 18px;
        background: var(--white);
      }

      .step strong {
        display: block;
        margin-bottom: 10px;
        color: var(--blue);
      }

      .step p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }

      @media (max-width: 820px) {
        main {
          padding: 36px 0;
        }

        .hero,
        .steps {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero" aria-labelledby="title">
        <div>
          <p class="eyebrow">Railway preview live</p>
          <h1 id="title">Fysiplan</h1>
          <p class="lead">
            Een startpunt voor een fysiotherapie-planner: behandeltrajecten,
            oefeningen en voortgang komen straks in een compacte werkflow samen.
          </p>
        </div>

        <aside class="panel status" aria-label="Bouwstatus">
          <h2>Bouwstatus</h2>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>Online</dd>
            </div>
            <div>
              <dt>Build</dt>
              <dd>${build.builtAt}</dd>
            </div>
            <div>
              <dt>Commit</dt>
              <dd>${String(build.commit).slice(0, 12)}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section class="panel roadmap" aria-labelledby="roadmap-title">
        <h2 id="roadmap-title">Eerste bouwlijn</h2>
        <div class="steps">
          <article class="step">
            <strong>1. Intake</strong>
            <p>Patientgegevens, hulpvraag en behandeldoel snel vastleggen.</p>
          </article>
          <article class="step">
            <strong>2. Plan</strong>
            <p>Oefeningen, frequentie en meetmomenten per behandeltraject beheren.</p>
          </article>
          <article class="step">
            <strong>3. Voortgang</strong>
            <p>Resultaten en opmerkingen volgen met een duidelijk overzicht per client.</p>
          </article>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, service: "Fysiplan" }));
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(page());
});

server.listen(port, host, () => {
  console.log(`Fysiplan listening on ${host}:${port}`);
});
