/**
 * News ingestion layer for live intelligence gathering.
 * Sources:
 *   1. Times of Israel (RSS)
 *   2. Jerusalem Post (RSS)
 *   3. ISW/CTP Iran Updates (WordPress REST API — full expert analysis)
 */

export interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
  /** Full article text — only populated for ISW articles */
  fullText?: string;
}

interface RssFeed {
  name: string;
  url: string;
  keywords?: string[];
}

const RSS_FEEDS: RssFeed[] = [
  {
    name: "Times of Israel",
    url: "https://www.timesofisrael.com/feed/",
    keywords: ["iran", "hezbollah", "hizballah", "missile", "rocket", "strike", "idf", "irgc", "hormuz", "centcom", "ceasefire", "escalat", "nuclear", "drone", "intercept", "shelter", "siren", "houthi", "lebanon", "tehran", "trump", "diplomat"],
  },
  {
    name: "Jerusalem Post",
    url: "https://www.jpost.com/rss/rssfeedsfrontpage.aspx",
    keywords: ["iran", "hezbollah", "hizballah", "missile", "rocket", "strike", "idf", "irgc", "hormuz", "centcom", "ceasefire", "escalat", "nuclear", "drone", "intercept", "shelter", "siren", "houthi", "lebanon", "tehran", "trump", "diplomat"],
  },
];

const ISW_API = "https://understandingwar.org/wp-json/wp/v2/posts";
const USER_AGENT = "GeoPolForecaster/1.0 (conflict analysis research tool)";

// ─── RSS Parsing ───

function parseRss(xml: string, sourceName: string): NewsArticle[] {
  const articles: NewsArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = extractTag(item, "title");
    const link = extractTag(item, "link");
    const pubDate = extractTag(item, "pubDate");
    const description = stripHtml(extractTag(item, "description"));

    if (title && link) {
      articles.push({ title, link, pubDate: pubDate || "", description: description || "", source: sourceName });
    }
  }
  return articles;
}

