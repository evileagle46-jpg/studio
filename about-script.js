const socket = (typeof io !== "undefined") ? io() : { on: () => {}, emit: () => {}, disconnect: () => {} };

// Load all about page data
loadAboutData();

// Real-time listener
socket.on('about-updated', () => {
  console.log('About page updated, reloading...');
  loadAboutData();
});

async function loadAboutData() {
  await Promise.all([
    loadEquipment(),
    loadBTSImages(),
    loadBTSVideos()
  ]);
  
  // Initialize counter animation after data loads
  initCounterAnimation();
}

// Load equipment items
let allEquipment = [];
let currentEquipmentPage = 0;
const itemsPerPage = 8; // 2 rows × 4 columns

async function loadEquipment() {
  try {
    const res = await fetch('/api/equipment');
    allEquipment = await res.json();
    
    const grid = document.getElementById('equipment-grid');
    
    if (allEquipment && allEquipment.length > 0) {
      renderEquipmentPage();
      setupEquipmentSlider();
    } else {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="empty-state-icon">📷</div>
          <p>No equipment added yet. Add equipment via admin panel.</p>
        </div>
      `;
    }
  } catch (err) {
    console.error('Error loading equipment:', err);
  }
}

function renderEquipmentPage() {
  const grid = document.getElementById('equipment-grid');
  const start = currentEquipmentPage * itemsPerPage;
  const end = start + itemsPerPage;
  const pageItems = allEquipment.slice(start, end);
  
  grid.innerHTML = pageItems.map((item, index) => `
    <div class="equipment-card" style="--index: ${index}">
      <div class="equipment-image">
        <img src="${item.image_url || 'https://images.unsplash.com/photo-1606800052052-a08af7148866?w=400&h=300&fit=crop'}" 
             alt="${item.name}"
             onerror="this.src='https://images.unsplash.com/photo-1606800052052-a08af7148866?w=400&h=300&fit=crop'">
        <div class="equipment-badge">${item.category || 'Professional'}</div>
      </div>
      <div class="equipment-content">
        <h3>${item.name}</h3>
        <p>${item.description}</p>
      </div>
    </div>
  `).join('');
  
  updateEquipmentDots();
}

function setupEquipmentSlider() {
  const totalPages = Math.ceil(allEquipment.length / itemsPerPage);
  
  // Create dots
  const dotsContainer = document.getElementById('equipment-dots');
  dotsContainer.innerHTML = '';
  
  for (let i = 0; i < totalPages; i++) {
    const dot = document.createElement('div');
    dot.className = `slider-dot ${i === 0 ? 'active' : ''}`;
    dot.addEventListener('click', () => goToEquipmentPage(i));
    dotsContainer.appendChild(dot);
  }
  
  // Arrow navigation
  document.getElementById('equipment-prev').addEventListener('click', () => {
    if (currentEquipmentPage > 0) {
      currentEquipmentPage--;
      renderEquipmentPage();
    }
  });
  
  document.getElementById('equipment-next').addEventListener('click', () => {
    if (currentEquipmentPage < totalPages - 1) {
      currentEquipmentPage++;
      renderEquipmentPage();
    }
  });
  
  // Drag/swipe functionality
  setupEquipmentDragSwipe();
}

function goToEquipmentPage(page) {
  currentEquipmentPage = page;
  renderEquipmentPage();
}

function updateEquipmentDots() {
  const dots = document.querySelectorAll('#equipment-dots .slider-dot');
  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index === currentEquipmentPage);
  });
}

function setupEquipmentDragSwipe() {
  const wrapper = document.querySelector('.equipment-slider-wrapper');
  let isDown = false;
  let startX;
  let scrollLeft;
  
  wrapper.addEventListener('mousedown', (e) => {
    isDown = true;
    startX = e.pageX - wrapper.offsetLeft;
    scrollLeft = wrapper.scrollLeft;
  });
  
  wrapper.addEventListener('mouseleave', () => {
    isDown = false;
  });
  
  wrapper.addEventListener('mouseup', () => {
    isDown = false;
  });
  
  wrapper.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - wrapper.offsetLeft;
    const walk = (x - startX) * 2;
    
    if (Math.abs(walk) > 50) {
      if (walk < 0 && currentEquipmentPage < Math.ceil(allEquipment.length / itemsPerPage) - 1) {
        currentEquipmentPage++;
        renderEquipmentPage();
        isDown = false;
      } else if (walk > 0 && currentEquipmentPage > 0) {
        currentEquipmentPage--;
        renderEquipmentPage();
        isDown = false;
      }
    }
  });
  
  // Touch events for mobile
  let touchStartX = 0;
  let touchEndX = 0;
  
  wrapper.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  });
  
  wrapper.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleEquipmentSwipe();
  });
  
  function handleEquipmentSwipe() {
    const totalPages = Math.ceil(allEquipment.length / itemsPerPage);
    
    if (touchEndX < touchStartX - 50 && currentEquipmentPage < totalPages - 1) {
      currentEquipmentPage++;
      renderEquipmentPage();
    }
    
    if (touchEndX > touchStartX + 50 && currentEquipmentPage > 0) {
      currentEquipmentPage--;
      renderEquipmentPage();
    }
  }
}

// Load BTS images from Google Drive
async function loadBTSImages() {
  try {
    const res = await fetch('/api/bts-images');
    const data = await res.json();
    
    const grid = document.getElementById('bts-images-grid');
    
    if (data.images && data.images.length > 0) {
      grid.innerHTML = data.images.map((img, index) => `
        <div class="bts-image-card" style="--index: ${index}" onclick="openLightbox('${img.url}', '${img.name}')">
          <img src="${img.url}" alt="${img.name}" loading="lazy">
          <div class="bts-image-overlay">
            <h4>${img.name}</h4>
            <span>Behind The Scenes</span>
          </div>
        </div>
      `).join('');
    } else {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <div class="empty-state-icon">📸</div>
          <p>No BTS photos yet. Add Google Drive link via admin panel.</p>
        </div>
      `;
    }
  } catch (err) {
    console.error('Error loading BTS images:', err);
  }
}

