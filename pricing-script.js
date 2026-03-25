const socket = io();

// Load pricing data on page load
loadPricingData();

// Real-time listener
socket.on('pricing-updated', () => {
  console.log('Pricing updated, reloading...');
  loadPricingData();
});

async function loadPricingData() {
  try {
    const res = await fetch('/api/pricing');
    const data = await res.json();
    
    if (data) {
      // Update hero section
      document.getElementById('pricing-title').textContent = data.hero_title || 'Our Pricing Plans';
      document.getElementById('pricing-subtitle').textContent = data.hero_subtitle || 'Choose the perfect package for your special day';
      
      // Update intro section
      document.getElementById('intro-heading').textContent = data.intro_heading || 'Investment in Memories';
      document.getElementById('intro-text').innerHTML = data.intro_text || '<p>Your wedding day is one of the most important days of your life.</p>';
      
      // Update details section
      document.getElementById('details-heading').textContent = data.details_heading || "What's Included";
      document.getElementById('details-text').innerHTML = data.details_text || '<ul><li>Full day coverage</li></ul>';
      
      // Update note section
      document.getElementById('note-heading').textContent = data.note_heading || 'Custom Packages';
      document.getElementById('note-text').innerHTML = data.note_text || '<p>Contact us for custom packages.</p>';
      
      // Update image
      if (data.image_url) {
        document.getElementById('pricing-image').src = data.image_url;
      }
      
      // Update PDF link
      if (data.pdf_url) {
        document.getElementById('pdf-download-link').href = data.pdf_url;
        document.getElementById('pdf-download-link').style.display = 'inline-flex';
        document.getElementById('pdf-no-file').style.display = 'none';
      } else {
        document.getElementById('pdf-download-link').style.display = 'none';
        document.getElementById('pdf-no-file').style.display = 'block';
      }
    }
  } catch (err) {
    console.error('Error loading pricing data:', err);
  }
}

// Mobile Menu Toggle
function toggleMobileMenu() {
  const btn = document.querySelector('.mobile-menu-btn');
  const menu = document.getElementById('nav-menu');
  if (!btn || !menu) return;
  btn.classList.toggle('active');
  menu.classList.toggle('active');
}

document.querySelectorAll('.nav-menu a').forEach(link => {
  link.addEventListener('click', () => {
    const btn = document.querySelector('.mobile-menu-btn');
    const menu = document.getElementById('nav-menu');
    if (btn && menu) {
      btn.classList.remove('active');
      menu.classList.remove('active');
    }
  });
});

document.addEventListener('click', (e) => {
  const navbar = document.querySelector('.navbar');
  const btn = document.querySelector('.mobile-menu-btn');
  const menu = document.getElementById('nav-menu');
  if (navbar && !navbar.contains(e.target) && menu && menu.classList.contains('active')) {
    btn.classList.remove('active');
    menu.classList.remove('active');
  }
});
