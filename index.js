require("dotenv").config();

const polka = require("polka");
const Mustache = require("mustache");
const basicAuth = require("@78nine/polka-basic-auth");
const path = require("path");
const { readFileSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } = require("fs");
const qs = require("querystring");
const { openDB } = require("./db");
const { randomBytes } = require("crypto");

const DB_PATH = process.env.DB_PATH || 'urls.db'
const BASE_PATH = process.env.REDIRECTION_PATH || 'redirection'

const BASE_URL = process.env.BASE_URL
const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin'
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'admin'

mkdirSync(BASE_PATH, { recursive: true })

const db = openDB(DB_PATH)

const templateHome = readFileSync(
  path.join(__dirname, "templates", "home.html"),
  {
    encoding: "utf-8",
  }
);
const redirPage = readFileSync(
  path.join(__dirname, "templates", "redir.html"),
  {
    encoding: "utf-8",
  }
);
const css = readFileSync(
  path.join(__dirname, "node_modules", "water.css", "out", "water.min.css"),
  { encoding: "utf-8" }
);

const authMiddleware = basicAuth({
  users: {
    [DASHBOARD_USER]: DASHBOARD_PASSWORD,
  },
  challenge: true,
  unauthorizedResponse: "Invalid credentials.",
  realm: "cd3c2e8042f3",
})

const app = polka();

app.get('/r/:slug', (req, res) => {
  const slug = req.params.slug
  const row = db.get(slug)
  if (!row) {
    res.writeHead(404);
    return res.end('Not Found')
  }

  res.writeHead(307, { location: row.value });
  res.end()
})

app.get("/water.css", (_, res) => {
  res.writeHead(200, { "Content-Type": "text/css" });
  return res.end(css);
});

app.get("/", authMiddleware, (req, res) => {
  const url = new URL(`http://${req.headers.host}${req.url}`);
  const base = BASE_URL || ('http://' + url.host + '/r')
  const urls = db.list().map(([k, v]) => ({
    slug: k,
    short: base + "/" + k,
    long: v.value
  }))

  const view = {
    urls,
    short_url: '',
    long_url: '',
    error: url.searchParams.get('error'),
  }

  const slug = url.searchParams.get('slug')
  if (slug) {
    const row = db.get(slug)
    if (row) {
      view.short_url = base + "/" + slug
      view.long_url = row.value
    }
  }

  const body = Mustache.render(templateHome, view);
  res.writeHead(view.error ? 400 : 200, { "Content-Type": "text/html" });
  return res.end(body);
});

app.post("/new", authMiddleware, async (req, res) => {
  const { url, slug: userSlug } = await getBody(req);

  if (!/^https?:\/\//.test(url)) {
    res.writeHead(303, { location: "/?error=" + encodeURIComponent("URL must be a valid http(s) URL.") });
    return res.end()
  }

  const slug = userSlug || randomBytes(3).toString('hex')

  if (!/^[0-9a-z-_]+$/.test(slug)) {
    res.writeHead(303, { location: "/?error=" + encodeURIComponent("Slug can only contain numbers, letters, dashes and undescores.") });
    return res.end()
  }

  try {
    const redirPath = path.join(BASE_PATH, slug)
    mkdirSync(redirPath, { recursive: true })
    const body = Mustache.render(redirPage, { destination: url });
    writeFileSync(path.join(redirPath, 'index.html'), body, { encoding: "utf-8" })

    db.put(slug, url, false)
  } catch (error) {
    console.trace(error)
    res.writeHead(303, { location: "/?error=" + encodeURIComponent(error.message) });
    return res.end()
  }

  res.writeHead(303, { location: "/?slug=" + slug });
  return res.end();
});

app.post("/del", authMiddleware, async (req, res) => {
  const { slug } = await getBody(req);

  if (!/^[0-9a-z-_]+$/.test(slug)) {
    res.writeHead(303, { location: "/?error=" + encodeURIComponent("Slug can only contain numbers, letters, dashes and undescores.") });
    return res.end()
  }

  try {
    const redirPath = path.join(BASE_PATH, slug)
    unlinkSync(path.join(redirPath, 'index.html'))
    rmdirSync(redirPath)

    db.del(slug)
  } catch (error) {
    console.trace(error)
    res.writeHead(303, { location: "/?error=" + encodeURIComponent(error.message) });
    return res.end()
  }

  res.writeHead(303, { location: "/" });
  return res.end();
});

app.listen(process.env.DASHBOARD_PORT || 3018, () => {
  console.log(
    "Dashboard listening on port " + (process.env.DASHBOARD_PORT || 3018) + "."
  );
});

/**
 * @param {import("polka").Request} req
 * @returns {Promise<import("querystring").ParsedUrlQuery>}
 */
function getBody(req) {
  return new Promise((res, rej) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", (chunk) => {
      if (chunk) body += chunk;
      res(qs.parse(body));
    });
    req.on("error", rej);
  });
}
