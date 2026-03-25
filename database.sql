-- Run in Neon Dashboard: postgresql://neondb_owner:npg_s7LwWp1HXPIC@ep-red-mountain-ahv23ezx-pooler.c-3.us-east-1.aws.neon.tech/neondb

-- New media categories table for Google Drive and YouTube links
CREATE TABLE media_categories (
  id SERIAL PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL,
  media_type VARCHAR(10) CHECK (media_type IN ('image', 'video')),
  drive_folder_id VARCHAR(255),
  youtube_url VARCHAR(500),
  status BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Keep old tables for backward compatibility
CREATE TABLE photos (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  title VARCHAR(255),
  category VARCHAR(50) CHECK (category IN ('Wedding', 'Pre-Wedding', 'Candid', 'Cinematic')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE videos (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  title VARCHAR(255),
  description TEXT,
  autoplay BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE enquiries (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(20),
  wedding_date DATE,
  message TEXT,
  status VARCHAR(20) DEFAULT 'new',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE testimonials (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  review TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  photo_url TEXT,
  order_num INTEGER DEFAULT 0
);

CREATE TABLE owner_profile (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  title VARCHAR(200),
  experience INTEGER,
  weddings_captured INTEGER,
  description TEXT,
  quote TEXT,
  photo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert sample media categories
INSERT INTO media_categories (category_name, media_type, drive_folder_id, status) VALUES 
('Wedding Gallery', 'image', NULL, true),
('Pre-Wedding Shoots', 'image', NULL, true),
('Candid Moments', 'image', NULL, true);

INSERT INTO media_categories (category_name, media_type, youtube_url, status) VALUES 
('Wedding Films', 'video', NULL, true),
('Highlight Reels', 'video', NULL, true);

-- Demo Data (for backward compatibility)
INSERT INTO photos (url, title, category) VALUES 
('https://images.unsplash.com/photo-1519741497674-611481863552?w=800', 'Golden Moments', 'Wedding'),
('https://images.unsplash.com/photo-1565736660466-3b6a7126cd1b?w=800', 'Pre-Wedding Bliss', 'Pre-Wedding');

INSERT INTO testimonials (name, review, rating, photo_url, order_num) VALUES 
('Priya & Raj', 'Best wedding photographers! Captured every emotion perfectly.', 5, 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=200', 1);

-- Insert default owner profile
INSERT INTO owner_profile (name, title, experience, weddings_captured, description, quote) VALUES 
('Kamendra', 'Your Wedding Story Architect', 10, 500, 
'With over a decade of experience capturing love stories across Nepal, Kamendra brings an artistic vision and passionate dedication to every wedding. His cinematic approach transforms your special moments into timeless masterpieces.

Specializing in candid emotions and dramatic storytelling, he has documented over 500+ weddings, creating visual poetry that couples treasure for a lifetime.',
'Every wedding tells a unique story. My mission is to capture not just the moments, but the emotions, the laughter, the tears of joy - creating a visual legacy that will be cherished for generations.');


-- Hero carousel images table
CREATE TABLE hero_images (
  id SERIAL PRIMARY KEY,
  drive_folder_id VARCHAR(255),
  status BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Pricing page content table
CREATE TABLE pricing_content (
  id SERIAL PRIMARY KEY,
  hero_title VARCHAR(200) DEFAULT 'Our Pricing Plans',
  hero_subtitle VARCHAR(300) DEFAULT 'Choose the perfect package for your special day',
  intro_heading VARCHAR(200) DEFAULT 'Investment in Memories',
  intro_text TEXT,
  details_heading VARCHAR(200) DEFAULT 'What''s Included',
  details_text TEXT,
  note_heading VARCHAR(200) DEFAULT 'Custom Packages',
  note_text TEXT,
  image_url TEXT,
  pdf_url TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Equipment table
CREATE TABLE equipment (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  image_url TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BTS (Behind The Scenes) images configuration
CREATE TABLE bts_images (
  id SERIAL PRIMARY KEY,
  drive_folder_id VARCHAR(255),
  status BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BTS videos
CREATE TABLE bts_videos (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  youtube_url VARCHAR(500) NOT NULL,
  youtube_id VARCHAR(50),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
