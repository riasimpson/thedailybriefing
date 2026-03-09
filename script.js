const NEWSDATA_API_KEY = "pub_bf801222c93f4a0aa638f45e1ba45df9";

const NEWS_ENDPOINT = "https://newsdata.io/api/1/latest";
const PRIMARY_DOMAINS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "theguardian.com",
  "foxnews.com"
];

const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=44.0582&longitude=-121.3153&current_weather=true&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America%2FLos_Angeles";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&w=1200&q=80";

const state = {
  articles: [],
  breakingUrlsSeen: new Set(),
  notificationsEnabled: false
};

const sectionEls = {
  us: document.getElementById("usStories"),
  world: document.getElementById("worldStories"),
  business: document.getElementById("businessStories"),
  politics: document.getElementById("politicsStories"),
  tech: document.getElementById("techStories")
};

const alertsBtn = document.getElementById("enableAlertsBtn");
const refreshBtn = document.getElementById("refreshBtn");

if (alertsBtn) alertsBtn.addEventListener("click", enableDesktopAlerts);
if (refreshBtn) refreshBtn.addEventListener("click", refreshAll);

boot();

async function boot() {
  setStatus("Booting…");
  startWorldClocks();
  await loadWeather();
  await refreshAll();

  setInterval(loadWeather, 60 * 60 * 1000);
  setInterval(refreshAll, 15 * 60 * 1000);
  setInterval(() => {
    if (document.visibilityState === "visible") {
      checkBreakingUpdates();
    }
  }, 3 * 60 * 1000);
}

function setStatus(text) {
  const el = document.getElementById("lastRefresh");
  if (el) el.textContent = text;
}

async function refreshAll() {
  try {
    setStatus("Refreshing…");
    const articles = await fetchNews();
    state.articles = articles;

    renderLeadStory(articles);
    renderSidebarLists(articles);
    renderTicker(articles);
    renderSections(articles);

    setStatus(new Date().toLocaleString());
  } catch (error) {
    renderError(error);
    setStatus("Error");
    console.error("Refresh error:", error);
  }
}

async function fetchNews() {
  if (!NEWSDATA_API_KEY || !NEWSDATA_API_KEY.startsWith("pub_")) {
    throw new Error("NewsData API key missing or invalid.");
  }

  const url = new URL(NEWS_ENDPOINT);
  url.searchParams.set("apikey", NEWSDATA_API_KEY);
  url.searchParams.set("language", "en");
  url.searchParams.set("domain", PRIMARY_DOMAINS.join(","));
  url.searchParams.set("size", "10");

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`NewsData returned invalid JSON: ${text.slice(0, 160)}`);
  }

  if (!res.ok) {
    throw new Error(data.message || `NewsData request failed (${res.status})`);
  }

  if (data.status !== "success") {
    throw new Error(data.message || "NewsData returned a non-success response.");
  }

  const items = Array.isArray(data.results) ? data.results : [];
  const normalized = normalizeArticles(items);

  if (!normalized.length) {
    throw new Error("No article results came back from NewsData.");
  }

  return normalized;
}

