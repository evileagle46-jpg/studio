const socket = (typeof io !== "undefined") ? io() : { on: () => {}, emit: () => {}, disconnect: () => {} };

let currentAlbumPhotos = [];
let currentPhotoIndex = 0;

// Load albums on page load
loadAlbums();

// Real-time listener
socket.on('gallery-updated', () => {
  console.log('Gallery updated, reloading...');
  loadAlbums();
});

// Load all albums
async function loadAlbums() {
  try {
    const res = await fetch('/api/albums');
    const albums = await res.json();
    
    const grid = document.getElementById('albums-grid');
    
    if (albums && albums.length > 0) {
      grid.innerHTML = albums.map((album, index) => `
        <div class="album-card" style="--index: ${index}" onclick="openAlbum(${album.id}, '${escapeHtml(album.title)}', '${escapeHtml(album.description)}')">
          <div class="album-cover">
            <img src="${album.cover_image || 'https://images.unsplash.com/photo-1519741497674-611481863552?w=600&h=400&fit=crop'}" 
                 loading="lazy"
                 alt="${album.title}"
                 onerror="this.src='https://images.unsplash.com/photo-1519741497674-611481863552?w=600&h=400&fit=crop'">
            <div class="album-photo-count">
              📸 ${album.photo_count || 0} Photos
            </div>
          </div>
          <div class="album-info">
            <h3 class="album-title">${album.title}</h3>
            <p class="album-description">${album.description}</p>
            <span class="album-view-btn">View Album ✨</span>
          </div>
        </div>
      `).join('');
    } else {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📸</div>
          <h3>No Albums Yet!</h3>
          <p>Albums will appear here once added via admin panel.</p>
        </div>
      `;
    }
  } catch (err) {
    console.error('Error loading albums:', err);
  }
}

// Open album modal
async function openAlbum(albumId, title, description) {
  try {
    const res = await fetch(`/api/albums/${albumId}/photos`);
    const data = await res.json();
    
    currentAlbumPhotos = data.photos || [];
    
    document.getElementById('modal-album-title').textContent = title;
    document.getElementById('modal-album-description').textContent = description;
    
    const photosGrid = document.getElementById('modal-photos-grid');
    
    if (currentAlbumPhotos.length > 0) {
      photosGrid.innerHTML = currentAlbumPhotos.map((photo, index) => `
        <div class="album-photo" style="--index: ${index}" onclick="openLightbox(${index})">
          <img data-src="${photo.url}" src="" alt="${photo.name}" loading="lazy"
               style="background:#1a1a2e; min-height:150px;"
               onerror="this.style.display='none'">
        </div>
      `).join('');
      // IntersectionObserver lazy load
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const img = e.target;
            img.src = img.dataset.src;
            observer.unobserve(img);
          }
        });
      }, { rootMargin: '200px' });
      photosGrid.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
    } else {
      photosGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📷</div>
          <p>No photos in this album yet.</p>
        </div>
      `;
    }
    
    document.getElementById('album-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
  } catch (err) {
    console.error('Error loading album photos:', err);
  }
}

// Close album modal
function closeAlbumModal() {
  document.getElementById('album-modal').classList.remove('active');
  document.body.style.overflow = 'auto';
}

// Open lightbox
function openLightbox(index) {
  currentPhotoIndex = index;
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  
  img.src = currentAlbumPhotos[currentPhotoIndex].url;
  lightbox.style.display = 'flex';
}

// Close lightbox
function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
}

// Previous photo
function prevPhoto() {
  currentPhotoIndex = (currentPhotoIndex - 1 + currentAlbumPhotos.length) % currentAlbumPhotos.length;
  document.getElementById('lightbox-img').src = currentAlbumPhotos[currentPhotoIndex].url;
}

// Next photo
function nextPhoto() {
  currentPhotoIndex = (currentPhotoIndex + 1) % currentAlbumPhotos.length;
  document.getElementById('lightbox-img').src = currentAlbumPhotos[currentPhotoIndex].url;
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  const lightbox = document.getElementById('lightbox');
  if (lightbox.style.display === 'flex') {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') prevPhoto();
    if (e.key === 'ArrowRight') nextPhoto();
  }
  
  const modal = document.getElementById('album-modal');
  if (modal.classList.contains('active') && e.key === 'Escape') {
    closeAlbumModal();
  }
});

// Close modal when clicking outside
document.getElementById('album-modal').addEventListener('click', (e) => {
  if (e.target.id === 'album-modal') {
    closeAlbumModal();
  }
});

document.getElementById('lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'lightbox') {
    closeLightbox();
  }
});

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Mobile Menu Toggle
function toggleMobileMenu() {
  const btn = document.querySelector('.mobile-menu-btn');
  const menu = document.getElementById('nav-menu');
  btn.classList.toggle('active');
  menu.classList.toggle('active');
}

// Close menu when clicking on a link
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
