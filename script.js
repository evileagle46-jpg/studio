const socket = (typeof io !== "undefined") ? io() : { on: () => {}, emit: () => {}, disconnect: () => {} };

// DOM Elements
const heroCarousel = document.getElementById('hero-carousel');
const portfolioGrid = document.getElementById('portfolio-grid');
const videoCarousel = document.getElementById('video-carousel');
const testimonialSlider = document.getElementById('testimonial-slider');
const contactForm = document.getElementById('contact-form');

// Load all data on start
loadAllData();
initOwnerImage();

// 🔄 Real-time listeners
socket.on('photos-updated', () => loadPhotos());
socket.on('videos-updated', () => loadVideos());
socket.on('testimonials-updated', () => loadTestimonials());
socket.on('media-categories-updated', () => {
  console.log('Media categories updated, reloading...');
  loadMediaGalleries();
});
socket.on('hero-images-updated', () => {
  console.log('Hero images updated, reloading...');
  loadHeroImages();
});
socket.on('owner-updated', () => {
  console.log('Owner updated, refreshing owner image...');
  initOwnerImage();
});

async function loadAllData() {
  await Promise.all([loadHeroImages(), loadMediaGalleries(), loadPhotos(), loadVideos(), loadTestimonials()]);
}

// Load hero carousel images from separate Google Drive folder
async function loadHeroImages() {
  try {
    const res = await fetch('/api/hero-drive-images');
    const data = await res.json();
    
    if (data.images && data.images.length > 0) {
      const heroImages = data.images.map(img => img.url);
      initHeroCarousel(heroImages);
    } else {
      console.log('No hero images configured, using default');
      // Fallback to a default placeholder
      initHeroCarousel([
        'https://via.placeholder.com/1920x1080/0a0a0a/D4AF37?text=Wedding+Studio+1',
        'https://via.placeholder.com/1920x1080/0a0a0a/D4AF37?text=Wedding+Studio+2',
        'https://via.placeholder.com/1920x1080/0a0a0a/D4AF37?text=Wedding+Studio+3'
      ]);
    }
  } catch (err) {
    console.error('Error loading hero images:', err);
  }
}

// ========================================
// MEDIA GALLERIES (Google Drive & YouTube)
// ========================================

async function loadMediaGalleries() {
  try {
    const res = await fetch('/api/media-categories');
    const categories = await res.json();
    
    // Separate image and video categories
    const imageCategories = categories.filter(c => c.media_type === 'image' && c.status);
    const videoCategories = categories.filter(c => c.media_type === 'video' && c.status);
    
    // Load category tabs
    loadCategoryTabs(imageCategories);
    
    // Load images from Google Drive
    if (imageCategories.length > 0) {
      await loadDriveGalleries(imageCategories);
    }
    
    // Load videos from YouTube
    if (videoCategories.length > 0) {
      await loadYouTubeGalleries(videoCategories);
    }
  } catch (err) {
    console.error('Error loading media galleries:', err);
  }
}

function loadCategoryTabs(categories) {
  const tabsContainer = document.getElementById('category-tabs');
  if (!tabsContainer) return;
  
  // Keep the "All" button and add dynamic category buttons
  const allButton = tabsContainer.querySelector('.tab[data-category="all"]');
  tabsContainer.innerHTML = '';
  
  if (allButton) {
    tabsContainer.appendChild(allButton);
  } else {
    tabsContainer.innerHTML = '<button class="tab active" data-category="all">All</button>';
  }
  
  // Add category buttons
  categories.forEach(category => {
    const button = document.createElement('button');
    button.className = 'tab';
    button.setAttribute('data-category', category.category_name);
    button.textContent = category.category_name;
    button.onclick = function() {
      filterByCategory(category.category_name);
    };
    tabsContainer.appendChild(button);
  });
  
  // Re-attach click handler for "All" button
  const allBtn = tabsContainer.querySelector('.tab[data-category="all"]');
  if (allBtn) {
    allBtn.onclick = function() {
      filterByCategory('all');
    };
  }
  
  // Also load mega menu
  loadPortfolioMegaMenu(categories);
}

