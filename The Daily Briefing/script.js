document.querySelectorAll('a[target="_blank"]').forEach(link => {
  link.setAttribute('rel', 'noopener noreferrer');
});

const subscribeButtons = document.querySelectorAll('.subscribe-form button, .top-actions button');

subscribeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    alert('Subscribe form placeholder. Hook this up later if you want email signup.');
  });
});