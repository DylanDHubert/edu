-- Add an admin user to test the admin functionality
-- Replace with your actual admin email address

INSERT INTO admin_users (email, name, role)
VALUES ('admin@hhb.com', 'HHB Admin', 'admin')
ON CONFLICT (email) DO NOTHING;

-- You can also add yourself as an admin for testing:
-- INSERT INTO admin_users (email, name, role)
-- VALUES ('your-email@domain.com', 'Your Name', 'admin')
-- ON CONFLICT (email) DO NOTHING; 