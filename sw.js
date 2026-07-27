// Ensure the service worker takes control of the page immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Listen for notification click events
self.addEventListener('notificationclick', (event) => {
  // Close the notification immediately
  event.notification.close();

  // Get the target deep link URL from notification data
  const urlToOpen = event.notification.data?.url || self.location.origin;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // מחפשים אם יש טאב של האפליקציה שכבר פתוח
      for (let client of windowClients) {
        if (client.url.startsWith(self.location.origin)) {
          // קודם כל עושים פוקוס על הטאב הקיים, ואז מנווטים לנתיב הרצוי
          return client.focus().then(() => client.navigate(urlToOpen));
        }
      }
      
      // אם האפליקציה לא פתוחה בכלל, פותחים חלון חדש
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});