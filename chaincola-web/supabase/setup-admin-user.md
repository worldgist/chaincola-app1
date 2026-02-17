# Setup Admin User

This guide will help you create the admin user `chaincolawallet@gmail.com` with full admin privileges.

## Step 1: Create User in Supabase Auth

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project (`slleojsdpctxhlsoyenr`)
3. Navigate to **Authentication** → **Users**
4. Click **Add User** → **Create New User**
5. Fill in:
   - **Email**: `chaincolawallet@gmail.com`
   - **Password**: `Salifu147@`
   - **Auto Confirm User**: ✅ (check this box)
6. Click **Create User**

## Step 2: Grant Admin Access

After the user is created, run this SQL in the Supabase SQL Editor:

```sql
SELECT public.grant_admin_access('chaincolawallet@gmail.com');
```

Or use the helper script:
- Open `/Applications/chaincola/chaincola-web/supabase/create-admin-user.sql`
- Copy and run in Supabase SQL Editor

## Step 3: Verify Admin Access

Run this query to verify:

```sql
SELECT 
  up.user_id,
  up.email,
  up.full_name,
  up.is_admin,
  up.role,
  au.email_confirmed_at,
  au.created_at
FROM public.user_profiles up
JOIN auth.users au ON au.id = up.user_id
WHERE up.email = 'chaincolawallet@gmail.com';
```

You should see:
- `is_admin`: `true`
- `role`: `admin`

## Step 4: Test Admin Login

1. Go to your admin login page: `http://localhost:3000/admin/login`
2. Login with:
   - Email: `chaincolawallet@gmail.com`
   - Password: `Salifu147@`

## Admin Privileges

The admin user now has:
- ✅ Full access to all user profiles
- ✅ Ability to view/update any user's data
- ✅ Access to admin dashboard
- ✅ All admin functions enabled

## Revoke Admin Access (if needed)

If you need to revoke admin access later:

```sql
SELECT public.revoke_admin_access('chaincolawallet@gmail.com');
```



















