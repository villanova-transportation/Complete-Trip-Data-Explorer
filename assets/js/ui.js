// Top-level view switch
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const view = btn.dataset.view;
    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`.sidebar-panel[data-view="${view}"]`)?.classList.add('active');
  });
});

// Lens switch (Complete Trip only)
document.querySelectorAll('.lens-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lens-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const lens = btn.dataset.lens;
    console.log('Switch lens:', lens);
    // later: update map / filters based on lens
  });
});
