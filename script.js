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
  startWorldClocks();
  await loadWeather();
  await refreshAll();

  setInterval(loadWeather, 60 * 60 * 1000);
  setInterval(refreshAll, 15 * 60 * 1000);
}

async function fetchNews() {

  const res = await fetch("/api/news", {
    method: "GET",
    cache: "no-store"
  });

  const text = await res.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid response from news server.");
  }

  if (!res.ok) {
    throw new Error(data.message || "News request failed.");
  }

  if (data.status !== "success") {
    throw new Error(data.message || "News API error.");
  }

  const items = Array.isArray(data.results) ? data.results : [];

  return normalizeArticles(items);
}

async function refreshAll() {

  try {

    const articles = await fetchNews();

    state.articles = articles;

    renderLeadStory(articles);
    renderSidebarLists(articles);
    renderTicker(articles);
    renderSections(articles);

    updateLastRefresh();

  } catch (error) {

    renderError(error);
    updateLastRefresh(true);

  }

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

      if (seen.has(item.url)) return false;

      seen.add(item.url);

      return true;

    });

}

function renderLeadStory(articles) {

  const lead = articles[0];

  if (!lead) return;

  document.getElementById("leadLink").textContent = lead.title;
  document.getElementById("leadLink").href = lead.url;

  document.getElementById("leadImage").src = lead.image;
  document.getElementById("leadImage").alt = lead.title;

  document.getElementById("leadDek").textContent =
    lead.description || "Open the original article for the full story.";

  document.getElementById("leadMeta").textContent =
    lead.source + " • " + relativeTime(lead.published);

}

function renderSidebarLists(articles) {

  const breaking = articles.slice(0, 4);
  const mostRead = articles.slice(4, 8);

  document.getElementById("breakingList").innerHTML =
    breaking.map(a => sidebarItem(a)).join("");

  document.getElementById("mostReadList").innerHTML =
    mostRead.map((a,i)=> sidebarItem(a,i+1)).join("");

}

function renderTicker(articles) {

  const items = articles.slice(0,8);

  document.getElementById("tickerTrack").innerHTML =
    items.map(a => `
      <span class="ticker-item">
        <a href="${escapeHtml(a.url)}" target="_blank">${escapeHtml(a.title)}</a>
      </span>
    `).join("");

}

function renderSections(articles) {

  const sections = {
    us: articles.filter(a=>a.section==="us").slice(0,4),
    world: articles.filter(a=>a.section==="world").slice(0,4),
    business: articles.filter(a=>a.section==="business").slice(0,3),
    politics: articles.filter(a=>a.section==="politics").slice(0,4),
    tech: articles.filter(a=>a.section==="tech").slice(0,4)
  };

  Object.entries(sections).forEach(([key,list])=>{

    sectionEls[key].innerHTML =
      list.map(a=>storyCard(a)).join("");

  });

}

async function loadWeather() {

  try {

    const res = await fetch(WEATHER_URL);

    const data = await res.json();

    const temp = data.current_weather?.temperature;

    document.getElementById("weatherCurrentTemp").textContent =
      temp ? Math.round(temp)+"°F" : "--°F";

  } catch {

    document.getElementById("weatherNowLine").textContent =
      "Weather unavailable";

  }

}

function startWorldClocks() {

  updateWorldClocks();

  setInterval(updateWorldClocks,1000);

}

function updateWorldClocks() {

  const now = new Date();

  document.getElementById("manilaTime").textContent =
    new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Manila",hour:"numeric",minute:"2-digit",second:"2-digit"}).format(now);

  document.getElementById("swedenTime").textContent =
    new Intl.DateTimeFormat("en-US",{timeZone:"Europe/Stockholm",hour:"numeric",minute:"2-digit",second:"2-digit"}).format(now);

}

function sidebarItem(article,number=null){

return `
<div class="panel-item">
<a href="${escapeHtml(article.url)}" target="_blank">
${number?number+". ":""}${escapeHtml(article.title)}
</a>
</div>
`;

}

function storyCard(article){

return `
<article class="story-card">
<img class="story-image" src="${escapeHtml(article.image)}">
<h4 class="story-title">
<a href="${escapeHtml(article.url)}" target="_blank">
${escapeHtml(article.title)}
</a>
</h4>
</article>
`;

}

function relativeTime(date){

if(!date) return "Recently";

const then = new Date(date);

const diff = Date.now() - then.getTime();

const mins = Math.floor(diff/60000);

if(mins<60) return mins+" min ago";

const hrs = Math.floor(diff/3600000);

if(hrs<24) return hrs+" hr ago";

return Math.floor(diff/86400000)+" days ago";

}

function guessSection(title,desc,source){

const t = (title+" "+desc+" "+source).toLowerCase();

if(/stock|market|dow|nasdaq|economy/.test(t)) return "business";
if(/election|senate|white house|policy/.test(t)) return "politics";
if(/ai|tech|software|science/.test(t)) return "tech";
if(/iran|china|russia|ukraine|world/.test(t)) return "world";

return "us";

}

function domainName(url){

try{
return new URL(url).hostname.replace("www.","");
}catch{
return "Source";
}

}

function updateLastRefresh(error=false){

const stamp = new Date().toLocaleString();

document.getElementById("lastRefresh").textContent =
error ? stamp+" (error)" : stamp;

}

function renderError(error){

document.getElementById("leadLink").textContent =
"Unable to load headline";

document.getElementById("leadDek").innerHTML =
"<div class='error-box'>News error: "+escapeHtml(error.message)+"</div>";

}

function escapeHtml(str){

return String(str)
.replaceAll("&","&amp;")
.replaceAll("<","&lt;")
.replaceAll(">","&gt;")
.replaceAll('"',"&quot;")
.replaceAll("'","&#39;");
