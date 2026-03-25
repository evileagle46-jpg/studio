const express = require('express');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
require('dotenv').config();

// Local uploads dir (used only in local dev, not on Vercel)
const uploadsDir = path.join(__dirname, 'uploads');
if (!process.env.VERCEL && !fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Google Drive API Configuration
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_s7LwWp1HXPIC@ep-red-mountain-ahv23ezx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});

const app = express();

// No-op emit (socket.io removed for Vercel serverless compatibility)
const io = { emit: () => {} };

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
if (!process.env.VERCEL) {
  app.use('/uploads', express.static(uploadsDir));
}

// Configure multer - memoryStorage works on both local and Vercel
const upload = multer({ storage: multer.memoryStorage() });

// Test DB
pool.query('SELECT NOW()', (err) => {
  if (err) console.error('❌ PostgreSQL failed:', err);
  else console.log('✅ PostgreSQL (Neon) connected!');
});

// Test endpoint to check database
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time, COUNT(*) as photo_count FROM photos');
    res.json({ success: true, time: result.rows[0].time, photoCount: result.rows[0].photo_count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// HELPER FUNCTIONS
// ========================================

// Extract Google Drive Folder ID from URL
function extractDriveFolderId(url) {
  if (!url) return null;
  
  // Handle different Google Drive URL formats
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,  // Standard folder URL
    /id=([a-zA-Z0-9_-]+)/,           // Query parameter format
    /^([a-zA-Z0-9_-]+)$/             // Direct ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

// Extract YouTube Video/Playlist ID from URL
function extractYouTubeId(url) {
  if (!url) return { type: null, id: null };
  
  // Playlist patterns
  const playlistPatterns = [
    /[?&]list=([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]+)$/  // Direct playlist ID
  ];
  
  for (const pattern of playlistPatterns) {
    const match = url.match(pattern);
    if (match && url.includes('list=')) {
      return { type: 'playlist', id: match[1] };
    }
  }
  
  // Video patterns
  const videoPatterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]{11})$/  // Direct video ID (11 chars)
  ];
  
  for (const pattern of videoPatterns) {
    const match = url.match(pattern);
    if (match) {
      return { type: 'video', id: match[1] };
    }
  }
  
  return { type: null, id: null };
}

