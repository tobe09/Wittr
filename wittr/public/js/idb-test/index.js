import idb from 'idb';

var logErrorMsg = function (err) {
    debugger
    console.log(err);
};
var txSuccessful = function (info) {
    console.log('Transaction was successful.');
    if (info !== undefined) console.log(info);
};

let oldDbVersion = 2;
let newDbVersion = 3;

var dbPromise = idb.open('test-db', newDbVersion, function (upgradeDb) {
    switch (upgradeDb.oldVersion) {
        case 0:
            var keyValStore = upgradeDb.createObjectStore('keyval');
            keyValStore.put("world", "hello");      //no break to ensure continuation
            upgradeDb.createObjectStore('people', { keyPath: 'name' });
            const peopleStore = upgradeDb.transaction.objectStore('people');
            peopleStore.createIndex('animalIndex', 'favoriteAnimal');
        //case 1:                   not necessary, can be used to track version changes
        //    upgradeDb.createObjectStore('people', { keyPath: 'name' });       
        case oldDbVersion:
            //peopleStore.removeIndex('ageIndex', 'age');       //did not work
            peopleStore.createIndex('age', 'age');              //to pass the necessary test
    }
});

dbPromise.then(db => {
    const tx = db.transaction('keyval');      //a transaction may use multiple object stores
    const keyValStore = tx.objectStore('keyval');
    return keyValStore.get('hello')
}).then(val => {
    console.log('The value for key \'hello\' is: ' + val);
}).catch(logErrorMsg);

dbPromise.then(db => {
    const tx = db.transaction('keyval', 'readwrite');
    const keyValStore = tx.objectStore('keyval');
    keyValStore.put('Tobenna', 'name');
    keyValStore.put('Tiger', 'favoriteAnimal');
    //keyValStore.delete('favouriteAnimal');        //already deleted, not necessary
    return tx.complete;
}).then(() => {
    console.log('Added name and favourite animal to keyval store');
}).catch(logErrorMsg);

dbPromise.then(db => {
    const tx = db.transaction('people', 'readwrite');
    const peopleStore = tx.objectStore('people');
    peopleStore.put({
        name: 'Tom',
        age: 18,
        favoriteAnimal: 'Dog',
        friend: 'Tobenna',
        isSmart: true
    });
    peopleStore.put({
        name: 'Jane',
        age: 26,
        favoriteAnimal: 'Lion',
        friend: 'Tobenna',
        isSmart: true
    });
    peopleStore.put({
        name: 'Amaka',
        age: 21,
        favoriteAnimal: 'Bird',
        friend: 'Tobenna',
        isSmart: true
    });
    peopleStore.put({
        name: 'Ebuka',
        age: 23,
        favoriteAnimal: 'Snake',
        friend: 'Ciroma',
        isSmart: false
    });

    return tx.complete;
}).then(() => {
    txSuccessful('People added.');
    }).catch(logErrorMsg);

dbPromise.then(db => {
    const tx = db.transaction('people', 'readwrite');
    const peopleStore = tx.objectStore('people');
    const animalIndex = peopleStore.index('animalIndex');
    const ageIndex = peopleStore.index('age');

    //return peopleStore.getAll();      //without indexing
    //return animalIndex.getAll('Dog');        //get all dog people, indexed by favourite animal, an index acts as a store
    return ageIndex.getAll();
}).then(people => {
    console.log('People (By Age)', people);
    }).catch(logErrorMsg);

dbPromise.then(db => {
    const tx = db.transaction('people', 'readwrite');
    const peopleStore = tx.objectStore('people');

    //return peopleStore.openCursor();
    return peopleStore.index('age').openCursor();
}).then(cursor => {
    if (!cursor) return;
    return cursor.advance(2);
}).then(function logPeople(cursor) {
    if (!cursor) return
    //cursor.update(newValue);        //to change a value
    //cursor.delete();                    //to remove a value
    console.log('Cursor at', cursor.value.name);
    return cursor.continue().then(logPeople);
    }).then(() => {
    console.log('Done with cursor');
}).catch(logErrorMsg);