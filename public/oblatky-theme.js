// Pri návrate z obchodu skontroluj, či administrátor medzičasom nezmenil režim.
window.addEventListener('pageshow', event => {
  if (event.persisted && ['/', '/index.html'].includes(location.pathname)) location.reload();
});
