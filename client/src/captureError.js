window.addEventListener('error', (event) => {
  console.error("GLOBAL ERROR:", event.error);
  fetch('http://localhost:5173/error-log', { method: 'POST', body: event.error?.stack });
});