function extractTag(xml: string, tag: string): string {
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const plainRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const plainMatch = xml.match(plainRegex);
  if (plainMatch) return plainMatch[1].trim();

  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function filterByKeywords(articles: NewsArticle[], keywords: string[]): NewsArticle[] {
  if (keywords.length === 0) return articles;
  const lower = keywords.map((k) => k.toLowerCase());
  return articles.filter((a) => {
    const text = `${a.title} ${a.description}`.toLowerCase();
    return lower.some((kw) => text.includes(kw));
  });
}

function filterByAge(articles: NewsArticle[], maxAgeHours: number): NewsArticle[] {
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  return articles.filter((a) => {
    if (!a.pubDate) return true;
    const t = new Date(a.pubDate).getTime();
    return !isNaN(t) && t >= cutoff;
  });
}

// ─── ISW WordPress API ───

interface WpPost {
  title: { rendered: string };
  date: string;
  link: string;
  content: { rendered: string };
  excerpt: { rendered: string };
}

async function fetchIswUpdates(maxPosts = 3): Promise<NewsArticle[]> {
  const url = `${ISW_API}?per_page=${maxPosts}&search=iran+update&_fields=title,date,link,content,excerpt`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ISW API: HTTP ${res.status}`);
  const posts: WpPost[] = await res.json();

  return posts.map((p) => ({
    title: stripHtml(p.title.rendered),
    link: p.link,
    pubDate: new Date(p.date).toUTCString(),
    description: stripHtml(p.excerpt.rendered).slice(0, 500),
    source: "ISW/CTP",
    fullText: stripHtml(p.content.rendered),
  }));
}

// ─── Public API ───

export interface NewsBrief {
  articles: NewsArticle[];
  iswReports: NewsArticle[];
  brief: string;
  iswBrief: string;
}

/**
 * Fetch all news sources in parallel. Returns:
 * - articles: RSS headlines (Times of Israel, JPost)
 * - iswReports: Full ISW/CTP Iran Update articles
 * - brief: Formatted headline digest
 * - iswBrief: Formatted ISW expert analysis
 */
export async function fetchAllNews(maxAgeHours = 48): Promise<NewsBrief> {
  const [rssResults, iswResult] = await Promise.allSettled([
    fetchRssFeeds(maxAgeHours),
    fetchIswUpdates(3),
  ]);

  const articles = rssResults.status === "fulfilled" ? rssResults.value.articles : [];
  const rssErrors = rssResults.status === "fulfilled" ? rssResults.value.errors : [rssResults.reason?.toString()];
  const iswReports = iswResult.status === "fulfilled" ? iswResult.value : [];
  const iswErrors = iswResult.status === "rejected" ? [iswResult.reason?.toString()] : [];

  const brief = formatHeadlineBrief(articles, rssErrors);
  const iswBrief = formatIswBrief(iswReports, iswErrors);

  return { articles, iswReports, brief, iswBrief };
}

async function fetchRssFeeds(maxAgeHours: number): Promise<{ articles: NewsArticle[]; errors: string[] }> {
  const allArticles: NewsArticle[] = [];
  const errors: string[] = [];

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`${feed.name}: HTTP ${res.status}`);
      const xml = await res.text();
      let articles = parseRss(xml, feed.name);
      if (feed.keywords) articles = filterByKeywords(articles, feed.keywords);
      articles = filterByAge(articles, maxAgeHours);
      return articles;
    })
  );

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "fulfilled") {
      allArticles.push(...(results[i] as PromiseFulfilledResult<NewsArticle[]>).value);
    } else {
      errors.push(`${RSS_FEEDS[i].name}: ${(results[i] as PromiseRejectedResult).reason}`);
    }
  }

  // Sort newest first, deduplicate
  allArticles.sort((a, b) => (new Date(b.pubDate).getTime() || 0) - (new Date(a.pubDate).getTime() || 0));
  const seen = new Set<string>();
  const deduped = allArticles.filter((a) => {
    const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { articles: deduped, errors };
}

// ─── Formatters ───

function formatHeadlineBrief(articles: NewsArticle[], errors: string[]): string {
  if (articles.length === 0) {
    return "No conflict-relevant news articles found in RSS feeds." +
      (errors.length > 0 ? `\nFeed errors: ${errors.join("; ")}` : "");
  }

  const lines = [
    `## NEWS HEADLINES (${articles.length} conflict-relevant articles)`,
    `*Sources: ${[...new Set(articles.map((a) => a.source))].join(", ")}*`,
    `*Fetched: ${new Date().toUTCString()}*`,
    "",
  ];

  for (const a of articles) {
    const time = a.pubDate
      ? new Date(a.pubDate).toISOString().slice(0, 16).replace("T", " ") + " UTC"
      : "Unknown time";
    lines.push(`- **${a.title}** (${time}, ${a.source})`);
    if (a.description) lines.push(`  ${a.description.slice(0, 300)}`);
  }

  if (errors.length > 0) {
    lines.push("", `*Feed errors: ${errors.join("; ")}*`);
  }

  return lines.join("\n");
}

function formatIswBrief(reports: NewsArticle[], errors: string[]): string {
  if (reports.length === 0) {
    return "No ISW/CTP Iran Updates available." +
      (errors.length > 0 ? `\nErrors: ${errors.join("; ")}` : "");
  }

  const lines = [
    `## ISW/CTP EXPERT ANALYSIS`,
    `*Institute for the Study of War & Critical Threats Project*`,
    `*${reports.length} recent Iran Update(s)*`,
    "",
  ];

  for (const r of reports) {
    const time = r.pubDate
      ? new Date(r.pubDate).toISOString().slice(0, 16).replace("T", " ") + " UTC"
      : "Unknown date";
    lines.push(`### ${r.title}`);
    lines.push(`*Published: ${time}*`);
    lines.push(`*Source: ${r.link}*`);
    lines.push("");
    // Include full text but cap at ~15k chars per report to stay within context limits
    if (r.fullText) {
      const text = r.fullText.length > 15_000
        ? r.fullText.slice(0, 15_000) + "\n\n[... truncated for length ...]"
        : r.fullText;
      lines.push(text);
    }
    lines.push("");
  }

  if (errors.length > 0) {
    lines.push(`*Errors: ${errors.join("; ")}*`);
  }

  return lines.join("\n");
}
