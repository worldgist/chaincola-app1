# Supabase Migrations

This directory contains SQL migration files for the Supabase database.

## How to Apply Migrations

### Option 1: Using Supabase CLI (Recommended)

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Link your project:
   ```bash
   supabase link --project-ref slleojsdpctxhlsoyenr
   ```

3. Apply migrations:
   ```bash
   supabase db push
   ```

### Option 2: Using Supabase Dashboard

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **SQL Editor**
4. Copy the contents of the migration file
5. Paste and run the SQL in the SQL Editor

### Option 3: Using Supabase Migration API

You can also apply migrations programmatically using the Supabase Management API.

## Migration Files

### `20241220000000_create_user_profiles.sql`
Creates the `user_profiles` table with:
- User profile information (name, email, phone, address, bio, country)
- Referral code system
- Row Level Security (RLS) policies
- Automatic profile creation on user signup
- Automatic updated_at timestamp

### `20241220000001_add_pin_and_biometric_to_user_profiles.sql`
Adds PIN and biometric authentication fields:
- `hash_pin` - Stores hashed PIN for user authentication
- `enable_biometric` - Tracks if user has enabled biometric authentication
- Index on `enable_biometric` for performance

### `20241220000002_add_admin_role_to_user_profiles.sql`
Adds admin role and permissions:
- `is_admin` - Boolean flag for admin users
- `role` - Text field for role-based access (user, admin, moderator, etc.)
- RLS policies for admin access to all profiles
- Functions: `grant_admin_access()`, `revoke_admin_access()`

### `20241220000003_create_admin_user.sql`
Creates admin user setup (requires manual user creation first)

## Table Structure

```sql
user_profiles
├── id (UUID, Primary Key)
├── user_id (UUID, Unique, References auth.users)
├── email (TEXT, Unique)
├── full_name (TEXT)
├── phone_number (TEXT)
├── address (TEXT)
├── bio (TEXT)
├── country (TEXT)
├── referral_code (TEXT, Unique)
├── referred_by (TEXT)
├── avatar_url (TEXT)
├── hash_pin (TEXT) - Hashed PIN for authentication
├── enable_biometric (BOOLEAN) - Biometric authentication enabled
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

## Security

- Row Level Security (RLS) is enabled
- Users can only view/update their own profiles
- Service role has full access for admin operations

## Notes

- The migration includes a trigger that automatically creates a user profile when a new user signs up
- Referral codes are automatically generated from the user ID
- The `updated_at` field is automatically updated on row changes

