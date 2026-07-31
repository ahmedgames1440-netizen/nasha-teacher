// خدمة العمل بدون إنترنت — تطبيق المعلم
// يخزّن ملفات التطبيق فقط. بيانات المعلم تبقى في جهازه (localStorage) ولا تُخزَّن هنا.
const CACHE = "nasha-teacher-v4";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                       // لا نتدخل في الإرسال إلى الخادم
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;             // طلبات الخادم تمر مباشرة

  // الشبكة أولاً ثم الذاكرة، حتى يحصل المعلم على أحدث نسخة عند توفر الإنترنت
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