// Fetch images from Google Drive folder using REST API (no SDK needed)
async function fetchDriveImages(folderId) {
  if (!folderId || !GOOGLE_API_KEY) return [];
  try {
    const q = encodeURIComponent(`'${folderId}' in parents and mimeType contains 'image/' and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&key=${GOOGLE_API_KEY}&fields=files(id,name,mimeType,webViewLink)&orderBy=createdTime+desc&pageSize=100`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) { console.error('Drive API error:', data.error.message); return []; }
    return (data.files || []).map(file => ({
      id: file.id,
      name: file.name,
      url: `https://lh3.googleusercontent.com/d/${file.id}`,
      thumbnail: `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`,
      viewLink: file.webViewLink,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`
    }));
  } catch (error) {
    console.error('Error fetching Drive images:', error.message);
    return [];
  }
}

// ========================================
// MEDIA CATEGORIES API (Google Drive & YouTube)
// ========================================

// Get all media categories
app.get('/api/media-categories', async (req, res) => {
  try {
    // Check if table exists first
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'media_categories'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.warn('media_categories table does not exist. Please run database.sql');
      return res.json([]);
    }
    
    const result = await pool.query('SELECT * FROM media_categories ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching media categories:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get images from a specific Google Drive folder
app.get('/api/drive-images/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    
    // Get category from database
    const result = await pool.query('SELECT drive_folder_id FROM media_categories WHERE id = $1 AND media_type = $2 AND status = true', [categoryId, 'image']);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    const folderId = result.rows[0].drive_folder_id;
    
    if (!folderId) {
      return res.json({ images: [], message: 'No folder configured' });
    }
    
    const images = await fetchDriveImages(folderId);
    
    // Add instructions if no images found
    if (images.length === 0) {
      return res.json({ 
        images: [], 
        message: 'No images found. Make sure: 1) Folder contains images, 2) Folder is set to "Anyone with link can view", 3) Individual files are also shared publicly' 
      });
    }
    
    res.json({ images });
  } catch (err) {
    console.error('Error fetching drive images:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create new media category
app.post('/api/media-categories', async (req, res) => {
  try {
    const { category_name, media_type, drive_folder_link, youtube_url, status } = req.body;
    
    if (!category_name || !media_type) {
      return res.status(400).json({ error: 'Category name and media type are required' });
    }
    
    let drive_folder_id = null;
    let youtube_id = null;
    let youtube_type = null;
    
    if (media_type === 'image' && drive_folder_link) {
      drive_folder_id = extractDriveFolderId(drive_folder_link);
      if (!drive_folder_id) {
        return res.status(400).json({ error: 'Invalid Google Drive folder link' });
      }
    }
    
    if (media_type === 'video' && youtube_url) {
      const extracted = extractYouTubeId(youtube_url);
      if (!extracted.id) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
      }
      youtube_id = extracted.id;
      youtube_type = extracted.type;
    }
    
    const result = await pool.query(
      'INSERT INTO media_categories (category_name, media_type, drive_folder_id, youtube_url, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [category_name, media_type, drive_folder_id, youtube_url, status !== false]
    );
    
    io.emit('media-categories-updated');
    res.json({ success: true, category: result.rows[0] });
  } catch (err) {
    console.error('Error creating media category:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update media category
app.put('/api/media-categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { category_name, media_type, drive_folder_link, youtube_url, status } = req.body;
    
    if (!category_name || !media_type) {
      return res.status(400).json({ error: 'Category name and media type are required' });
    }
    
    let drive_folder_id = null;
    let youtube_id = null;
    
    if (media_type === 'image' && drive_folder_link) {
      drive_folder_id = extractDriveFolderId(drive_folder_link);
      if (!drive_folder_id) {
        return res.status(400).json({ error: 'Invalid Google Drive folder link' });
      }
    }
    
    if (media_type === 'video' && youtube_url) {
      const extracted = extractYouTubeId(youtube_url);
      if (!extracted.id) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
      }
      youtube_id = extracted.id;
    }
    
    const result = await pool.query(
      'UPDATE media_categories SET category_name = $1, media_type = $2, drive_folder_id = $3, youtube_url = $4, status = $5, updated_at = NOW() WHERE id = $6 RETURNING *',
      [category_name, media_type, drive_folder_id, youtube_url, status !== false, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    io.emit('media-categories-updated');
    res.json({ success: true, category: result.rows[0] });
  } catch (err) {
    console.error('Error updating media category:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete media category
app.delete('/api/media-categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM media_categories WHERE id = $1', [id]);
    io.emit('media-categories-updated');
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting media category:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// 🎬 HERO CAROUSEL IMAGES
// ========================================

// Get hero images configuration
app.get('/api/hero-images', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM hero_images WHERE status = true ORDER BY created_at DESC LIMIT 1');
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('Error fetching hero images:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get images from hero Google Drive folder
app.get('/api/hero-drive-images', async (req, res) => {
  try {
    const heroConfig = await pool.query('SELECT * FROM hero_images WHERE status = true ORDER BY created_at DESC LIMIT 1');
    
    if (!heroConfig.rows[0] || !heroConfig.rows[0].drive_folder_id) {
      return res.json({ images: [] });
    }
    
    const folderId = heroConfig.rows[0].drive_folder_id;
    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'Google API key not configured' });
    }
    
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType+contains+'image/'&key=${apiKey}&fields=files(id,name,mimeType,webContentLink,thumbnailLink)`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error('Google Drive API error:', data.error);
      return res.status(500).json({ error: data.error.message });
    }
    
    const images = (data.files || []).map(file => ({
      id: file.id,
      name: file.name,
      url: `https://drive.google.com/thumbnail?id=${file.id}&sz=w2000`,
      thumbnail: file.thumbnailLink
    }));
    
    res.json({ images });
  } catch (err) {
    console.error('Error fetching hero Drive images:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create or update hero images configuration
app.post('/api/hero-images', async (req, res) => {
  try {
    const { drive_folder_link } = req.body;
    
    if (!drive_folder_link) {
      return res.status(400).json({ error: 'Drive folder link is required' });
    }
    
    // Extract folder ID from link
    let drive_folder_id = drive_folder_link;
    const folderIdMatch = drive_folder_link.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (folderIdMatch) {
      drive_folder_id = folderIdMatch[1];
    }
    
    // Deactivate all existing hero configurations
    await pool.query('UPDATE hero_images SET status = false');
    
    // Insert new configuration
    const result = await pool.query(
      'INSERT INTO hero_images (drive_folder_id, status) VALUES ($1, true) RETURNING *',
      [drive_folder_id]
    );
    
    io.emit('hero-images-updated');
    res.json({ success: true, config: result.rows[0] });
  } catch (err) {
    console.error('Error saving hero images:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete hero images configuration
app.delete('/api/hero-images/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM hero_images WHERE id = $1', [id]);
    io.emit('hero-images-updated');
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting hero images:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// 💰 PRICING PAGE
// ========================================

// Get pricing content
app.get('/api/pricing', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pricing_content ORDER BY id DESC LIMIT 1');
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('Error fetching pricing:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update pricing content
app.post('/api/pricing', async (req, res) => {
  try {
    const {
      hero_title,
      hero_subtitle,
      intro_heading,
      intro_text,
      details_heading,
      details_text,
      note_heading,
      note_text,
      image_url,
      pdf_url
    } = req.body;
    
    // Check if pricing content exists
    const existing = await pool.query('SELECT id FROM pricing_content LIMIT 1');
    
    let result;
    if (existing.rows.length > 0) {
      // Update existing
      result = await pool.query(
        `UPDATE pricing_content SET 
          hero_title = $1,
          hero_subtitle = $2,
          intro_heading = $3,
          intro_text = $4,
          details_heading = $5,
          details_text = $6,
          note_heading = $7,
          note_text = $8,
          image_url = $9,
          pdf_url = $10,
          updated_at = NOW()
        WHERE id = $11 RETURNING *`,
        [hero_title, hero_subtitle, intro_heading, intro_text, details_heading, details_text, note_heading, note_text, image_url, pdf_url, existing.rows[0].id]
      );
    } else {
      // Insert new
      result = await pool.query(
        `INSERT INTO pricing_content 
          (hero_title, hero_subtitle, intro_heading, intro_text, details_heading, details_text, note_heading, note_text, image_url, pdf_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [hero_title, hero_subtitle, intro_heading, intro_text, details_heading, details_text, note_heading, note_text, image_url, pdf_url]
      );
    }
    
    io.emit('pricing-updated');
    res.json({ success: true, pricing: result.rows[0] });
  } catch (err) {
    console.error('Error saving pricing:', err);
    res.status(500).json({ error: err.message });
  }
});

// Upload pricing image
app.post('/api/pricing/upload-image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(req.file.mimetype)) return res.status(400).json({ error: 'Only PNG and JPG images are allowed' });

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: 'image', folder: 'wedding/pricing' },
        (error, result) => error ? reject(error) : resolve(result)
      ).end(req.file.buffer);
    });
    res.json({ success: true, url: result.secure_url });
  } catch (err) {
    console.error('Error uploading pricing image:', err);
    res.status(500).json({ error: err.message });
  }
});

// Upload pricing PDF
app.post('/api/pricing/upload-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Only PDF files are allowed' });

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: 'raw', folder: 'wedding/pricing', format: 'pdf' },
        (error, result) => error ? reject(error) : resolve(result)
      ).end(req.file.buffer);
    });
    res.json({ success: true, url: result.secure_url });
  } catch (err) {
    console.error('Error uploading pricing PDF:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// 📷 ABOUT PAGE - EQUIPMENT & BTS
// ========================================

// Get all equipment
app.get('/api/equipment', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM equipment ORDER BY display_order, created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching equipment:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add equipment
app.post('/api/equipment', async (req, res) => {
  try {
    const { name, category, description, image_url, display_order } = req.body;
    
    const result = await pool.query(
      'INSERT INTO equipment (name, category, description, image_url, display_order) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, category, description, image_url, display_order || 0]
    );
    
    io.emit('about-updated');
    res.json({ success: true, equipment: result.rows[0] });
  } catch (err) {
    console.error('Error adding equipment:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update equipment
app.put('/api/equipment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, description, image_url, display_order } = req.body;
    
    const result = await pool.query(
      'UPDATE equipment SET name = $1, category = $2, description = $3, image_url = $4, display_order = $5 WHERE id = $6 RETURNING *',
      [name, category, description, image_url, display_order, id]
    );
    
    io.emit('about-updated');
    res.json({ success: true, equipment: result.rows[0] });
  } catch (err) {
    console.error('Error updating equipment:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete equipment
app.delete('/api/equipment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM equipment WHERE id = $1', [id]);
    io.emit('about-updated');
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting equipment:', err);
    res.status(500).json({ error: err.message });
  }
});

// Upload equipment image
app.post('/api/equipment/upload-image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(req.file.mimetype)) return res.status(400).json({ error: 'Only PNG and JPG images are allowed' });

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: 'image', folder: 'wedding/equipment' },
        (error, result) => error ? reject(error) : resolve(result)
      ).end(req.file.buffer);
    });
    res.json({ success: true, url: result.secure_url });
  } catch (err) {
    console.error('Error uploading equipment image:', err);
    res.status(500).json({ error: err.message });
  }
});

// BTS Images - Get configuration
app.get('/api/bts-images-config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bts_images WHERE status = true ORDER BY created_at DESC LIMIT 1');
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error('Error fetching BTS images config:', err);
    res.status(500).json({ error: err.message });
  }
});

// BTS Images - Get images from Google Drive
app.get('/api/bts-images', async (req, res) => {
  try {
    const config = await pool.query('SELECT * FROM bts_images WHERE status = true ORDER BY created_at DESC LIMIT 1');
    
    if (!config.rows[0] || !config.rows[0].drive_folder_id) {
      return res.json({ images: [] });
    }
    
    const folderId = config.rows[0].drive_folder_id;
    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'Google API key not configured' });
    }
    
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType+contains+'image/'&key=${apiKey}&fields=files(id,name,mimeType)`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }
    
    const images = (data.files || []).map(file => ({
      id: file.id,
      name: file.name,
      url: `https://drive.google.com/thumbnail?id=${file.id}&sz=w1000`
    }));
    
    res.json({ images });
  } catch (err) {
    console.error('Error fetching BTS images:', err);
    res.status(500).json({ error: err.message });
  }
});

// BTS Images - Save configuration
app.post('/api/bts-images', async (req, res) => {
  try {
    const { drive_folder_link } = req.body;
    
    if (!drive_folder_link) {
      return res.status(400).json({ error: 'Drive folder link is required' });
    }
    
    let drive_folder_id = drive_folder_link;
    const folderIdMatch = drive_folder_link.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (folderIdMatch) {
      drive_folder_id = folderIdMatch[1];
    }
    
    await pool.query('UPDATE bts_images SET status = false');
    
    const result = await pool.query(
      'INSERT INTO bts_images (drive_folder_id, status) VALUES ($1, true) RETURNING *',
      [drive_folder_id]
    );
    
    io.emit('about-updated');
    res.json({ success: true, config: result.rows[0] });
  } catch (err) {
    console.error('Error saving BTS images:', err);
    res.status(500).json({ error: err.message });
  }
});

// BTS Videos - Get all
app.get('/api/bts-videos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bts_videos ORDER BY display_order, created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching BTS videos:', err);
    res.status(500).json({ error: err.message });
  }
});

// BTS Videos - Add
app.post('/api/bts-videos', async (req, res) => {
  try {
    const { title, youtube_url, display_order } = req.body;
    
    // Extract YouTube ID
    const youtubeId = extractYouTubeVideoId(youtube_url);
    if (!youtubeId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    const result = await pool.query(
      'INSERT INTO bts_videos (title, youtube_url, youtube_id, display_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, youtube_url, youtubeId, display_order || 0]
    );
    
    io.emit('about-updated');
    res.json({ success: true, video: result.rows[0] });
  } catch (err) {
    console.error('Error adding BTS video:', err);
    res.status(500).json({ error: err.message });
  }
});

// BTS Videos - Delete
app.delete('/api/bts-videos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM bts_videos WHERE id = $1', [id]);
    io.emit('about-updated');
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting BTS video:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper function to extract YouTube video ID
function extractYouTubeVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

// ========================================
// 🎨 GALLERY / ALBUMS API
// ========================================

// Get all albums
app.get('/api/albums', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM albums WHERE status = true ORDER BY display_order, created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching albums:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get album photos from Google Drive
app.get('/api/albums/:id/photos', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('SELECT drive_folder_id FROM albums WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }
    
    const folderId = result.rows[0].drive_folder_id;
    
    if (!folderId) {
      return res.json({ photos: [] });
    }
    
    const photos = await fetchDriveImages(folderId);
    res.json({ photos });
  } catch (err) {
    console.error('Error fetching album photos:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create album
app.post('/api/albums', async (req, res) => {
  try {
    const { title, description, drive_folder_link, cover_image, display_order } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    let drive_folder_id = null;
    if (drive_folder_link) {
      drive_folder_id = extractDriveFolderId(drive_folder_link);
    }
    
    // Get photo count from Google Drive
    let photo_count = 0;
    if (drive_folder_id) {
      const photos = await fetchDriveImages(drive_folder_id);
      photo_count = photos.length;
    }
    
    const result = await pool.query(
      'INSERT INTO albums (title, description, drive_folder_id, cover_image, photo_count, display_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, description, drive_folder_id, cover_image, photo_count, display_order || 0]
    );
    
    io.emit('gallery-updated');
    res.json({ success: true, album: result.rows[0] });
  } catch (err) {
    console.error('Error creating album:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update album
app.put('/api/albums/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, drive_folder_link, cover_image, display_order, status } = req.body;
    
    let drive_folder_id = null;
    if (drive_folder_link) {
      drive_folder_id = extractDriveFolderId(drive_folder_link);
    }
    
    // Get photo count
    let photo_count = 0;
    if (drive_folder_id) {
      const photos = await fetchDriveImages(drive_folder_id);
      photo_count = photos.length;
    }
    
    const result = await pool.query(
      'UPDATE albums SET title = $1, description = $2, drive_folder_id = $3, cover_image = $4, photo_count = $5, display_order = $6, status = $7, updated_at = NOW() WHERE id = $8 RETURNING *',
      [title, description, drive_folder_id, cover_image, photo_count, display_order, status !== false, id]
    );
    
    io.emit('gallery-updated');
    res.json({ success: true, album: result.rows[0] });
  } catch (err) {
    console.error('Error updating album:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete album
app.delete('/api/albums/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM albums WHERE id = $1', [id]);
    io.emit('gallery-updated');
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting album:', err);
    res.status(500).json({ error: err.message });
  }
});

// 📸 PHOTOS
app.get('/api/photos', async (req, res) => {
  const result = await pool.query('SELECT * FROM photos ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/upload-photo', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { category, title } = req.body;
    if (!category || !title) return res.status(400).json({ error: 'Category and title are required' });

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: 'image', folder: `wedding/${category}`, public_id: title?.replace(/\s+/g, '_') },
        (error, result) => error ? reject(error) : resolve(result)
      ).end(req.file.buffer);
    });

    await pool.query('INSERT INTO photos (url, title, category) VALUES ($1, $2, $3)', [result.secure_url, title, category]);
    io.emit('photos-updated');
    res.json({ success: true, url: result.secure_url });
  } catch (err) {
    console.error('Upload photo error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload photo' });
  }
});

app.delete('/api/photos/:id', async (req, res) => {
  await pool.query('DELETE FROM photos WHERE id = $1', [req.params.id]);
  io.emit('photos-updated');
  res.json({ success: true });
});

// 🎥 VIDEOS
app.get('/api/videos', async (req, res) => {
  const result = await pool.query('SELECT * FROM videos ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/upload-video', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

    const { title, description, autoplay } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const allowedTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Invalid file type. Please upload MP4, AVI, MOV, WMV, or WebM.' });
    }

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: 'video', folder: 'wedding/videos', public_id: title?.replace(/\s+/g, '_'), chunk_size: 6000000 },
        (error, result) => error ? reject(error) : resolve(result)
      ).end(req.file.buffer);
    });

    await pool.query('INSERT INTO videos (url, title, description, autoplay) VALUES ($1, $2, $3, $4)',
      [result.secure_url, title, description || '', autoplay === 'true']);
    io.emit('videos-updated');
    res.json({ success: true, url: result.secure_url });
  } catch (err) {
    console.error('Video upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload video' });
  }
});

app.delete('/api/videos/:id', async (req, res) => {
  await pool.query('DELETE FROM videos WHERE id = $1', [req.params.id]);
  io.emit('videos-updated');
  res.json({ success: true });
});

// 💌 ENQUIRIES
app.get('/api/enquiries', async (req, res) => {
  const result = await pool.query('SELECT * FROM enquiries ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/enquiries', async (req, res) => {
  try {
    const { name, email, phone, wedding_date, message } = req.body;
    
    console.log('Received enquiry:', { name, email, phone, wedding_date, message });
    
    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }
    
    await pool.query(
      'INSERT INTO enquiries (name, email, phone, wedding_date, message) VALUES ($1, $2, $3, $4, $5)',
      [name, email, phone || null, wedding_date || null, message || '']
    );
    
    console.log('Enquiry saved successfully');
    res.json({ success: true, message: 'Enquiry received successfully' });
  } catch (error) {
    console.error('Error saving enquiry:', error);
    res.status(500).json({ error: 'Failed to save enquiry. Please try again.' });
  }
});

// ⭐ TESTIMONIALS
app.get('/api/testimonials', async (req, res) => {
  const result = await pool.query('SELECT * FROM testimonials ORDER BY order_num');
  res.json(result.rows);
});

app.post('/api/testimonials', async (req, res) => {
  const { name, review, rating, photo_url } = req.body;
  await pool.query(
    'INSERT INTO testimonials (name, review, rating, photo_url) VALUES ($1, $2, $3, $4)',
    [name, review, rating, photo_url]
  );
  io.emit('testimonials-updated');
  res.json({ success: true });
});

app.delete('/api/testimonials/:id', async (req, res) => {
  await pool.query('DELETE FROM testimonials WHERE id = $1', [req.params.id]);
  io.emit('testimonials-updated');
  res.json({ success: true });
});

// 🔐 ADMIN LOGIN
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === 'admin@studio.com' && password === 'admin123') {
    res.json({ token: 'admin-jwt-123', role: 'admin' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// 👤 OWNER PROFILE MANAGEMENT
app.post('/api/upload-owner-photo', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Please upload a valid image file' });

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { resource_type: 'image', folder: 'wedding/owner', public_id: 'owner-photo', overwrite: true,
          transformation: [{ width: 800, height: 1000, crop: 'limit', quality: 'auto' }] },
        (error, result) => error ? reject(error) : resolve(result)
      ).end(req.file.buffer);
    });
    const photoUrl = result.secure_url;

    const existingProfile = await pool.query('SELECT id FROM owner_profile LIMIT 1');
    if (existingProfile.rows.length > 0) {
      await pool.query('UPDATE owner_profile SET photo_url = $1, updated_at = NOW() WHERE id = $2', [photoUrl, existingProfile.rows[0].id]);
    } else {
      await pool.query(
        'INSERT INTO owner_profile (name, title, experience, weddings_captured, description, quote, photo_url) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        ['Kamendra', 'Your Wedding Story Architect', 10, 500,
          'With over a decade of experience capturing love stories across Nepal, Kamendra brings an artistic vision and passionate dedication to every wedding.',
          'Every wedding tells a unique story. My mission is to capture not just the moments, but the emotions, the laughter, the tears of joy.',
          photoUrl]
      );
    }

    io.emit('owner-updated');
    res.json({ success: true, message: 'Owner photo uploaded successfully', url: photoUrl });
  } catch (err) {
    console.error('Owner photo upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload owner photo' });
  }
});

app.delete('/api/delete-owner-photo', async (req, res) => {
  try {
    await pool.query('UPDATE owner_profile SET photo_url = NULL, updated_at = NOW()');
    io.emit('owner-updated');
    res.json({ success: true, message: 'Owner photo removed successfully' });
  } catch (err) {
    console.error('Owner photo delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to remove owner photo' });
  }
});

app.get('/api/owner-info', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM owner_profile ORDER BY created_at DESC LIMIT 1');
    
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      // Return default values if no profile exists
      res.json({
        name: 'Kamendra',
        title: 'Your Wedding Story Architect',
        experience: 10,
        weddings_captured: 500,
        description: 'With over a decade of experience capturing love stories across Nepal, Kamendra brings an artistic vision and passionate dedication to every wedding. His cinematic approach transforms your special moments into timeless masterpieces.\n\nSpecializing in candid emotions and dramatic storytelling, he has documented over 500+ weddings, creating visual poetry that couples treasure for a lifetime.',
        quote: 'Every wedding tells a unique story. My mission is to capture not just the moments, but the emotions, the laughter, the tears of joy - creating a visual legacy that will be cherished for generations.',
        photo_url: null
      });
    }
  } catch (err) {
    console.error('Error reading owner info:', err);
    res.status(500).json({ error: 'Failed to load owner information' });
  }
});