// Load Portfolio Mega Menu with categories and images
async function loadPortfolioMegaMenu(categories) {
  const megaMenu = document.getElementById('portfolio-categories-menu');
  if (!megaMenu) return;
  
  megaMenu.innerHTML = '';
  
  // Only show Gallery option (link to separate gallery page)
  const galleryItem = document.createElement('div');
  galleryItem.className = 'mega-category-item';
  galleryItem.onclick = () => {
    window.location.href = 'gallery.html';
  };
  galleryItem.innerHTML = `
    <div class="mega-category-images" style="background: linear-gradient(135deg, #FF6B9D, #C44569, #4ECDC4); display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
      <div style="position: absolute; font-size: 2rem; animation: float 3s ease-in-out infinite;">🎨</div>
      <div style="position: absolute; font-size: 1.5rem; animation: float 3s ease-in-out infinite 0.5s; left: 20%;">✨</div>
      <div style="position: absolute; font-size: 1.5rem; animation: float 3s ease-in-out infinite 1s; right: 20%;">🎉</div>
    </div>
    <div class="mega-category-info">
      <h4>Photo Albums</h4>
      <span class="mega-category-count">View Gallery</span>
    </div>
  `;
  megaMenu.appendChild(galleryItem);
}

// Initialize auto-sliding images for category on hover
function initCategoryImageSlider(categoryItem, imageCount) {
  let slideInterval = null;
  let currentIndex = 0;
  
  categoryItem.addEventListener('mouseenter', () => {
    const images = categoryItem.querySelectorAll('.mega-category-images img');
    
    // Start auto-slide
    slideInterval = setInterval(() => {
      images[currentIndex].classList.remove('active');
      currentIndex = (currentIndex + 1) % imageCount;
      images[currentIndex].classList.add('active');
    }, 800); // Change image every 800ms
  });
  
  categoryItem.addEventListener('mouseleave', () => {
    // Stop auto-slide
    if (slideInterval) {
      clearInterval(slideInterval);
      slideInterval = null;
    }
    
    // Reset to first image
    const images = categoryItem.querySelectorAll('.mega-category-images img');
    images.forEach((img, index) => {
      img.classList.toggle('active', index === 0);
    });
    currentIndex = 0;
  });
}

