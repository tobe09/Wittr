//start command: npm run serve
const newCache = 'wittr-static-v4';
//let oldCache = 'wittr-static-v1';         //old way
const imgCache = 'wittr-content-imgs';
const allCaches = [newCache, imgCache];

self.addEventListener('install', event => {
    const urlToCache = [
        '/skeleton',
        'js/main.js',
        'css/main.css',
        'imgs/icon.png',
        'https://fonts.gstatic.com/s/roboto/v15/2UX7WLTfW3W8TclTUvlFyQ.woff',
        'https://fonts.gstatic.com/s/roboto/v15/d-6IYplOFocCacKzxwXSOD8E0i7KZn-EPnyo3HZu7kw.woff'
    ];

    event.waitUntil(
        caches.open(newCache).then(cache => {
            //cache.put(request, response);
            //cache.match(request);
            return cache.addAll(urlToCache);
        })
    );
})

self.addEventListener('activate', event => {
    event.waitUntil(
        //caches.delete(oldCache) inefficient,does not consider other similar caches
        caches.keys().then(cacheNames => {
            return Promise.all(             //can simply return the promise
                cacheNames
                    .filter(cacheName => cacheName.startsWith('wittr') && !allCaches.includes(cacheName))
                    .map(cacheToDelete => caches.delete(cacheToDelete))
            )
        })
    );
});

self.addEventListener('fetch', (event) => {
    //console.log('Hello');

    //new Response('Hello <strong class="a-winner-is-me">World</strong>', {  
    //    headers: {
    //        'Content-Type': 'text/html', foo: 'bar'
    //    }
    //});
    
    let requestUrl = new URL(event.request.url);
    //on the unlikely chance that the service worker serves more than one origin
    if (requestUrl.origin === location.origin) {
        if (requestUrl.pathname === '/') {
            event.respondWith(caches.match('/skeleton'));
            return;
        }
        else if (requestUrl.pathname.startsWith('/photos/')) {
            event.respondWith(servePhoto(event.request));
            return;
        }
        else if (requestUrl.pathname.startsWith('/avatars/')) {
            event.respondWith(serveAvatar(event.request));
            return;
        }
    }

    event.respondWith(
        caches.open(newCache).then(cache => {
            return cache.match(event.request).then(response => {
                if (response) return response;
                else return fetch(event.request);
                //return response || fetch(event.request);
            })
        })
        //caches.match(event.request).then(response => {        //alternative
        //    debugger
        //    if (response) return response;
        //    else return fetch(event.request);
        //});

        //    fetch(event.request.url).then((response) => {
        //        if (response.status === 404)
        //            return fetch('/imgs/dr-evil.gif');
        //        else
        //            return response;
        //    }).catch((err) => {
        //        console.log(err.message);
        //        console.log(err.stackTrace);
        //        return new Response("An error has occured");
        //    });
    );
})

function servePhoto(request) {
    var storageUrl = request.url.replace(/-\d+px\.jpg$/, '');       //save one version of images using regex

    return caches.open(imgCache).then(cache => {
        return cache.match(storageUrl).then(response => {
            if (response) return response;
            else return fetch(request).then(newResponse => {
                cache.put(storageUrl, newResponse.clone())
                return newResponse;
            });
        });
    });
};

function serveAvatar(request) {
    var storageUrl = request.url.replace(/-\dx\.jpg$/, '');       //save one version of avatars using regex

    //return caches.open(imgCache).then(cache => {              //also correct
    //    return cache.match(storageUrl).then(response => {
    //        if (response) {
    //            fetch(request).then(networkResponse => cache.put(storageUrl, networkResponse));
    //            return response;
    //        }
    //        else return fetch(request).then(networkResponse => {
    //            cache.put(storageUrl, networkResponse.clone())
    //            return networkResponse;
    //        });
    //    });
    //});

    return caches.open(imgCache).then(cache => {
        return cache.match(storageUrl).then(response => {
            const networkResponse = fetch(request).then(networkResponse => {
                cache.put(storageUrl, networkResponse.clone())
                return networkResponse;
            });

            return response || networkResponse;
        });
    });
}

self.addEventListener('message', event => {
    if (event.data.key == 'skipWaiting') self.skipWaiting();
})