// Load BTS videos from YouTube
async function loadBTSVideos() {
  try {
    const res = await fetch('/api/bts-videos');
    const videos = await res.json();
    
    const grid = document.getElementById('bts-videos-grid');
    
    if (videos && videos.length > 0) {
      grid.innerHTML = videos.map((video, index) => `
        <div class="bts-video-card" style="--index: ${index}">
          <div class="video-wrapper">
            <iframe 
              src="https://www.youtube-nocookie.com/embed/${video.youtube_id}?rel=0&modestbranding=1" 
              frameborder="0" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
              allowfullscreen
              loading="lazy"
              title="${video.title}">
            </iframe>
          </div>
          <div class="bts-video-info">
            <h4>${video.title}</h4>
            <p>Behind The Scenes</p>
          </div>
        </div>
      `).join('');
    } else {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 3rem;">
          <div class="empty-state-icon" style="font-size: 4rem; margin-bottom: 1rem;">🎬</div>
          <h3 style="color: var(--gold); margin-bottom: 1rem;">Add Your Behind The Scenes Videos</h3>
          <p style="color: rgba(255,255,255,0.7); margin-bottom: 1.5rem; max-width: 600px; margin-left: auto; margin-right: auto;">
            Showcase your professional workflow and creative process by adding YouTube videos of your behind-the-scenes content.
          </p>
          <div style="background: rgba(255,215,0,0.1); border: 1px solid var(--gold); border-radius: 10px; padding: 1.5rem; max-width: 700px; margin: 0 auto; text-align: left;">
            <h4 style="color: var(--gold); margin-bottom: 1rem;">📝 How to Add BTS Videos:</h4>
            <ol style="color: rgba(255,255,255,0.8); line-height: 1.8; padding-left: 1.5rem;">
              <li>Upload your video to YouTube</li>
              <li>Go to YouTube Studio → Video Details</li>
              <li>Click "Show More" and check <strong>"Allow embedding"</strong></li>
              <li>Copy the video URL</li>
              <li>Go to <a href="/admin.html" style="color: var(--gold);">Admin Panel</a> → About Page tab</li>
              <li>Paste the URL in BTS Videos section</li>
            </ol>
            <p style="color: #ff6b6b; margin-top: 1rem; font-size: 0.9rem;">
              ⚠️ <strong>Important:</strong> Videos must have embedding enabled or they will show "Error 153"
            </p>
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.error('Error loading BTS videos:', err);
  }
}

// Lightbox function (reuse from main site)
function openLightbox(url, title) {
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML = `
    <div class="lightbox-content">
      <img src="${url}" alt="${title}">
      <button class="lightbox-close" onclick="closeLightbox()">×</button>
    </div>
  `;
  
  lightbox.addEventListener('click', (e) => {
    if (e.target.classList.contains('lightbox')) {
      closeLightbox();
    }
  });
  
  document.body.appendChild(lightbox);
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lightbox = document.querySelector('.lightbox');
  if (lightbox) {
    lightbox.remove();
    document.body.style.overflow = 'auto';
  }
}

// Close lightbox on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeLightbox();
  }
});

// Counter Animation
function initCounterAnimation() {
  const counters = document.querySelectorAll('.stat-number');
  const speed = 200; // Animation speed
  
  const animateCounter = (counter) => {
    const target = +counter.getAttribute('data-target');
    const increment = target / speed;
    let current = 0;
    
    const updateCounter = () => {
      current += increment;
      if (current < target) {
        counter.textContent = Math.ceil(current);
        requestAnimationFrame(updateCounter);
      } else {
        counter.textContent = target;
      }
    };
    
    updateCounter();
  };
  
  // Intersection Observer for counter animation
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const counter = entry.target;
        if (counter.textContent === '0') {
          animateCounter(counter);
        }
        observer.unobserve(counter);
      }
    });
  }, { threshold: 0.5 });
  
  counters.forEach(counter => {
    observer.observe(counter);
  });
}

// Add animation on scroll
const observeElements = () => {
  const elements = document.querySelectorAll('.equipment-card, .bts-image-card, .bts-video-card, .stat-card');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });
  
  elements.forEach(el => observer.observe(el));
};

// Initialize on load
window.addEventListener('load', observeElements);

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