function normalizeArticles(items) {
  const seen = new Set();

  return items
    .map((item) => {
      const url = item.link || item.url || "";
      const title = item.title || "";
      const image = item.image_url || item.image || "";
      const source = item.source_name || item.source_id || domainName(url);
      const published = item.pubDate || item.publishedAt || "";
      const description = item.description || "";

      return {
        title: title.trim(),
        url: url.trim(),
        image: image || FALLBACK_IMAGE,
        source: source || "Source",
        published,
        description: description.trim(),
        section: guessSection(title, description, source)
      };
    })
    .filter((item) => {
      if (!item.url || !item.title) return false;
      if (isHomepageUrl(item.url)) return false;
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
}

function renderLeadStory(articles) {
  const lead = pickLeadStory(articles);
  if (!lead) return;

  document.getElementById("leadLink").textContent = lead.title;
  document.getElementById("leadLink").href = lead.url;
  document.getElementById("leadImage").src = lead.image || FALLBACK_IMAGE;
  document.getElementById("leadImage").alt = lead.title;
  document.getElementById("leadDek").textContent =
    lead.description || "Open the original article for the full story.";
  document.getElementById("leadMeta").textContent = `${lead.source} • ${relativeTime(lead.published)}`;
  document.getElementById("leadBullets").innerHTML = buildLeadBullets(articles, lead);
}

function renderSidebarLists(articles) {
  const breaking = articles.slice(0, 4);
  const mostRead = articles.slice(4, 8);

  document.getElementById("breakingList").innerHTML = breaking.length
    ? breaking.map((article) => sidebarItem(article)).join("")
    : `<div class="panel-empty">No breaking stories loaded.</div>`;

  document.getElementById("mostReadList").innerHTML = mostRead.length
    ? mostRead.map((article, index) => sidebarItem(article, index + 1)).join("")
    : `<div class="panel-empty">No additional stories loaded.</div>`;
}

function renderTicker(articles) {
  const sourceItems = articles.slice(0, 8);
  document.getElementById("tickerTrack").innerHTML = sourceItems.length
    ? sourceItems.map((article) => `
        <span class="ticker-item">
          <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(article.title)}
          </a>
        </span>
      `).join("")
    : "<span>No headlines loaded.</span>";
}

function renderSections(articles) {
  const bySection = {
    us: articles.filter((a) => a.section === "us").slice(0, 4),
    world: articles.filter((a) => a.section === "world").slice(0, 4),
    business: articles.filter((a) => a.section === "business").slice(0, 3),
    politics: articles.filter((a) => a.section === "politics").slice(0, 4),
    tech: articles.filter((a) => a.section === "tech").slice(0, 4)
  };

  Object.entries(bySection).forEach(([key, items]) => {
    sectionEls[key].innerHTML = items.length
      ? items.map((article) => storyCard(article)).join("")
      : `<div class="panel-empty">No stories loaded.</div>`;
  });
}

async function checkBreakingUpdates() {
  try {
    const latest = await fetchNews();
    const newest = latest.slice(0, 3);
    const unseen = newest.filter((item) => !state.breakingUrlsSeen.has(item.url));

    newest.forEach((item) => state.breakingUrlsSeen.add(item.url));

    if (state.notificationsEnabled && unseen.length) {
      unseen.slice(0, 2).forEach((item) => {
        notify(item.title, `${item.source} • ${relativeTime(item.published)}`, item.url);
      });
    }

    renderSidebarLists(latest);
    renderTicker(latest);
  } catch (error) {
    console.warn("Breaking check failed:", error);
  }
}

async function enableDesktopAlerts() {
  if (!("Notification" in window)) {
    alert("Desktop notifications are not supported in this browser.");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    state.notificationsEnabled = true;
    alertsBtn.textContent = "Desktop Alerts On";
  }
}

function notify(title, body, url) {
  if (Notification.permission !== "granted") return;
  const n = new Notification("The Daily Briefing", { body: `${title} — ${body}` });
  n.onclick = () => window.open(url, "_blank", "noopener");
}

async function loadWeather() {
  try {
    const res = await fetch(WEATHER_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Weather request failed.");

    const data = await res.json();
    const currentTemp = data.current_weather?.temperature;
    const weatherCode = data.current_weather?.weathercode;

    document.getElementById("weatherCurrentTemp").textContent =
      currentTemp !== undefined ? `${Math.round(currentTemp)}°F` : "--°F";
    document.getElementById("weatherCurrentDesc").textContent = weatherCodeToText(weatherCode);
    document.getElementById("weatherNowLine").textContent = "Bend, Oregon • 5-day forecast";

    const days = data.daily?.time || [];
    const highs = data.daily?.temperature_2m_max || [];
    const lows = data.daily?.temperature_2m_min || [];
    const codes = data.daily?.weather_code || [];

    document.getElementById("forecastRow").innerHTML = days.slice(0, 5).map((day, i) => `
      <div class="forecast-day">
        <div class="day-name">${dayShort(day)}</div>
        <div class="temp-range">${Math.round(highs[i])}° / ${Math.round(lows[i])}°</div>
        <div class="desc">${weatherCodeToText(codes[i])}</div>
      </div>
    `).join("");
  } catch (error) {
    document.getElementById("weatherNowLine").textContent = "Weather unavailable";
    console.error("Weather error:", error);
  }
}

function startWorldClocks() {
  updateWorldClocks();
  setInterval(updateWorldClocks, 1000);
}

function updateWorldClocks() {
  const now = new Date();

  document.getElementById("manilaTime").textContent = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(now);

  document.getElementById("manilaDate").textContent = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(now);

  document.getElementById("swedenTime").textContent = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(now);

  document.getElementById("swedenDate").textContent = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Stockholm",
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(now);
}

function sidebarItem(article, number = null) {
  return `
    <div class="panel-item">
      <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">
        ${number ? `${number}. ` : ""}${escapeHtml(article.title)}
      </a>
      <div class="panel-item-meta">${escapeHtml(article.source)} • ${escapeHtml(relativeTime(article.published))}</div>
    </div>
  `;
}

function storyCard(article) {
  return `
    <article class="story-card">
      <a class="story-image-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">
        <img class="story-image" src="${escapeHtml(article.image || FALLBACK_IMAGE)}" alt="${escapeHtml(article.title)}" />
      </a>
      <div class="story-body">
        <h4 class="story-title">
          <a class="story-title-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(article.title)}
          </a>
        </h4>
        <div class="story-meta">${escapeHtml(article.source)} • ${escapeHtml(relativeTime(article.published))}</div>
      </div>
    </article>
  `;
}

function buildLeadBullets(articles, lead) {
  return articles
    .filter((item) => item.url !== lead.url)
    .slice(0, 4)
    .map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></li>`)
    .join("") || "<li>More stories will appear after refresh.</li>";
}

function pickLeadStory(articles) {
  return articles[0] || null;
}

function guessSection(title, description, source) {
  const text = `${title} ${description} ${source}`.toLowerCase();
  if (/(stock|market|dow|nasdaq|s&p|oil|inflation|fed|economy|business|earnings|tariff)/.test(text)) return "business";
  if (/(election|congress|senate|house|supreme court|white house|campaign|governor|president|policy|trump|biden)/.test(text)) return "politics";
  if (/(ai|artificial intelligence|chip|science|nasa|space|tech|software|iphone|microsoft|google|openai|tesla)/.test(text)) return "tech";
  if (/(iran|israel|ukraine|russia|china|gaza|middle east|europe|asia|africa|world|global|united nations|u\.n\.)/.test(text)) return "world";
  return "us";
}

function relativeTime(dateString) {
  if (!dateString) return "Recently";
  const then = new Date(dateString);
  if (Number.isNaN(then.getTime())) return "Recently";

  const diff = Date.now() - then.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function dayShort(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
}

function weatherCodeToText(code) {
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storm";
  return "Mixed";
}

function domainName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function isHomepageUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname === "/" || u.pathname === "";
  } catch {
    return true;
  }
}

function renderError(error) {
  const message = error?.message || "Unknown error";
  document.getElementById("leadLink").textContent = "Unable to load headline";
  document.getElementById("leadLink").href = "#";
  document.getElementById("leadImage").src = FALLBACK_IMAGE;
  document.getElementById("leadImage").alt = "Fallback image";
  document.getElementById("leadMeta").textContent = "News feed error";
  document.getElementById("leadDek").innerHTML = `
    <div class="error-box">
      <strong>News feed error:</strong> ${escapeHtml(message)}
    </div>
  `;
  document.getElementById("breakingList").innerHTML = `<div class="panel-empty">Unable to load breaking headlines.</div>`;
  document.getElementById("mostReadList").innerHTML = `<div class="panel-empty">Unable to load most-read stories.</div>`;
  document.getElementById("tickerTrack").innerHTML = `<span>Unable to load headlines.</span>`;
  Object.values(sectionEls).forEach((el) => {
    el.innerHTML = `<div class="panel-empty">No stories loaded.</div>`;
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}