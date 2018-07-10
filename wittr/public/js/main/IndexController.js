import PostsView from './views/Posts';
import ToastsView from './views/Toasts';
import idb from 'idb';

function openDatabase() {
    //if there is no service worker, no need for a database
    if (!navigator.serviceWorker) return Promise.resolve();
    
    let newDbVersion = 1;
    return idb.open('wittr', newDbVersion, upgradeDb => {
        switch (upgradeDb.oldVersion) {
            case 0:
                var wittrStore = upgradeDb.createObjectStore('wittrs', { keyPath: 'id' });
                wittrStore.createIndex('by-date', 'time');
        }
    });
};

export default function IndexController(container) {
    this._container = container;
    this._postsView = new PostsView(this._container);
    this._toastsView = new ToastsView(this._container);
    this._lostConnectionToast = null;

    this._dbPromise = openDatabase();
    this._registerServiceWorker();

    this._showCachedMessages().then(() => this._openSocket());

    this._cleanImageCache();
    setInterval(() => this._cleanImageCache(), 1000 * 60 * 5);
    //setInterval(this._cleanImageCache, 1000 * 10);        //same as above
}

//register service worker
IndexController.prototype._registerServiceWorker = function () {
    if (!navigator.serviceWorker) return;

    let indexController = this;     //not necessary because of arrow functions, feels safer

    IndexController.prototype._updateReady = function (worker) {
        var toasts = this._toastsView.show('New version Available', { buttons: ['refresh', 'dismiss'] });

        toasts.answer.then(answer => {
            if (answer != 'refresh') return;
            worker.postMessage({ 'key': 'skipWaiting' });
        });
    }

    IndexController.prototype._trackInstalling = function (worker) {
        worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
                indexController._updateReady(worker);
            }
        });
    }

    navigator.serviceWorker.register('/sw.js').then(reg => {
        if (!navigator.serviceWorker.controller) return     //not loaded via a new service worker

        if (reg.waiting) {
            indexController._updateReady(reg.waiting);
        }

        if (reg.installing) {
            indexController._trackInstalling(reg.installing);
        }

        reg.addEventListener('updatefound', () => {
            indexController._trackInstalling(reg.installing);
            return;
        });

        console.log('Registration successful');

    }).catch(() => {
        console.log('Registration failed');
    });
    
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload(true);
        return;
    });

    //reg.unregister(), reg.update() (methoda). reg.installing, reg.waiting, reg.active, reg.installed, reg.redundant(superceded or install fail)
    //(either service worker instances or null, .state shows their state).
    //reg.addEventListener(name,function): name: 'update found'- reg.installing has changed, 'statechange'- service worker state has changed
    //if(!navigator.serviceWorker.controller) didnt load using service worker

    //reg.addEventListener('updatefound', () => {
    //    reg.installing.addEventListener('statechange', () => {
    //        if (this.state === 'installed') {
    //            //there is an update ready
    //        }
    //    });
    //});
}

IndexController.prototype._showCachedMessages = function () {
    return this._dbPromise.then(db => {
        //if posts are already being shown, no need to get from db
        if (!db || this._postsView.showingPosts()) return;

        const tx = db.transaction('wittrs', 'readwrite');
        const wittrStore = tx.objectStore('wittrs');
        const dateIndex = wittrStore.index('by-date');

        return dateIndex.getAll().then(messages => {
            //messages.reverse() will give the same eventual value as newMessages
            let newMessages = [];
            for (let i = messages.length - 1; i >= 0; i--) {
                newMessages.push(messages[i]);
            }
            this._postsView.addPosts(newMessages);
        });
    });
};

IndexController.prototype._cleanImageCache = function () {
    return this._dbPromise.then(db => {
        if (!db) return;

        const tx = db.transaction('wittrs', 'readwrite');
        const wittrStore = tx.objectStore('wittrs');

        wittrStore.getAll().then(messages => {
            let photos = [];
            for (const message of messages) {
                if (message.photo) photos.push(message.photo);
                photos.push(message.avatar);
            }

            caches.open('wittr-content-imgs').then(cache => {
                cache.keys().then(keys => {
                    for (const key of keys) {
                        if (photos.filter(photo => new URL(key.url).pathname == photo).length == 0) {
                            //if (photos.filter(photo => key.url.endsWith(photo)).length == 0)      //also works
                            //if(!photos.includes(new URL(key.url).pathname))     //also works
                            cache.delete(key.url);
                        }
                    }
                });
            });
        });
    });
}

// open a connection to the server for live updates
IndexController.prototype._openSocket = function() {
  var indexController = this;
  var latestPostDate = this._postsView.getLatestPostDate();

  // create a url pointing to /updates with the ws protocol
  var socketUrl = new URL('/updates', window.location);
  socketUrl.protocol = 'ws';

  if (latestPostDate) {
    socketUrl.search = 'since=' + latestPostDate.valueOf();
  }

  // this is a little hack for the settings page's tests,
  // it isn't needed for Wittr
  socketUrl.search += '&' + location.search.slice(1);

  var ws = new WebSocket(socketUrl.href);

  // add listeners
  ws.addEventListener('open', function() {
    if (indexController._lostConnectionToast) {
      indexController._lostConnectionToast.hide();
    }
  });

  ws.addEventListener('message', function(event) {
    requestAnimationFrame(function() {
      indexController._onSocketMessage(event.data);
    });
  });

  ws.addEventListener('close', function() {
    // tell the user
    if (!indexController._lostConnectionToast) {
      indexController._lostConnectionToast = indexController._toastsView.show("Unable to connect. Retrying…");
    }

    // try and reconnect in 5 seconds
    setTimeout(function() {
      indexController._openSocket();
    }, 5000);
  });
};

// called when the web socket sends message data
IndexController.prototype._onSocketMessage = function(data) {
    var messages = JSON.parse(data);

    this._dbPromise.then(db => {
        if (!db) return;
        
        const tx = db.transaction('wittrs', 'readwrite');
        const wittrStore = tx.objectStore('wittrs');
        //messages.forEach(message => { });     //also works
        for (const message of messages) {
            wittrStore.put(message);
        }
        wittrStore.index('by-date').openCursor(null, 'prev').then(cursor => {
            if (!cursor) return;
            return cursor.advance(30);
        }).then(function deleteExtras(cursor) {
            if (!cursor) return;
            cursor.delete();
            cursor.continue().then(deleteExtras);
        })
    }).catch(err => {
        console.log(err);
    });

    this._postsView.addPosts(messages);
};