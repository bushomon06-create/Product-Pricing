// اسم ذاكرة التخزين المؤقت)
const CACHE_NAME = 'muthamin-cache-v1';

//  مسارات الملفات التي تريد تخزينها لتعمل بدون إنترنت
const urlsToCache = [
    '/',                 // يمثل الصفحة الرئيسية
    '/index.html',       // ملف الـ HTML الرئيسي
    '/manifest.json',    // ملف الإعدادات
    '/192.png',          // أيقونة التطبيق
    '/512.png',           // أيقونة التطبيق كبيرة الحجم
    '/style.css',
    '/main.js',
    
];

// حدث التثبيت: هنا يقوم المساعد بحفظ الملفات المذكورة في القائمة أعلاه
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('تم فتح التخزين المؤقت وجاري حفظ الملفات');
                return cache.addAll(urlsToCache);
            })
    );
});

// حدث الجلب (Fetch): هنا يتدخل المساعد عند طلب أي صفحة
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // إذا وجد الملف في التخزين المؤقت، يعرضه (حتى لو لم يكن هناك إنترنت)
                if (response) {
                    return response;
                }
                // إذا لم يجده، يطلبه بشكل طبيعي من الإنترنت
                return fetch(event.request);
            })
    );
});