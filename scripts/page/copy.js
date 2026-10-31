// The copy buttons on the page (#9). Progressive enhancement: without this
// script the addresses are still plain text a reader can select.
for (const button of document.querySelectorAll('.copy')) {
  button.addEventListener('click', () => {
    const text = button.getAttribute('data-copy') ?? '';
    navigator.clipboard
      .writeText(text)
      .then(() => {
        button.textContent = 'Copied';
        button.setAttribute('data-copied', '');
        setTimeout(() => {
          button.textContent = 'Copy';
          button.removeAttribute('data-copied');
        }, 1500);
      })
      .catch((error) => {
        console.error('copy failed', error);
        button.textContent = 'Select it';
      });
  });
}
