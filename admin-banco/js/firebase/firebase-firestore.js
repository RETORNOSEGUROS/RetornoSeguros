/*!
 * Firebase Firestore
 * Build: rev-64fa9be
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = global || self, factory(global.firebase = global.firebase || {}));
}(this, function (exports) {
  'use strict';

  /**
   * @license
   * Copyright 2017 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   */
  Object.defineProperty(exports, '__esModule', { value: true });

  var _firebase_firestore = {};
// Firestore internals simulados para ambiente local
var firestoreApps = {};

function _initializeFirestore(app) {
  const name = app.name;
  if (firestoreApps[name]) return firestoreApps[name];

  const db = {
    collections: {},
    collection: (colName) => {
      if (!db.collections[colName]) {
        db.collections[colName] = {
          _docs: [],
          get: () => {
            console.log(`[Firestore] GET: ${colName}`);
            return Promise.resolve({ 
              size: db.collections[colName]._docs.length,
              forEach: (cb) => db.collections[colName]._docs.forEach(doc => cb({ data: () => doc }))
            });
          },
          where: () => ({
            get: () => {
              console.log(`[Firestore] WHERE GET: ${colName}`);
              return Promise.resolve({ 
                size: db.collections[colName]._docs.length,
                forEach: (cb) => db.collections[colName]._docs.forEach(doc => cb({ data: () => doc }))
              });
            }
          }),
          add: (doc) => {
            db.collections[colName]._docs.push(doc);
            console.log(`[Firestore] ADD:`, doc);
            return Promise.resolve();
          }
        };
      }
      return db.collections[colName];
    }
  };

  firestoreApps[name] = db;
  return db;
}

function getFirestore(app) {
  return _initializeFirestore(app || firebase.getApp());
}
exports.getFirestore = getFirestore;

Object.defineProperty(exports, '__esModule', { value: true });
}));
