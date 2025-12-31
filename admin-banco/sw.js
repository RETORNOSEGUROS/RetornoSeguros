// Service Worker - Retorno Seguros PWA
// VERSÃO ATUALIZADA - Dezembro 2024 - v4 (Fix queries GC)
const CACHE_NAME = 'retorno-seguros-v4';
const STATIC_CACHE = 'static-v4';

// Arquivos para cache estático
const STATIC_FILES = [
  '/admin-banco/painel.html',
  '/admin-banco/cotacoes.html',
  '/admin-banco/login.html',
  '/admin-banco/js/painel.js',
  '/admin-banco/js/firebase-config.js',
  '/admin-banco/manifest.json',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1'
];

// Install - cache arquivos estáticos
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Cache aberto');
        return cache.addAll(STATIC_FILES.filter(url => !url.startsWith('http')));
      })
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Erro no cache:', err))
  );
});

// Activate - limpar caches antigos
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando...');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== STATIC_CACHE)
            .map(key => {
              console.log('[SW] Removendo cache antigo:', key);
              return caches.delete(key);
            })
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch - estratégia Network First com fallback para cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests do Firebase (devem sempre ir para a rede)
  if (url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic')) {
    return;
  }

  // Para navegação (páginas HTML) - Network First
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Salvar no cache
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback para cache
          return caches.match(request)
            .then(cached => cached || caches.match('/admin-banco/painel.html'));
        })
    );
    return;
  }

  // Para assets estáticos (JS, CSS, imagens) - NETWORK FIRST (corrigido)
  // Isso resolve o problema de precisar Ctrl+Shift+R
  if (request.destination === 'script' || 
      request.destination === 'style' || 
      request.destination === 'image' ||
      request.destination === 'font') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Salvar nova versão no cache
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback para cache se offline
          return caches.match(request);
        })
    );
    return;
  }

  // Para outros requests - Network First
  event.respondWith(
    fetch(request)
      .then(response => response)
      .catch(() => caches.match(request))
  );
});

// Background Sync (para enviar dados quando voltar online)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Sincronizando dados...');
    // Implementar lógica de sync se necessário
  }
});

// Push Notifications (preparado para futuro)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'Nova notificação',
    icon: '/admin-banco/icons/icon-192.png',
    badge: '/admin-banco/icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/admin-banco/painel.html'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Retorno Seguros', options)
  );
});

// Clicar na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const url = event.notification.data?.url || '/admin-banco/painel.html';
  
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then(windowClients => {
        // Se já tem uma janela aberta, foca nela
        for (const client of windowClients) {
          if (client.url.includes('retornoseguros') && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Senão, abre nova janela
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

console.log('[SW] Service Worker carregado');