app.post('/api/update-owner-info', async (req, res) => {
  try {
    const { name, title, experience, weddings, description, quote } = req.body;
    
    // Validate required fields
    if (!name || !title || !experience || !weddings) {
      return res.status(400).json({ error: 'Name, title, experience, and weddings count are required' });
    }
    
    // Check if owner profile exists
    const existingProfile = await pool.query('SELECT id FROM owner_profile LIMIT 1');
    
    if (existingProfile.rows.length > 0) {
      // Update existing profile
      await pool.query(
        'UPDATE owner_profile SET name = $1, title = $2, experience = $3, weddings_captured = $4, description = $5, quote = $6, updated_at = NOW() WHERE id = $7',
        [name.trim(), title.trim(), parseInt(experience), parseInt(weddings), description ? description.trim() : '', quote ? quote.trim() : '', existingProfile.rows[0].id]
      );
    } else {
      // Insert new profile
      await pool.query(
        'INSERT INTO owner_profile (name, title, experience, weddings_captured, description, quote) VALUES ($1, $2, $3, $4, $5, $6)',
        [name.trim(), title.trim(), parseInt(experience), parseInt(weddings), description ? description.trim() : '', quote ? quote.trim() : '']
      );
    }
    
    console.log('Owner information updated successfully');
    
    // Emit socket event to update main website
    io.emit('owner-updated');
    
    res.json({ success: true, message: 'Owner information updated successfully' });
  } catch (err) {
    console.error('Error updating owner info:', err);
    res.status(500).json({ error: err.message || 'Failed to update owner information' });
  }
});

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Wedding Studio: http://localhost:${PORT}`);
    console.log(`📊 Admin: http://localhost:${PORT}/admin.html`);
  });
}

module.exports = app;
