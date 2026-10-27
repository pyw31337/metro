const target = process.argv[2] || "https://metro-live-kr.web.app";

async function check(url, expectedStatus = 200) {
  const response = await fetch(url, { redirect: "follow" });
  const body = await response.text();
  return {
    url,
    status: response.status,
    ok: response.status === expectedStatus,
    contentType: response.headers.get("content-type") || "",
    body,
  };
}

const root = await check(target);
const manifest = await check(`${target}/manifest.json`);
const version = await check(`${target}/version.json`);
const sw = await check(`${target}/sw.js`);
const icon = await check(`${target}/icon-192.png`);
const realtime = await check(`${target}/api/realtime/subway/alerts`, 200);

const hardFailures = [];

if (!root.ok) hardFailures.push(`root ${root.status}`);
if (!manifest.ok || !manifest.contentType.includes("application/json")) {
  hardFailures.push(`manifest ${manifest.status} ${manifest.contentType}`);
}
if (!version.ok || !version.contentType.includes("application/json")) {
  hardFailures.push(`version ${version.status} ${version.contentType}`);
}
if (!version.body.includes("buildVersion")) {
  hardFailures.push("version buildVersion missing");
}
if (!sw.ok || !sw.contentType.includes("javascript")) {
  hardFailures.push(`sw ${sw.status} ${sw.contentType}`);
}
if (!icon.ok || !icon.contentType.includes("image/png")) {
  hardFailures.push(`icon ${icon.status} ${icon.contentType}`);
}
if (!root.body.includes('href="/manifest.json"')) {
  hardFailures.push("root manifest link mismatch");
}
if (!root.body.includes("navigator.serviceWorker.register('/sw.js')")) {
  hardFailures.push("service worker registration path mismatch");
}

console.log(`[site] ${target}`);
console.log(`[root] ${root.status}`);
console.log(`[manifest] ${manifest.status} ${manifest.contentType}`);
console.log(`[version] ${version.status} ${version.contentType}`);
console.log(`[sw] ${sw.status} ${sw.contentType}`);
console.log(`[icon] ${icon.status} ${icon.contentType}`);

if (realtime.ok) {
  console.log(`[realtime] ${realtime.status} internal proxy live`);
} else {
  console.log(`[realtime] ${realtime.status} internal proxy unavailable, fallback path expected`);
}

if (hardFailures.length > 0) {
  console.error("Deployment verification failed:");
  hardFailures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
