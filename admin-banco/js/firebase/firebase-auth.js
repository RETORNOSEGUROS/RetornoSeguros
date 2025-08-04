/*!
 * Firebase Authentication
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

  var _firebase_auth = {};
// Auth internals
var authApps = {};

function _initializeAuth(app) {
  const name = app.name;
  if (authApps[name]) {
    return authApps[name];
  }

  const auth = {
    currentUser: null,
    languageCode: 'pt-BR',
    settings: {},
    app,
    signInWithEmailAndPassword: (email, password) => {
      console.log(`[Auth] Simulando login com: ${email}`);
      return Promise.resolve({ user: { email, uid: "fakeUid123" } });
    },
    signOut: () => {
      console.log("[Auth] Simulando logout");
      return Promise.resolve();
    }
  };

  authApps[name] = auth;
  return auth;
}

function getAuth(app) {
  return _initializeAuth(app || firebase.getApp());
}
function onAuthStateChanged(auth, callback) {
  console.log("[Auth] onAuthStateChanged chamado (simulado)");
  // Simula usuário autenticado imediatamente
  setTimeout(() => {
    callback({ email: "usuario@teste.com", uid: "fakeUid123" });
  }, 500);
}

exports.getAuth = getAuth;
exports.onAuthStateChanged = onAuthStateChanged;

Object.defineProperty(exports, '__esModule', { value: true });
}));
