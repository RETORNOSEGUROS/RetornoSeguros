/*!
 * Firebase v8.10.1
 * Build: rev-64fa9be
 */
(function(global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = global || self, factory(global.firebase = global.firebase || {}));
}(this, function(exports) {
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

  var _firebase_app = {};
  // Initialize Firebase app object
var apps = {};
var appHooks = {};

function initializeApp(config, name) {
  if (typeof config !== 'object' || config === null) {
    throw new Error("Firebase: Invalid FirebaseApp configuration object.");
  }

  var appName = name || '[DEFAULT]';

  if (apps[appName]) {
    throw new Error("Firebase: Firebase App named '" + appName + "' already exists.");
  }

  var app = {
    name: appName,
    options: config,
    automaticDataCollectionEnabled: false,
    _deleted: false,
    _addComponent: function() {},
    _addOrOverwriteComponent: function() {},
    _removeServiceInstance: function() {},
    _getService: function() {},
    _getProvider: function() {}
  };

  apps[appName] = app;

  return app;
}

function getApp(name) {
  name = name || '[DEFAULT]';
  var app = apps[name];

  if (!app) {
    throw new Error("Firebase: No Firebase App '" + name + "' has been created - call initializeApp()");
  }

  return app;
}

function getApps() {
  return Object.keys(apps).map(function(name) {
    return apps[name];
  });
}
function deleteApp(app) {
  var name = app.name;
  if (!apps[name]) {
    throw new Error("Firebase: Firebase App named '" + name + "' does not exist.");
  }

  delete apps[name];
  app._deleted = true;
}

exports.initializeApp = initializeApp;
exports.getApp = getApp;
exports.getApps = getApps;
exports.deleteApp = deleteApp;

Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=firebase-app.js.map

