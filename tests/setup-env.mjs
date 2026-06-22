// tests/setup-env.mjs — deterministic env for tests. Import FIRST in every test file.
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-0123456789abcdef';
process.env.OTP_SECRET = process.env.OTP_SECRET || 'test-otp-secret-fedcba9876543210';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';
process.env.ALLOWED_ORIGIN = 'https://palmist.getbriefed.to';
process.env.PUBLIC_BASE_URL = 'https://palmist.getbriefed.to';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy';
process.env.ADMIN_PRINCIPALS = 'email:admin@test.com,phone:+15005550006';