function filterByCategory(categoryName) {
  // Update active tab
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  const activeTab = document.querySelector(`.tab[data-category="${categoryName}"]`);
  if (activeTab) activeTab.classList.add('active');
  
  // Filter portfolio items
  const items = document.querySelectorAll('.portfolio-item');
  items.forEach(item => {
    const itemCategory = item.querySelector('.portfolio-overlay span')?.textContent;
    if (categoryName === 'all' || itemCategory === categoryName) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
}

async function loadDriveGalleries(categories) {
  const portfolioSlider = document.getElementById('portfolio-slider');
  const portfolioGrid = document.getElementById('portfolio-grid');
  
  if (!portfolioSlider) return;
  
  portfolioSlider.innerHTML = '<div style="width: 100%; text-align: center; padding: 40px;"><span class="loading"></span> Loading images...</div>';
  
  try {
    let allImages = [];
    
    for (const category of categories) {
      if (!category.drive_folder_id) continue;
      
      const res = await fetch(`/api/drive-images/${category.id}`);
      const data = await res.json();
      
      if (data.images && data.images.length > 0) {
        allImages = allImages.concat(data.images.map(img => ({
          ...img,
          category: category.category_name
        })));
      }
    }
    
    // Store all images globally for filtering
    window.allPortfolioImages = allImages;
    
    if (allImages.length === 0) {
      portfolioSlider.innerHTML = '<div style="width: 100%; text-align: center; padding: 40px; color: #999;">No images found. Please add photos in the admin panel.</div>';
      return;
    }
    
    // Display slider with images
    displayPortfolioSlider(allImages);
    
    // Display all images in grid (for modal)
    displayPortfolioGrid(allImages);
    
    // Initialize drag/swipe support for portfolio slider
    const portfolioSlider = document.getElementById('portfolio-slider');
    if (portfolioSlider) {
      initDragScroll(portfolioSlider, updateDots);
    }
  } catch (err) {
    console.error('Error loading Drive galleries:', err);
    portfolioSlider.innerHTML = '<div style="width: 100%; text-align: center; padding: 40px; color: #f44336;">Error loading images. Please check console.</div>';
  }
}

function displayPortfolioSlider(images) {
  const portfolioSlider = document.getElementById('portfolio-slider');
  const sliderDots = document.getElementById('slider-dots');
  
  if (!portfolioSlider) return;
  
  // Display all images in slider
  portfolioSlider.innerHTML = images.map((img, index) => `
    <div class="portfolio-slide" onclick="openLightbox('${img.url}', '${img.name}')">
      <img src="${img.url}" alt="${img.name}" loading="lazy" 
           onerror="this.src='https://via.placeholder.com/400x350?text=Image+Loading';">
      <div class="portfolio-slide-overlay">
        <h3>${img.name}</h3>
        <span>${img.category}</span>
      </div>
    </div>
  `).join('');
  
  // Create dots (one for every 4 images)
  const totalSlides = Math.ceil(images.length / 4);
  sliderDots.innerHTML = '';
  for (let i = 0; i < totalSlides; i++) {
    const dot = document.createElement('div');
    dot.className = `slider-dot ${i === 0 ? 'active' : ''}`;
    dot.onclick = () => goToSlide(i);
    sliderDots.appendChild(dot);
  }
  
  // Initialize slider position
  window.currentSlide = 0;
}

function displayPortfolioGrid(images) {
  const portfolioGrid = document.getElementById('portfolio-grid');
  if (!portfolioGrid) return;
  
  portfolioGrid.innerHTML = images.map(img => `
    <div class="portfolio-item" onclick="openLightbox('${img.url}', '${img.name}')">
      <img src="${img.url}" alt="${img.name}" loading="lazy" 
           onerror="this.src='https://via.placeholder.com/400x300?text=Image+Loading';">
      <div class="portfolio-overlay">
        <h3>${img.name}</h3>
        <span>${img.category}</span>
      </div>
    </div>
  `).join('');
}

function slidePortfolio(direction) {
  const slider = document.getElementById('portfolio-slider');
  const slideWidth = slider.querySelector('.portfolio-slide').offsetWidth + 32; // width + gap
  const slidesToShow = 4;
  const maxSlide = Math.ceil(slider.children.length / slidesToShow) - 1;
  
  window.currentSlide = (window.currentSlide || 0) + direction;
  
  if (window.currentSlide < 0) window.currentSlide = maxSlide;
  if (window.currentSlide > maxSlide) window.currentSlide = 0;
  
  slider.scrollTo({
    left: window.currentSlide * slideWidth * slidesToShow,
    behavior: 'smooth'
  });
  
  updateDots();
}

function goToSlide(slideIndex) {
  const slider = document.getElementById('portfolio-slider');
  const slideWidth = slider.querySelector('.portfolio-slide').offsetWidth + 32;
  const slidesToShow = 4;
  
  window.currentSlide = slideIndex;
  
  slider.scrollTo({
    left: slideIndex * slideWidth * slidesToShow,
    behavior: 'smooth'
  });
  
  updateDots();
}

function updateDots() {
  document.querySelectorAll('.slider-dot').forEach((dot, index) => {
    dot.classList.toggle('active', index === window.currentSlide);
  });
}

function showAllPhotos() {
  const modal = document.getElementById('full-portfolio-modal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeAllPhotos() {
  const modal = document.getElementById('full-portfolio-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
  }
}

function filterByCategory(categoryName) {
  // Update active tab
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  const activeTab = document.querySelector(`.tab[data-category="${categoryName}"]`);
  if (activeTab) activeTab.classList.add('active');
  
  // Filter images
  const allImages = window.allPortfolioImages || [];
  const filteredImages = categoryName === 'all' 
    ? allImages 
    : allImages.filter(img => img.category === categoryName);
  
  // Update slider and grid
  displayPortfolioSlider(filteredImages);
  displayPortfolioGrid(filteredImages);
}

async function loadYouTubeGalleries(categories) {
  const videoCarousel = document.getElementById('video-carousel');
  const videoDots = document.getElementById('video-dots');
  
  if (!videoCarousel) return;
  
  videoCarousel.innerHTML = '';
  
  // Store videos globally
  window.allVideos = [];
  
  categories.forEach(category => {
    if (!category.youtube_url) return;
    
    // Extract YouTube ID
    const youtubeId = extractYouTubeIdFromUrl(category.youtube_url);
    
    let videoHTML = '';
    
    if (youtubeId.type === 'playlist') {
      videoHTML = `
        <div class="video-item">
          <iframe 
            src="https://www.youtube-nocookie.com/embed/videoseries?list=${youtubeId.id}&rel=0&modestbranding=1&showinfo=0" 
            frameborder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
            class="youtube-embed"
            loading="lazy">
          </iframe>
          <div class="video-info">
            <h3>${category.category_name}</h3>
            <p>YouTube Playlist</p>
          </div>
        </div>
      `;
      window.allVideos.push({ category: category.category_name, type: 'playlist' });
    } else if (youtubeId.type === 'video') {
      videoHTML = `
        <div class="video-item">
          <iframe 
            src="https://www.youtube-nocookie.com/embed/${youtubeId.id}?rel=0&modestbranding=1&showinfo=0" 
            frameborder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
            class="youtube-embed"
            loading="lazy">
          </iframe>
          <div class="video-info">
            <h3>${category.category_name}</h3>
            <p>YouTube Video</p>
          </div>
        </div>
      `;
      window.allVideos.push({ category: category.category_name, type: 'video' });
    } else {
      // If URL parsing failed, show error message
      videoHTML = `
        <div class="video-item">
          <div style="background: rgba(244,67,54,0.1); border: 1px solid #f44336; border-radius: 16px; padding: 2rem; text-align: center; color: #f44336; min-height: 350px; display: flex; flex-direction: column; justify-content: center;">
            <h3>⚠️ Invalid YouTube URL</h3>
            <p>Category: ${category.category_name}</p>
            <p>URL: ${category.youtube_url}</p>
            <small>Please check the URL format in admin panel</small>
          </div>
        </div>
      `;
    }
    
    videoCarousel.innerHTML += videoHTML;
  });
  
  if (videoCarousel.innerHTML === '') {
    videoCarousel.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">No videos configured. Please add YouTube links in the admin panel.</div>';
  }
  
  // Create dots (one for every 3 videos)
  const itemsPerPage = 3;
  const totalPages = Math.ceil(window.allVideos.length / itemsPerPage);
  
  if (videoDots && totalPages > 1) {
    videoDots.innerHTML = '';
    for (let i = 0; i < totalPages; i++) {
      const dot = document.createElement('div');
      dot.className = `video-dot ${i === 0 ? 'active' : ''}`;
      dot.onclick = () => goToVideoSlide(i);
      videoDots.appendChild(dot);
    }
  }
  
  // Initialize slider position
  window.currentVideoSlide = 0;
  
  // Add drag/swipe support
  if (videoCarousel) {
    initDragScroll(videoCarousel, updateVideoDots);
  }
}

function slideVideos(direction) {
  const slider = document.getElementById('video-carousel');
  if (!slider || !slider.children.length) return;
  
  const slideWidth = slider.querySelector('.video-item').offsetWidth + 32; // width + gap
  const slidesToShow = 3;
  const maxSlide = Math.ceil(slider.children.length / slidesToShow) - 1;
  
  window.currentVideoSlide = (window.currentVideoSlide || 0) + direction;
  
  if (window.currentVideoSlide < 0) window.currentVideoSlide = maxSlide;
  if (window.currentVideoSlide > maxSlide) window.currentVideoSlide = 0;
  
  slider.scrollTo({
    left: window.currentVideoSlide * slideWidth * slidesToShow,
    behavior: 'smooth'
  });
  
  updateVideoDots();
}

function goToVideoSlide(slideIndex) {
  const slider = document.getElementById('video-carousel');
  if (!slider || !slider.children.length) return;
  
  const slideWidth = slider.querySelector('.video-item').offsetWidth + 32;
  const slidesToShow = 3;
  
  window.currentVideoSlide = slideIndex;
  
  slider.scrollTo({
    left: slideIndex * slideWidth * slidesToShow,
    behavior: 'smooth'
  });
  
  updateVideoDots();
}

function updateVideoDots() {
  document.querySelectorAll('.video-dot').forEach((dot, index) => {
    dot.classList.toggle('active', index === window.currentVideoSlide);
  });
}

function extractYouTubeIdFromUrl(url) {
  if (!url) return { type: null, id: null };
  
  // Clean the URL
  url = url.trim();
  
  // Playlist patterns (check first as they might also contain video IDs)
  const playlistPatterns = [
    /[?&]list=([a-zA-Z0-9_-]+)/,
    /youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/
  ];
  
  for (const pattern of playlistPatterns) {
    const match = url.match(pattern);
    if (match) return { type: 'playlist', id: match[1] };
  }
  
  // Video patterns
  const videoPatterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/ // Just the video ID
  ];
  
  for (const pattern of videoPatterns) {
    const match = url.match(pattern);
    if (match) return { type: 'video', id: match[1] };
  }
  
  return { type: null, id: null };
}

// Initialize owner image with fallback
function initOwnerImage() {
  const ownerImg = document.getElementById('owner-img');
  if (ownerImg) {
    // Load owner info from database
    loadOwnerData();
  }
}

// Load owner data from database
async function loadOwnerData() {
  try {
    const res = await fetch('/api/owner-info');
    const ownerData = await res.json();
    
    const ownerImg = document.getElementById('owner-img');
    
    if (ownerData.photo_url && ownerImg) {
      // Try to load the owner photo from database
      ownerImg.onerror = function() {
        this.onerror = null; // Prevent infinite loop
        // Create a professional placeholder with initials
        this.src = createOwnerPlaceholder(ownerData.name || 'Kamendra');
      };
      
      // Set the source with cache-busting timestamp
      ownerImg.src = ownerData.photo_url + '?' + new Date().getTime();
    } else if (ownerImg) {
      // No photo in database, use placeholder
      ownerImg.src = createOwnerPlaceholder(ownerData.name || 'Kamendra');
    }
    
    // Update owner information on the page if elements exist
    updateOwnerInfo(ownerData);
    
  } catch (err) {
    console.error('Error loading owner data:', err);
    const ownerImg = document.getElementById('owner-img');
    if (ownerImg) {
      ownerImg.src = createOwnerPlaceholder('Kamendra');
    }
  }
}

// Create owner placeholder SVG
function createOwnerPlaceholder(name) {
  const initial = name ? name.charAt(0).toUpperCase() : 'K';
  return 'data:image/svg+xml;base64,' + btoa(`
    <svg width="350" height="450" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#D4AF37;stop-opacity:0.8" />
          <stop offset="100%" style="stop-color:#F4D03F;stop-opacity:0.6" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <circle cx="175" cy="150" r="60" fill="rgba(255,255,255,0.9)"/>
      <text x="175" y="165" font-family="Arial, sans-serif" font-size="48" font-weight="bold" text-anchor="middle" fill="#0a0a0a">${initial}</text>
      <text x="175" y="280" font-family="Arial, sans-serif" font-size="24" font-weight="600" text-anchor="middle" fill="rgba(255,255,255,0.9)">${name.toUpperCase()}</text>
      <text x="175" y="310" font-family="Arial, sans-serif" font-size="16" text-anchor="middle" fill="rgba(255,255,255,0.8)">Wedding Photographer</text>
      <text x="175" y="380" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" fill="rgba(255,255,255,0.7)">📸 Master of Moments</text>
    </svg>
  `);
}

// Update owner information on the page
function updateOwnerInfo(ownerData) {
  // Update owner name
  const ownerNameEl = document.querySelector('.owner-title');
  if (ownerNameEl && ownerData.name) {
    ownerNameEl.innerHTML = `Meet <span class="gold">${ownerData.name}</span>`;
  }
  
  // Update owner title
  const ownerTitleEl = document.querySelector('.owner-subtitle');
  if (ownerTitleEl && ownerData.title) {
    ownerTitleEl.textContent = ownerData.title;
  }
  
  // Update statistics
  const experienceEl = document.querySelector('.stat-item:nth-child(2) .stat-number');
  if (experienceEl && ownerData.experience) {
    experienceEl.textContent = ownerData.experience + '+';
  }
  
  const weddingsEl = document.querySelector('.stat-item:nth-child(1) .stat-number');
  if (weddingsEl && ownerData.weddings_captured) {
    weddingsEl.textContent = ownerData.weddings_captured + '+';
  }
  
  // Update description
  const descriptionEls = document.querySelectorAll('.owner-description p');
  if (descriptionEls.length > 0 && ownerData.description) {
    const paragraphs = ownerData.description.split('\n\n');
    descriptionEls.forEach((el, index) => {
      if (paragraphs[index]) {
        el.textContent = paragraphs[index];
      }
    });
  }
  
  // Update quote
  const quoteEl = document.querySelector('.owner-quote blockquote');
  if (quoteEl && ownerData.quote) {
    quoteEl.textContent = ownerData.quote;
  }
}

async function loadPhotos() {
  const res = await fetch('/api/photos');
  const photos = await res.json();
  
  // Filter out photos with invalid URLs (text instead of URLs)
  const validPhotos = photos.filter(photo => {
    return photo.url && 
           (photo.url.startsWith('http') || 
            photo.url.startsWith('/uploads/') || 
            photo.url.startsWith('data:image'));
  });
  
  // Update portfolio
  portfolioGrid.innerHTML = validPhotos.map(photo => `
    <div class="portfolio-item" onclick="openLightbox('${photo.url}', '${photo.title}')">
      <img src="${photo.url}" alt="${photo.title}" loading="lazy" 
           onerror="this.onerror=null; this.src='https://via.placeholder.com/400x300?text=Image+Not+Found';">
      <div class="portfolio-overlay">
        <h3>${photo.title}</h3>
        <span>${photo.category}</span>
      </div>
    </div>
  `).join('');
}

async function loadVideos() {
  const res = await fetch('/api/videos');
  const videos = await res.json();
  
  videoCarousel.innerHTML = videos.map(video => `
    <div class="video-item">
      <video src="${video.url}" muted ${video.autoplay ? 'autoplay loop' : ''} 
             class="w-full h-64 object-cover rounded-2xl"></video>
      <div class="video-info">
        <h3>${video.title}</h3>
        <p>${video.description}</p>
      </div>
    </div>
  `).join('');
}

async function loadTestimonials() {
  const res = await fetch('/api/testimonials');
  const testimonials = await res.json();
  
  const testimonialSlider = document.getElementById('testimonial-slider');
  const testimonialDots = document.getElementById('testimonial-dots');
  
  if (!testimonialSlider) return;
  
  // Store testimonials globally
  window.allTestimonials = testimonials;
  
  // Display all testimonials in the slider
  testimonialSlider.innerHTML = testimonials.map(testimonial => {
    const photoUrl = testimonial.photo_url || createClientPlaceholder(testimonial.name);
    
    return `
      <div class="testimonial-card">
        <div class="stars">${'⭐'.repeat(testimonial.rating)}</div>
        <p>"${testimonial.review}"</p>
        <div class="client-info">
          <img src="${photoUrl}" 
               alt="${testimonial.name}" 
               class="client-photo"
               onerror="this.src='${createClientPlaceholder(testimonial.name)}'">
          <div>
            <h4>${testimonial.name}</h4>
            <p>Happy Couple</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Create dots (one for every 3 testimonials - 1 row × 3 columns)
  const itemsPerPage = 3;
  const totalPages = Math.ceil(testimonials.length / itemsPerPage);
  
  if (testimonialDots && totalPages > 1) {
    testimonialDots.innerHTML = '';
    for (let i = 0; i < totalPages; i++) {
      const dot = document.createElement('div');
      dot.className = `testimonial-dot ${i === 0 ? 'active' : ''}`;
      dot.onclick = () => goToTestimonialSlide(i);
      testimonialDots.appendChild(dot);
    }
  }
  
  // Initialize slider position
  window.currentTestimonialSlide = 0;
  
  // Add drag/swipe support
  initDragScroll(testimonialSlider, updateTestimonialDots);
}

function slideTestimonials(direction) {
  const slider = document.getElementById('testimonial-slider');
  if (!slider || !slider.children.length) return;
  
  const slideWidth = slider.querySelector('.testimonial-card').offsetWidth + 32; // width + gap
  const slidesToShow = 3;
  const maxSlide = Math.ceil(slider.children.length / slidesToShow) - 1;
  
  window.currentTestimonialSlide = (window.currentTestimonialSlide || 0) + direction;
  
  if (window.currentTestimonialSlide < 0) window.currentTestimonialSlide = maxSlide;
  if (window.currentTestimonialSlide > maxSlide) window.currentTestimonialSlide = 0;
  
  slider.scrollTo({
    left: window.currentTestimonialSlide * slideWidth * slidesToShow,
    behavior: 'smooth'
  });
  
  updateTestimonialDots();
}

function goToTestimonialSlide(slideIndex) {
  const slider = document.getElementById('testimonial-slider');
  if (!slider || !slider.children.length) return;
  
  const slideWidth = slider.querySelector('.testimonial-card').offsetWidth + 32;
  const slidesToShow = 3;
  
  window.currentTestimonialSlide = slideIndex;
  
  slider.scrollTo({
    left: slideIndex * slideWidth * slidesToShow,
    behavior: 'smooth'
  });
  
  updateTestimonialDots();
}

function updateTestimonialDots() {
  document.querySelectorAll('.testimonial-dot').forEach((dot, index) => {
    dot.classList.toggle('active', index === window.currentTestimonialSlide);
  });
}

// Create client placeholder image
function createClientPlaceholder(name) {
  const initial = name ? name.charAt(0).toUpperCase() : '👤';
  return 'data:image/svg+xml;base64,' + btoa(`
    <svg width="60" height="60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="clientBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#D4AF37;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#F4D03F;stop-opacity:1" />
        </linearGradient>
      </defs>
      <circle cx="30" cy="30" r="30" fill="url(#clientBg)"/>
      <text x="30" y="40" font-family="Arial, sans-serif" font-size="24" font-weight="bold" text-anchor="middle" fill="#0a0a0a">${initial}</text>
    </svg>
  `);
}

// Hero Carousel
function initHeroCarousel(images) {
  if (!images || images.length === 0) return;
  
  let current = 0;
  let isTransitioning = false;
  
  // Preload all images first
  const preloadedImages = [];
  let loadedCount = 0;
  
  images.forEach((imgSrc, index) => {
    const img = new Image();
    img.onload = () => {
      loadedCount++;
      preloadedImages[index] = imgSrc;
      
      // Start carousel when all images are loaded
      if (loadedCount === images.length) {
        startCarousel();
      }
    };
    img.onerror = () => {
      loadedCount++;
      // Use placeholder for failed images
      preloadedImages[index] = 'https://via.placeholder.com/1920x1080/0a0a0a/D4AF37?text=Wedding+Studio';
      
      if (loadedCount === images.length) {
        startCarousel();
      }
    };
    img.src = imgSrc;
  });
  
  function startCarousel() {
    // Create carousel HTML with proper positioning
    heroCarousel.innerHTML = preloadedImages.map((img, i) => 
      `<img src="${img}" class="hero-slide" style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: ${i === 0 ? 1 : 0};
        transition: opacity 1.5s ease-in-out;
      ">`
    ).join('');

    // Only start interval if we have multiple images
    if (preloadedImages.length > 1) {
      setInterval(() => {
        if (isTransitioning) return;
        
        isTransitioning = true;
        const slides = heroCarousel.querySelectorAll('.hero-slide');
        
        // Fade out current
        slides[current].style.opacity = '0';
        
        // Move to next
        current = (current + 1) % preloadedImages.length;
        
        // Fade in next after a brief delay
        setTimeout(() => {
          slides[current].style.opacity = '1';
          isTransitioning = false;
        }, 100);
        
      }, 4000); // Slightly faster transition
    }
  }
}

// Contact Form
contactForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = contactForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  
  try {
    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
    
    const formData = new FormData(contactForm);
    const data = Object.fromEntries(formData);
    
    console.log('Sending enquiry:', data);
    
    const response = await fetch('/api/enquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      alert('Thank you! Your enquiry has been sent successfully.');
      contactForm.reset();
    } else {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }
  } catch (error) {
    console.error('Enquiry submission error:', error);
    alert('Sorry, there was an error sending your enquiry. Please try again or contact us directly.');
  } finally {
    // Re-enable button
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

// Category Filter - Now handled by filterByCategory() function above

// Lightbox
function openLightbox(url, title) {
  // Remove any existing lightbox first
  const existingLightbox = document.querySelector('.lightbox');
  if (existingLightbox) {
    existingLightbox.remove();
  }
  
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML = `
    <div class="lightbox-content">
      <img src="${url}" alt="${title}">
      <button class="lightbox-close" onclick="closeLightbox()">×</button>
    </div>
  `;
  
  // Close on background click
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

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    document.querySelector(this.getAttribute('href')).scrollIntoView({
      behavior: 'smooth'
    });
  });
});

