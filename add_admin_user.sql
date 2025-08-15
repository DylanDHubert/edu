-- Add an admin user to test the admin functionality
-- Replace with your actual admin email address

INSERT INTO admin_users (email, name, role)
VALUES ('admin@hhb.com', 'HHB Admin', 'admin')
ON CONFLICT (email) DO NOTHING;

-- ADD YOURSELF AS AN ADMIN - Replace 'your-email@domain.com' with your actual email
-- Uncomment and modify the line below with your email address:
-- INSERT INTO admin_users (email, name, role)
-- VALUES ('your-email@domain.com', 'Your Name', 'admin')
-- ON CONFLICT (email) DO NOTHING;

-- Example:
-- INSERT INTO admin_users (email, name, role)
-- VALUES ('dylan@example.com', 'Dylan Hubert', 'admin')
-- ON CONFLICT (email) DO NOTHING; 