// ========================================
// DRAG/SWIPE FUNCTIONALITY FOR SLIDERS
// ========================================

function initDragScroll(element, onScrollEnd) {
  if (!element) return;
  
  let isDown = false;
  let startX;
  let scrollLeft;
  let velocity = 0;
  let lastX = 0;
  let lastTime = Date.now();

  // Mouse events
  element.addEventListener('mousedown', (e) => {
    isDown = true;
    element.style.cursor = 'grabbing';
    startX = e.pageX - element.offsetLeft;
    scrollLeft = element.scrollLeft;
    velocity = 0;
    lastX = e.pageX;
    lastTime = Date.now();
  });

  element.addEventListener('mouseleave', () => {
    isDown = false;
    element.style.cursor = 'grab';
  });

  element.addEventListener('mouseup', () => {
    isDown = false;
    element.style.cursor = 'grab';
    if (onScrollEnd) onScrollEnd();
  });

  element.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - element.offsetLeft;
    const walk = (x - startX) * 2;
    element.scrollLeft = scrollLeft - walk;
    
    // Calculate velocity
    const now = Date.now();
    const dt = now - lastTime;
    if (dt > 0) {
      velocity = (e.pageX - lastX) / dt;
    }
    lastX = e.pageX;
    lastTime = now;
  });

  // Touch events
  let touchStartX = 0;
  let touchScrollLeft = 0;

  element.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].pageX;
    touchScrollLeft = element.scrollLeft;
    velocity = 0;
    lastX = touchStartX;
    lastTime = Date.now();
  }, { passive: true });

  element.addEventListener('touchmove', (e) => {
    const touchX = e.touches[0].pageX;
    const walk = (touchStartX - touchX) * 1.5;
    element.scrollLeft = touchScrollLeft + walk;
    
    // Calculate velocity
    const now = Date.now();
    const dt = now - lastTime;
    if (dt > 0) {
      velocity = (touchX - lastX) / dt;
    }
    lastX = touchX;
    lastTime = now;
  }, { passive: true });

  element.addEventListener('touchend', () => {
    if (onScrollEnd) onScrollEnd();
  }, { passive: true });
}

// ========================================
// YOUTUBE ERROR HANDLING
// ========================================

// Handle YouTube iframe errors
function handleYouTubeError(iframe, category) {
  const videoItem = iframe.closest('.video-item');
  if (!videoItem) return;
  
  // Replace with error message and alternative link
  videoItem.innerHTML = `
    <div style="background: rgba(244,67,54,0.1); border: 1px solid #f44336; border-radius: 16px; padding: 2rem; text-align: center; color: #f44336; min-height: 300px; display: flex; flex-direction: column; justify-content: center;">
      <h3>⚠️ Video Unavailable</h3>
      <p>This video cannot be embedded due to YouTube restrictions.</p>
      <p><strong>Category:</strong> ${category.category_name}</p>
      <a href="${category.youtube_url}" target="_blank" class="btn-primary" style="margin-top: 1rem; display: inline-block;">
        🎥 Watch on YouTube
      </a>
      <small style="margin-top: 1rem; opacity: 0.7;">
        Error 153: Video may be restricted or private
      </small>
    </div>
  `;
}

// Add error handling to existing YouTube embeds
document.addEventListener('DOMContentLoaded', () => {
  // Monitor for YouTube iframe errors
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1 && node.tagName === 'IFRAME') {
          const iframe = node;
          if (iframe.src.includes('youtube')) {
            iframe.addEventListener('error', () => {
              console.log('YouTube iframe error detected');
              // Handle error here if needed
            });
          }
        }
      });
    });
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
});

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
